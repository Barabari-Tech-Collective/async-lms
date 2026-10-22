require('dotenv').config();

const { getGoogleMeetConfig } = require('./config/googleMeet');
getGoogleMeetConfig();

const { Worker } = require('bullmq');
const {
  MEET_QUEUE_NAME,
  redisConnection,
} = require('./services/meetQueue.service');
const { GoogleMeetService, GoogleMeetError } = require('./services/googleMeet.service');
const {
  getMeetJob,
  getMeetJobAvailability,
  claimMeetJob,
  markMeetJobSucceeded,
  markMeetJobRetrying,
  markMeetJobFailed,
} = require('./services/meetJob.service');
const { createMeetJob } = require('./services/meetJob.service');
const { enqueueMeetJob } = require('./services/meetQueue.service');
const pool = require('./config/pg');

const WORKER_CONCURRENCY = parseInt(
  process.env.MEET_WORKER_CONCURRENCY || '2',
  10,
);
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

let googleMeetService;

function getService() {
  if (!googleMeetService) googleMeetService = new GoogleMeetService();
  return googleMeetService;
}

async function processMeetJob(job) {
  const meetJob = await getMeetJob(job.data.meetJobId);
  if (!meetJob) {
    throw new Error(`Meet job ${job.data.meetJobId} was not found`);
  }

  if (meetJob.state === 'succeeded') return;

  let claimedJob = await claimMeetJob(meetJob.id);
  while (!claimedJob) {
    const current = await getMeetJobAvailability(meetJob.id);
    if (!current) throw new Error(`Meet job ${meetJob.id} disappeared during claim`);
    if (current.state === 'succeeded' || current.state === 'running') return;
    if (current.state === 'retrying') {
      const waitMs = Math.max(
        new Date(current.available_at).getTime() - Date.now(),
        0,
      );
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      claimedJob = await claimMeetJob(meetJob.id);
      continue;
    }
    throw new Error(`Meet job ${meetJob.id} cannot be claimed from state ${current.state}`);
  }

  try {
    await executeOperation(claimedJob);
    await markMeetJobSucceeded(claimedJob.id);
  } catch (error) {
    const retryable =
      (error instanceof GoogleMeetError && error.retryable) ||
      isTransientInfrastructureError(error);
    const retryDelay = Math.min(
      5000 * 2 ** Math.max(claimedJob.attempt_count - 1, 0),
      MAX_RETRY_DELAY_MS,
    );

    if (retryable && job.attemptsMade + 1 < job.opts.attempts) {
      await markMeetJobRetrying(claimedJob.id, error, retryDelay);
      throw error;
    }

    await markMeetJobFailed(claimedJob.id, error);
    throw error;
  }
}

async function executeOperation(meetJob) {
  const service = getService();

  switch (meetJob.operation) {
    case 'create_meet_space':
      return createMeetSpace(meetJob, service);
    case 'end_meet_space':
      return endMeetSpace(meetJob, service);
    case 'sync_meet_sessions':
      return syncMeetSessions(meetJob, service);
    case 'calculate_attendance':
    case 'cleanup_memberships':
      throw new Error(`Meet operation is not implemented in Phase 2: ${meetJob.operation}`);
    default:
      throw new Error(`Unsupported Meet operation: ${meetJob.operation}`);
  }
}

async function createMeetSpace(meetJob, service) {
  const classResult = await pool.query(
    'SELECT id, meet_space_name, meet_uri FROM classes WHERE id = $1',
    [meetJob.class_id],
  );
  if (!classResult.rowCount) throw new Error(`Class ${meetJob.class_id} was not found`);

  const existing = classResult.rows[0];
  if (existing.meet_space_name && existing.meet_uri) return existing;

  const space = await service.createSpace();
  if (!space.name || !space.meetingUri) {
    throw new Error('Google Meet returned an incomplete space response');
  }

  const updateResult = await pool.query(
    `UPDATE classes
        SET meet_space_name = $2,
            meet_uri = $3,
            status = 'scheduled',
            updated_at = NOW()
      WHERE id = $1
        AND status = 'creating'`,
    [meetJob.class_id, space.name, space.meetingUri],
  );
  if (!updateResult.rowCount) {
    const current = await pool.query(
      'SELECT status, meet_space_name, meet_uri FROM classes WHERE id = $1',
      [meetJob.class_id],
    );
    const row = current.rows[0];
    if (row?.meet_space_name === space.name && row?.meet_uri === space.meetingUri) {
      return row;
    }
    throw new Error(
      `Class ${meetJob.class_id} changed state while Meet space was being created`,
    );
  }

  return space;
}

async function endMeetSpace(meetJob, service) {
  const result = await pool.query(
    'SELECT status, meet_space_name FROM classes WHERE id = $1',
    [meetJob.class_id],
  );
  if (!result.rowCount) throw new Error(`Class ${meetJob.class_id} was not found`);
  if (!result.rows[0].meet_space_name) {
    throw new Error(`Class ${meetJob.class_id} has no Meet space`);
  }

  if (['ended', 'sync_pending', 'processing', 'ready_for_review', 'finalised'].includes(result.rows[0].status)) {
    await enqueueSessionSync(meetJob.class_id);
    return;
  }

  await service.endActiveConference(result.rows[0].meet_space_name);
  const endResult = await pool.query(
    `UPDATE classes
        SET actual_end_at = COALESCE(actual_end_at, NOW()),
            status = 'sync_pending',
            updated_at = NOW()
      WHERE id = $1
        AND status NOT IN ('cancelled', 'finalised')
      RETURNING actual_end_at`,
    [meetJob.class_id],
  );
  if (!endResult.rowCount) {
    throw new Error(`Class ${meetJob.class_id} cannot be closed from its current state`);
  }
  await enqueueSessionSync(meetJob.class_id);
}

