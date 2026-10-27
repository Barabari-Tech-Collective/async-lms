require('dotenv').config();

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
const { normalizeMeetUserId } = require('./utils/meetIdentity');

const WORKER_CONCURRENCY = parseInt(
  process.env.MEET_WORKER_CONCURRENCY || '2',
  10,
);
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;
const ATTENDANCE_SYNC_DELAY_MS = 30 * 1000;
const CONFERENCE_PRESTART_WINDOW_MS = 15 * 60 * 1000;
const PARTICIPANT_SESSION_CONCURRENCY = 5;

let googleMeetService;

function logTiming(operation, classId, stage, startedAt, details = {}) {
  console.info(JSON.stringify({
    component: 'meet-worker',
    operation,
    classId,
    stage,
    elapsedMilliseconds: Date.now() - startedAt,
    ...details,
  }));
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
}

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
    if (current.state === 'retrying' || current.state === 'pending') {
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
    if (claimedJob.operation === 'sync_meet_sessions') {
      await pool.query(
        `UPDATE classes
            SET status = 'failed', updated_at = NOW()
          WHERE id = $1 AND status = 'processing'`,
        [claimedJob.class_id],
      );
    }
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
    case 'cleanup_memberships':
      throw new Error(`Meet operation is not implemented in Phase 2: ${meetJob.operation}`);
    case 'calculate_attendance':
      throw new Error(`Meet operation is not implemented in Phase 2: ${meetJob.operation}`);
    default:
      throw new Error(`Unsupported Meet operation: ${meetJob.operation}`);
  }
}

async function createMeetSpace(meetJob, service) {
  const startedAt = Date.now();
  const classResult = await pool.query(
    `SELECT c.id, c.status, c.meet_space_name, c.meet_uri, c.facilitator_id, u.email AS facilitator_email
       FROM classes c
       JOIN users u ON u.id = c.facilitator_id
      WHERE c.id = $1`,
    [meetJob.class_id],
  );
  if (!classResult.rowCount) throw new Error(`Class ${meetJob.class_id} was not found`);

  const existing = classResult.rows[0];
  if (existing.meet_space_name && existing.meet_uri && existing.status === 'scheduled') {
    return existing;
  }

  let space = existing;
  if (!space.meet_space_name || !space.meet_uri) {
    const createStartedAt = Date.now();
    space = await service.createSpace();
    logTiming('create_meet_space', meetJob.class_id, 'google_meet_create', createStartedAt);
    if (!space.name || !space.meetingUri) {
      throw new Error('Google Meet returned an incomplete space response');
    }

    const persistSpaceStartedAt = Date.now();
    const persistResult = await pool.query(
      `UPDATE classes
          SET meet_space_name = $2,
              meet_uri = $3,
              updated_at = NOW()
        WHERE id = $1
          AND status = 'creating'`,
      [meetJob.class_id, space.name, space.meetingUri],
    );
    logTiming('create_meet_space', meetJob.class_id, 'space_persist', persistSpaceStartedAt);
    if (!persistResult.rowCount) {
      throw new Error(
        `Class ${meetJob.class_id} changed state while Meet space was being created`,
      );
    }
  } else {
    space = { name: space.meet_space_name, meetingUri: space.meet_uri };
  }

  const cohostStartedAt = Date.now();
  await service.addCohost(space.name, existing.facilitator_email);
  logTiming('create_meet_space', meetJob.class_id, 'google_meet_cohost', cohostStartedAt, {
    facilitatorEmail: existing.facilitator_email,
  });

  const updateStartedAt = Date.now();
  const updateResult = await pool.query(
    `UPDATE classes
        SET status = 'scheduled',
            updated_at = NOW()
      WHERE id = $1
        AND status = 'creating'`,
    [meetJob.class_id],
  );
  logTiming('create_meet_space', meetJob.class_id, 'class_persist', updateStartedAt);
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

  logTiming('create_meet_space', meetJob.class_id, 'total', startedAt);
  return space;
}

async function endMeetSpace(meetJob, service) {
  const startedAt = Date.now();
  const result = await pool.query(
    'SELECT status, meet_space_name FROM classes WHERE id = $1',
    [meetJob.class_id],
  );
  if (!result.rowCount) throw new Error(`Class ${meetJob.class_id} was not found`);
  if (!result.rows[0].meet_space_name) {
    throw new Error(`Class ${meetJob.class_id} has no Meet space`);
  }

  if (['ended', 'sync_pending', 'processing', 'ready_for_review', 'finalised'].includes(result.rows[0].status)) {
    console.info(JSON.stringify({
      component: 'meet-worker',
      operation: 'end_meet_space',
      classId: meetJob.class_id,
      stage: 'skip_already_ended',
      status: result.rows[0].status,
    }));
    return;
  }

  try {
    const endConferenceStartedAt = Date.now();
    await service.endActiveConference(result.rows[0].meet_space_name);
    logTiming('end_meet_space', meetJob.class_id, 'google_meet_end_conference', endConferenceStartedAt);
  } catch (error) {
    const status = error?.status ?? error?.cause?.response?.status;
    const message = error?.message || '';
    const isNoActiveConference =
      status === 400 &&
      /FAILED_PRECONDITION|no active conference|active conference/i.test(message);
    if (!isNoActiveConference) throw error;
    console.info(
      `[meet-worker] No active conference for ${result.rows[0].meet_space_name}; continuing attendance sync.`,
    );
  }
  const restrictStartedAt = Date.now();
  await service.restrictSpace(result.rows[0].meet_space_name);
  logTiming('end_meet_space', meetJob.class_id, 'google_meet_restrict_space', restrictStartedAt);

  const updateStartedAt = Date.now();
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
  logTiming('end_meet_space', meetJob.class_id, 'class_persist', updateStartedAt);
  if (!endResult.rowCount) {
    throw new Error(`Class ${meetJob.class_id} cannot be closed from its current state`);
  }
  await enqueueSessionSync(meetJob.class_id);
  logTiming('end_meet_space', meetJob.class_id, 'total', startedAt);
}