async function syncMeetSessions(meetJob, service) {
  const result = await pool.query(
    'SELECT meet_space_name, meet_uri FROM classes WHERE id = $1',
    [meetJob.class_id],
  );
  if (!result.rowCount) throw new Error(`Class ${meetJob.class_id} was not found`);
  if (!result.rows[0].meet_space_name || !result.rows[0].meet_uri) {
    throw new Error(`Class ${meetJob.class_id} has no Meet space`);
  }

  const meetingCode = getMeetingCode(result.rows[0].meet_uri);
  if (!meetingCode) {
    throw new Error(`Class ${meetJob.class_id} has no usable Meet code`);
  }

  const conferenceRecords = await service.listConferenceRecords({
    filter: `space.meeting_code = "${meetingCode}"`,
  });
  for (const conferenceRecord of conferenceRecords) {
    const participants = await service.listParticipants(conferenceRecord.name);
    for (const participant of participants) {
      const participantSessions = await service.listParticipantSessions(participant.name);
      for (const session of participantSessions) {
        await saveMeetSession(meetJob.class_id, conferenceRecord, participant, session);
      }
    }
  }
  return conferenceRecords;
}

async function saveMeetSession(classId, conferenceRecord, participant, session) {
  if (!session.startTime) return;
  const meetUserId = participant.signedinUser?.user || null;
  const participantType = meetUserId
    ? 'signed_in'
    : participant.anonymousUser
      ? 'anonymous'
      : participant.phoneUser
        ? 'phone'
        : 'unknown';
  const matched = meetUserId
    ? await pool.query(
        `SELECT cst.student_id
           FROM class_students cst
           JOIN student_google_identities sgi
             ON sgi.student_id = cst.student_id
            AND sgi.meet_user_id = $2
            AND sgi.status = 'verified'
          WHERE cst.class_id = $1
            AND cst.roster_status = 'eligible'
          LIMIT 1`,
        [classId, meetUserId],
      )
    : { rows: [] };
  const joinedAt = new Date(session.startTime);
  const leftAt = session.endTime ? new Date(session.endTime) : null;
  if (Number.isNaN(joinedAt.getTime()) || (leftAt && Number.isNaN(leftAt.getTime()))) {
    throw new Error(`Invalid participant session timestamps for ${session.name}`);
  }

  await pool.query(
    `INSERT INTO meet_sessions
       (class_id, conference_record_name, participant_name,
        participant_session_name, meet_user_id, matched_student_id,
        participant_type, joined_at, left_at, raw_participant_data, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (class_id, participant_session_name)
     DO UPDATE SET
       conference_record_name = EXCLUDED.conference_record_name,
       participant_name = EXCLUDED.participant_name,
       meet_user_id = EXCLUDED.meet_user_id,
       matched_student_id = EXCLUDED.matched_student_id,
       participant_type = EXCLUDED.participant_type,
       joined_at = EXCLUDED.joined_at,
       left_at = EXCLUDED.left_at,
       raw_participant_data = EXCLUDED.raw_participant_data,
       synced_at = NOW()`,
    [
      classId,
      conferenceRecord.name || null,
      participant.name || null,
      session.name,
      meetUserId,
      matched.rows[0]?.student_id || null,
      participantType,
      joinedAt,
      leftAt,
      participant,
    ],
  );
}

async function enqueueSessionSync(classId) {
  const syncJob = await createMeetJob({
    classId,
    operation: 'sync_meet_sessions',
    idempotencyKey: `class:${classId}:sync-meet-sessions`,
  });
  await enqueueMeetJob(syncJob);
}

function isTransientInfrastructureError(error) {
  return [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    '57P01',
    '55P03',
    '40001',
  ].includes(error?.code);
}

function getMeetingCode(meetingUri) {
  try {
    const url = new URL(meetingUri);
    return url.hostname === 'meet.google.com'
      ? url.pathname.replace(/^\/+/, '').split('/')[0]
      : null;
  } catch {
    return null;
  }
}

const worker = new Worker(MEET_QUEUE_NAME, processMeetJob, {
  connection: redisConnection,
  concurrency: WORKER_CONCURRENCY,
});

worker.on('completed', (job) => {
  console.log(`[meet-worker] completed job=${job.id} operation=${job.name}`);
});

worker.on('failed', (job, error) => {
  console.error(
    `[meet-worker] failed job=${job?.id || 'unknown'} operation=${job?.name || 'unknown'}: ${error.message}`,
  );
});

worker.on('error', (error) => {
  console.error(`[meet-worker] worker error: ${error.message}`);
});

process.on('SIGTERM', async () => {
  await worker.close();
  await redisConnection.quit();
  await pool.end();
  process.exit(0);
});

console.log(
  `[meet-worker] listening on ${MEET_QUEUE_NAME} with concurrency=${WORKER_CONCURRENCY}`,
);