async function syncMeetSessions(meetJob, service) {
  const startedAt = Date.now();
  const result = await pool.query(
    `SELECT id, meet_space_name, meet_uri, scheduled_start_at, actual_end_at,
            status, conference_record_name
       FROM classes
      WHERE id = $1`,
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

  const processingResult = await pool.query(
    `UPDATE classes SET status = 'processing', updated_at = NOW()
      WHERE id = $1 AND status IN ('sync_pending', 'failed')`,
    [meetJob.class_id],
  );
  if (!processingResult.rowCount) {
    throw new Error(`Class ${meetJob.class_id} is no longer eligible for attendance synchronization`);
  }

  const conferenceRecords = await service.listConferenceRecords({
    filter: `space.meeting_code = "${meetingCode}"`,
  });
  logTiming('sync_meet_sessions', meetJob.class_id, 'conference_records', startedAt, {
    count: conferenceRecords.length,
  });
  const selected = selectConferenceRecord(conferenceRecords, result.rows[0]);
  if (!selected) {
    throw new GoogleMeetError(
      `No conference record matched class ${meetJob.class_id}; Google Meet data may not be ready`,
      { retryable: true },
    );
  }
  if (conferenceRecords.length > 1) {
    console.warn(`[meet-worker] Multiple conference records matched class ${meetJob.class_id}; selected ${selected.name}`);
  }
  await pool.query(
    `UPDATE classes SET conference_record_name = $2, updated_at = NOW() WHERE id = $1`,
    [meetJob.class_id, selected.name],
  );
  const participants = await service.listParticipants(selected.name);
  logTiming('sync_meet_sessions', meetJob.class_id, 'participants', startedAt, {
    count: participants.length,
  });
  const participantSessionStartedAt = Date.now();
  await mapWithConcurrency(
    participants,
    PARTICIPANT_SESSION_CONCURRENCY,
    async (participant) => {
      const participantSessions = await service.listParticipantSessions(participant.name);
      await saveMeetSessions(meetJob.class_id, selected, participant, participantSessions);
    },
  );
  logTiming('sync_meet_sessions', meetJob.class_id, 'participant_sessions', participantSessionStartedAt, {
    concurrency: PARTICIPANT_SESSION_CONCURRENCY,
  });
  await calculateAttendance(meetJob.class_id);
  logTiming('sync_meet_sessions', meetJob.class_id, 'attendance_calculated', startedAt);
  await pool.query(
    `UPDATE classes SET status = 'ended', updated_at = NOW()
      WHERE id = $1 AND status = 'processing'`,
    [meetJob.class_id],
  );
  logTiming('sync_meet_sessions', meetJob.class_id, 'total', startedAt);
  return selected;
}

function selectConferenceRecord(records, classRow) {
  if (classRow.conference_record_name) {
    return records.find((record) => record.name === classRow.conference_record_name) || null;
  }
  const scheduledStart = new Date(classRow.scheduled_start_at).getTime();
  const actualEnd = new Date(classRow.actual_end_at || Date.now()).getTime();
  const earliestStart = scheduledStart - CONFERENCE_PRESTART_WINDOW_MS;
  return records
    .map((record) => {
      const start = new Date(record.startTime || record.start_time || 0).getTime();
      const end = new Date(record.endTime || record.end_time || classRow.actual_end_at || 0).getTime();
      if (!record.name || !Number.isFinite(start) || !Number.isFinite(end) ||
          end < earliestStart || start > actualEnd) {
        return null;
      }
      const overlapStart = Math.max(start, scheduledStart);
      const overlapEnd = Math.min(end, actualEnd);
      return {
        record,
        overlap: Math.max(overlapEnd - overlapStart, 0),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.overlap - left.overlap)[0]?.record || null;
}

function getParticipantDisplayName(participant) {
  return participant.signedinUser?.displayName ||
    participant.anonymousUser?.displayName ||
    participant.phoneUser?.displayName ||
    null;
}

async function saveMeetSessions(classId, conferenceRecord, participant, sessions) {
  const validSessions = sessions.filter((session) => session.startTime);
  if (!validSessions.length) return;
  const meetUserId = normalizeMeetUserId(participant.signedinUser?.user);
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
  const values = [];
  const placeholders = [];
  for (const session of validSessions) {
    const joinedAt = new Date(session.startTime);
    const leftAt = session.endTime ? new Date(session.endTime) : null;
    if (Number.isNaN(joinedAt.getTime()) || (leftAt && Number.isNaN(leftAt.getTime()))) {
      throw new Error(`Invalid participant session timestamps for ${session.name}`);
    }
    const offset = values.length;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, ` +
      `$${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, NOW())`,
    );
    values.push(
      classId,
      conferenceRecord.name || null,
      getParticipantDisplayName(participant),
      session.name,
      meetUserId,
      matched.rows[0]?.student_id || null,
      participantType,
      joinedAt,
      leftAt,
      participant,
    );
  }

  await pool.query(
    `INSERT INTO meet_sessions
       (class_id, conference_record_name, participant_name,
        participant_session_name, meet_user_id, matched_student_id,
        participant_type, joined_at, left_at, raw_participant_data, synced_at)
     VALUES ${placeholders.join(', ')}
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
    values,
  );
}

async function enqueueSessionSync(classId) {
  const syncJob = await createMeetJob({
    classId,
    operation: 'sync_meet_sessions',
    idempotencyKey: `class:${classId}:sync-meet-sessions`,
    availableAt: new Date(Date.now() + ATTENDANCE_SYNC_DELAY_MS),
  });
  await enqueueMeetJob(syncJob, { delay: ATTENDANCE_SYNC_DELAY_MS });
}

async function calculateAttendance(classId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const classResult = await client.query(
      `SELECT scheduled_start_at, actual_end_at, attendance_threshold_percent
         FROM classes WHERE id = $1 FOR UPDATE`,
      [classId],
    );
    if (!classResult.rowCount || !classResult.rows[0].actual_end_at) {
      throw new Error(`Class ${classId} has no actual end time for attendance calculation`);
    }
    const classRow = classResult.rows[0];
    const windowStart = new Date(classRow.scheduled_start_at).getTime();
    const windowEnd = new Date(classRow.actual_end_at).getTime();
    const durationMinutes = Math.max((windowEnd - windowStart) / 60000, 0);
    if (!durationMinutes) throw new Error(`Class ${classId} has an invalid attendance window`);

    const [roster, sessions] = await Promise.all([
      client.query(
        `SELECT student_id FROM class_students
          WHERE class_id = $1 AND roster_status = 'eligible'`,
        [classId],
      ),
      client.query(
        `SELECT matched_student_id, joined_at, left_at
           FROM meet_sessions
          WHERE class_id = $1 AND matched_student_id IS NOT NULL
          ORDER BY matched_student_id, joined_at`,
        [classId],
      ),
    ]);
    const grouped = new Map();
    for (const session of sessions.rows) {
      const start = Math.max(new Date(session.joined_at).getTime(), windowStart);
      const end = Math.min(new Date(session.left_at || classRow.actual_end_at).getTime(), windowEnd);
      if (end <= start) continue;
      const intervals = grouped.get(session.matched_student_id) || [];
      intervals.push([start, end]);
      grouped.set(session.matched_student_id, intervals);
    }
    const studentIds = [];
    const minutesValues = [];
    const percentageValues = [];
    const statusValues = [];
    for (const student of roster.rows) {
      const intervals = (grouped.get(student.student_id) || []).sort((a, b) => a[0] - b[0]);
      let totalMs = 0;
      let current = null;
      for (const interval of intervals) {
        if (!current) {
          current = interval.slice();
        } else if (interval[0] <= current[1]) {
          current[1] = Math.max(current[1], interval[1]);
        } else {
          totalMs += current[1] - current[0];
          current = interval.slice();
        }
      }
      if (current) totalMs += current[1] - current[0];
      const minutes = Number((totalMs / 60000).toFixed(2));
      const percentage = Number(Math.min((minutes / durationMinutes) * 100, 100).toFixed(2));
      studentIds.push(student.student_id);
      minutesValues.push(minutes);
      percentageValues.push(percentage);
      statusValues.push(
        percentage >= Number(classRow.attendance_threshold_percent) ? 'present' : 'absent',
      );
    }
    if (studentIds.length) {
      await client.query(
        `INSERT INTO attendance
           (class_id, student_id, attended_minutes, attendance_percentage,
            attendance_status, calculated_at, updated_at)
         SELECT $1, student_id, attended_minutes, attendance_percentage,
                attendance_status, NOW(), NOW()
           FROM unnest(
             $2::uuid[], $3::numeric[], $4::numeric[], $5::text[]
           ) AS values(student_id, attended_minutes, attendance_percentage, attendance_status)
         ON CONFLICT (class_id, student_id)
         DO UPDATE SET attended_minutes = EXCLUDED.attended_minutes,
                       attendance_percentage = EXCLUDED.attendance_percentage,
                       attendance_status = EXCLUDED.attendance_status,
                       calculated_at = NOW(), updated_at = NOW()
         WHERE attendance.is_finalised = false`,
        [classId, studentIds, minutesValues, percentageValues, statusValues],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
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
