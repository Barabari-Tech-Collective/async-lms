const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
const { Pool } = require('pg');

let dbHost = (process.env.PGHOST || '').trim();
// Use Neon's connection pooler endpoint if using Neon to prevent cold-start ETIMEDOUT
if (dbHost.includes('.neon.tech') && !dbHost.includes('-pooler')) {
  const parts = dbHost.split('.');
  parts[0] = parts[0] + '-pooler';
  dbHost = parts.join('.');
}

let connectionString = (process.env.DATABASE_URL || '').trim();
if (connectionString && connectionString.includes('.neon.tech') && !connectionString.includes('-pooler')) {
  connectionString = connectionString.replace(/(@[a-zA-Z0-9_-]+)(\.c-[^/:]+)/, '$1-pooler$2');
}

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      connectionTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
      statement_timeout: 15000, // 15s max query execution before auto-cancellation
      query_timeout: 15000,
      keepAlive: true,
    }
  : {
      host: dbHost,
      database: (process.env.PGDATABASE || '').trim(),
      user: (process.env.PGUSER || '').trim(),
      password: (process.env.PGPASSWORD || '').trim(),
      port: process.env.PGPORT || 5432,
      ssl: { rejectUnauthorized: false },
      max: 20,
      connectionTimeoutMillis: 60000, // Allow 60s for Neon cold starts / wake-ups
      idleTimeoutMillis: 30000,
      statement_timeout: 15000, // 15s max query execution before auto-cancellation
      query_timeout: 15000,
      keepAlive: true,
    };

const pool = new Pool(poolConfig);

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

(async () => {
  let client;
  try {
    client = await pool.connect();
    // Accessing the host from the pool's own options
    const connectedHost = pool.options.host;
    const connectedDb = pool.options.database;

    console.log(`✅ Database connected to host: ${connectedHost}`);
    console.log(`📁 Target database: ${connectedDb}`);

    // Idempotent schema migrations
    await client.query(`
      INSERT INTO roles (role_key, role_name) 
      VALUES ('CURRICULUM_DEVELOPER', 'Curriculum Developer') 
      ON CONFLICT (role_key) DO NOTHING;
    `);
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text UNIQUE`,
    );
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);
    `);
    
    // Drop the standard unique constraint on email if it exists, and replace it
    // with a partial unique index active only for non-deleted users.
    await client.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active_unique 
      ON users(email) 
      WHERE deleted_at IS NULL;
    `);

    // 30-Day College Recycle Bin Migration
    await client.query(`
      ALTER TABLE colleges ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
      ALTER TABLE colleges ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_colleges_deleted_at ON colleges(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_colleges_is_deleted ON colleges(is_deleted);

      -- Drop unconditional unique constraints
      ALTER TABLE colleges DROP CONSTRAINT IF EXISTS colleges_short_code_key;
      ALTER TABLE colleges DROP CONSTRAINT IF EXISTS colleges_name_key;

      -- Create partial unique indexes active only for non-deleted colleges
      CREATE UNIQUE INDEX IF NOT EXISTS idx_colleges_name_active_unique 
      ON colleges(LOWER(TRIM(name))) 
      WHERE deleted_at IS NULL AND is_deleted = false;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_colleges_short_code_active_unique 
      ON colleges(LOWER(TRIM(short_code))) 
      WHERE short_code IS NOT NULL AND deleted_at IS NULL AND is_deleted = false;

      -- Backfill legacy soft-deleted rows
      UPDATE colleges SET deleted_at = NOW() WHERE is_deleted = true AND deleted_at IS NULL;
    `);

    // Add verification and token_version columns to users, and create otp_codes table
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS domain TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role_focus TEXT;
      
      CREATE TABLE IF NOT EXISTS otp_codes (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email       TEXT NOT NULL,
        otp_hash    TEXT NOT NULL,
        purpose     TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        expires_at  TIMESTAMPTZ NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_otp_lookup ON otp_codes(email, purpose, expires_at);
    `);

    await client.query(
      `ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`,
    );
    await client.query(
      `ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS submission_link text`,
    );
    // Ensure unique constraint on facilitator_colleges for upsert safety
    console.log('[Migration] Ensuring unique constraint on facilitator_colleges(facilitator_id, college_id)...');
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'facilitator_colleges'::regclass
            AND conname = 'facilitator_colleges_facilitator_id_college_id_key'
        ) THEN
          ALTER TABLE facilitator_colleges
            ADD CONSTRAINT facilitator_colleges_facilitator_id_college_id_key
            UNIQUE (facilitator_id, college_id);
          RAISE NOTICE '[Migration] Created unique constraint on facilitator_colleges.';
        END IF;
      END $$;
    `);
    console.log('[Migration] Ensuring progress_percent column on user_subjects...');
    await client.query(`
      ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS progress_percent INT NOT NULL DEFAULT 0;
    `);
    console.log('[Migration] Backfilling progress_percent for existing user_subjects rows...');
    await client.query(`
      WITH computed AS (
        SELECT 
          us.user_id,
          us.subject_id,
          ((SELECT COUNT(*) FROM lesson_content lc
            JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
            JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
            JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
            WHERE t.subject_id = us.subject_id AND lc.is_published = true AND lc.is_deleted = false) +
           (SELECT COUNT(*) FROM quizzes q
            JOIN units u ON q.unit_id = u.id AND u.is_deleted = false
            JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
            WHERE t.subject_id = us.subject_id AND q.is_deleted = false) +
           (SELECT COUNT(*) FROM exercises e
            JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
            JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
            JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
            WHERE t.subject_id = us.subject_id AND e.is_deleted = false) +
           (SELECT COUNT(*) FROM assignments a
            JOIN units u ON a.unit_id = u.id AND u.is_deleted = false
            JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
            WHERE t.subject_id = us.subject_id AND a.is_deleted = false) +
           (SELECT COUNT(*) FROM projects p
            JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
            WHERE t.subject_id = us.subject_id AND p.is_deleted = false)) AS total_items,

          ((SELECT COUNT(DISTINCT ulp.lesson_content_id) FROM user_lesson_progress ulp
            WHERE ulp.user_id = us.user_id AND ulp.is_completed = true 
              AND ulp.lesson_content_id IN (
                SELECT lc.id FROM lesson_content lc
                JOIN subtopics st ON lc.subtopic_id = st.id AND st.is_deleted = false
                JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
                JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
                WHERE t.subject_id = us.subject_id AND lc.is_published = true AND lc.is_deleted = false
              )) +
           (SELECT COUNT(DISTINCT qa.quiz_id) FROM quiz_attempts qa
            WHERE qa.user_id = us.user_id AND qa.is_passed = true
              AND qa.quiz_id IN (
                SELECT q.id FROM quizzes q
                JOIN units u ON q.unit_id = u.id AND u.is_deleted = false
                JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
                WHERE t.subject_id = us.subject_id AND q.is_deleted = false
              )) +
           (SELECT COUNT(DISTINCT es.exercise_id) FROM exercise_submissions es
            WHERE es.user_id = us.user_id AND es.is_passed = true
              AND es.exercise_id IN (
                SELECT e.id FROM exercises e
                JOIN subtopics st ON e.subtopic_id = st.id AND st.is_deleted = false
                JOIN units u ON st.unit_id = u.id AND u.is_deleted = false
                JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
                WHERE t.subject_id = us.subject_id AND e.is_deleted = false
              )) +
           (SELECT COUNT(DISTINCT asub.assignment_id) FROM assignment_submissions asub
            WHERE asub.user_id = us.user_id
              AND asub.assignment_id IN (
                SELECT a.id FROM assignments a
                JOIN units u ON a.unit_id = u.id AND u.is_deleted = false
                JOIN topics t ON u.topic_id = t.id AND t.is_deleted = false
                WHERE t.subject_id = us.subject_id AND a.is_deleted = false
              )) +
           (SELECT COUNT(DISTINCT ps.project_id) FROM project_submissions ps
            WHERE ps.user_id = us.user_id
              AND ps.project_id IN (
                SELECT p.id FROM projects p
                JOIN topics t ON p.topic_id = t.id AND t.is_deleted = false
                WHERE t.subject_id = us.subject_id AND p.is_deleted = false
              ))) AS completed_items
        FROM user_subjects us
      )
      UPDATE user_subjects us
      SET progress_percent = CASE 
        WHEN us.progress_percent IS NOT NULL THEN GREATEST(us.progress_percent, CASE WHEN c.total_items = 0 THEN 0 ELSE ROUND((c.completed_items::float / c.total_items) * 100)::int END)
        WHEN c.total_items = 0 THEN 0 
        ELSE ROUND((c.completed_items::float / c.total_items) * 100)::int 
      END
      FROM computed c
      WHERE us.user_id = c.user_id AND us.subject_id = c.subject_id;
    `);
    console.log('[Migration] progress_percent monotonic protection applied.');
    await client.query(
      `ALTER TABLE exercises ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]'::jsonb`,
    );
    await client.query(
      `ALTER TABLE exercises ADD COLUMN IF NOT EXISTS tasks JSONB DEFAULT '[]'::jsonb`,
    );
    await client.query(
      `ALTER TABLE projects ADD COLUMN IF NOT EXISTS instructions text`,
    );
    await client.query(
      `ALTER TABLE assignments ADD COLUMN IF NOT EXISTS rubric JSONB`,
    );
    await client.query(
      `ALTER TABLE exercises ADD COLUMN IF NOT EXISTS rubric JSONB`,
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS college_assignments (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        college_id   UUID NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
        created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
        title        TEXT NOT NULL,
        description  TEXT,
        due_date     TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE college_assignments ALTER COLUMN created_by DROP NOT NULL;
    `).catch((err) => console.warn('[Migration] college_assignments drop not null notice:', err.message));
    await client.query(`
      ALTER TABLE college_assignments 
      ADD COLUMN IF NOT EXISTS instruction_file_url TEXT,
      ADD COLUMN IF NOT EXISTS instruction_file_name TEXT,
      ADD COLUMN IF NOT EXISTS course TEXT DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rubric JSONB,
      ADD COLUMN IF NOT EXISTS evaluator_type TEXT,
      ADD COLUMN IF NOT EXISTS assignment_description TEXT,
      ADD COLUMN IF NOT EXISTS allowed_submission_types JSONB DEFAULT '["file", "github", "docs", "figma", "excel", "url"]'::jsonb;
    `);

    await client.query(`
      ALTER TABLE assignments
      ADD COLUMN IF NOT EXISTS allowed_submission_types JSONB DEFAULT '["github", "url"]'::jsonb;
    `);

    await client.query(`
      ALTER TABLE student_profiles
      ADD COLUMN IF NOT EXISTS current_academic_year TEXT,
      ADD COLUMN IF NOT EXISTS expected_graduation_year TEXT
    `);

    // Ensure it's casted to TEXT if it was previously created as INTEGER
    await client.query(`
      ALTER TABLE student_profiles 
      ALTER COLUMN expected_graduation_year TYPE TEXT USING expected_graduation_year::TEXT
    `);

    await client.query(`
      ALTER TABLE exercise_submissions ADD COLUMN IF NOT EXISTS feedback TEXT,
      ADD COLUMN IF NOT EXISTS test_results JSONB
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS college_assignment_submissions (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        assignment_id         UUID NOT NULL REFERENCES college_assignments(id) ON DELETE CASCADE,
        student_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        submission_type       TEXT DEFAULT 'file',
        submission_link       TEXT,
        submission_file_url   TEXT,
        submission_file_name  TEXT,
        submitted_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE college_assignment_submissions 
      ADD COLUMN IF NOT EXISTS submission_type TEXT DEFAULT 'file',
      ADD COLUMN IF NOT EXISTS submission_file_name TEXT;

      ALTER TABLE assignment_submissions 
      ADD COLUMN IF NOT EXISTS submission_type TEXT DEFAULT 'github',
      ADD COLUMN IF NOT EXISTS submission_file_url TEXT,
      ADD COLUMN IF NOT EXISTS submission_file_name TEXT;
    `);

    // Add unique constraint separately to be safe from existing tables
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_assignment_student'
        ) THEN
          ALTER TABLE college_assignment_submissions
            ADD CONSTRAINT unique_assignment_student UNIQUE (assignment_id, student_id);
        END IF;
      END $$;

      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_assignment_user'
        ) THEN
          ALTER TABLE assignment_submissions
            ADD CONSTRAINT unique_assignment_user UNIQUE (assignment_id, user_id);
        END IF;
      END $$;
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_college_assignments_college_id ON college_assignments(college_id);
       CREATE INDEX IF NOT EXISTS idx_cas_submission_type ON college_assignment_submissions(submission_type);`,
    );

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'project_submissions_project_user_unique'
        ) THEN
          ALTER TABLE project_submissions
            ADD CONSTRAINT project_submissions_project_user_unique UNIQUE (project_id, user_id);
        END IF;
      END $$
    `);

    // ── Notifications ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       TEXT NOT NULL,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL,
        link       TEXT,
        is_read    BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false`,
    );

    // ── AI Curriculum Builder ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_courses (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title               TEXT NOT NULL,
        domain              TEXT NOT NULL,
        role_focus          TEXT NOT NULL,
        jd_text             TEXT,
        skills              JSONB NOT NULL DEFAULT '[]',
        audience            TEXT NOT NULL,
        level               TEXT NOT NULL,
        learning_goal       TEXT NOT NULL,
        duration_weeks      INTEGER,
        daily_hours         NUMERIC(4,1),
        content_preference  TEXT,
        status              TEXT NOT NULL DEFAULT 'draft',
        created_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
        subject_id          UUID REFERENCES subjects(id) ON DELETE SET NULL,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_courses_created_by ON ai_courses(created_by)`,
    );
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_courses_status ON ai_courses(status)`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS use_master_video BOOLEAN NOT NULL DEFAULT false`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS master_video_url TEXT`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_course_modules (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id     UUID NOT NULL REFERENCES ai_courses(id) ON DELETE CASCADE,
        title         TEXT NOT NULL,
        description   TEXT,
        order_index   INTEGER NOT NULL DEFAULT 0,
        practice_tasks JSONB NOT NULL DEFAULT '[]',
        case_studies  JSONB NOT NULL DEFAULT '[]',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_modules_course_id ON ai_course_modules(course_id)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_course_topics (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module_id   UUID NOT NULL REFERENCES ai_course_modules(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        description TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_topics_module_id ON ai_course_topics(module_id)`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_course_lessons (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic_id             UUID NOT NULL REFERENCES ai_course_topics(id) ON DELETE CASCADE,
        title                TEXT NOT NULL,
        explanation          TEXT,
        example              TEXT,
        activity             TEXT,
        interview_questions  JSONB NOT NULL DEFAULT '[]',
        order_index          INTEGER NOT NULL DEFAULT 0,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_lessons_topic_id ON ai_course_lessons(topic_id)`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'video'`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS duration_mins INTEGER NOT NULL DEFAULT 15`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS video_url TEXT`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS exercise_data JSONB`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS resource_links JSONB DEFAULT '[]'::jsonb`,
    );

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_course_reviews (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id   UUID NOT NULL REFERENCES ai_courses(id) ON DELETE CASCADE,
        reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action      TEXT NOT NULL,
        feedback    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reviews_course_id ON ai_course_reviews(course_id)`,
    );
    await client.query(
      `ALTER TABLE ai_course_modules ADD COLUMN IF NOT EXISTS capstone_project JSONB`,
    );
    await client.query(
      `ALTER TABLE ai_course_topics ADD COLUMN IF NOT EXISTS assignment JSONB`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS capstone_project JSONB`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS audience TEXT[] DEFAULT '{}'`,
    );
    await client.query(
      `ALTER TABLE ai_course_topics ADD COLUMN IF NOT EXISTS quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN NOT NULL DEFAULT false`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ`,
    );
    await client.query(
      `ALTER TABLE ai_course_modules ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    );
    await client.query(
      `ALTER TABLE ai_course_topics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    );
    await client.query(
      `ALTER TABLE ai_course_lessons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    );

    // Last accessed tracking for "Continue Learning"
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS last_accessed_subtopic_slug TEXT`,
    );
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ`,
    );

    // Course Completion Lock & Progress Protection
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false`,
    );
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
    );
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS certificate_id UUID DEFAULT gen_random_uuid()`,
    );
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS certificate_issued_at TIMESTAMPTZ`,
    );
    await client.query(`
      UPDATE user_subjects 
      SET is_completed = true, 
          completed_at = COALESCE(completed_at, NOW()),
          certificate_issued_at = COALESCE(certificate_issued_at, completed_at, NOW())
      WHERE progress_percent >= 100 AND is_completed = false
    `);

    // High-performance partial indexes for high concurrency at scale
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_subjects_lookup 
        ON user_subjects(user_id, subject_id, is_completed);

      CREATE INDEX IF NOT EXISTS idx_ulp_completed 
        ON user_lesson_progress(user_id, lesson_content_id) 
        WHERE is_completed = true;

      CREATE INDEX IF NOT EXISTS idx_quiz_attempts_passed 
        ON quiz_attempts(user_id, quiz_id) 
        WHERE is_passed = true;

      CREATE INDEX IF NOT EXISTS idx_exercise_submissions_passed 
        ON exercise_submissions(user_id, exercise_id) 
        WHERE is_passed = true;
    `);

    // ── Video Recommendation Engine ─────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS channel_whitelist (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id  TEXT NOT NULL UNIQUE,
        channel_name TEXT NOT NULL,
        added_by    UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS video_pipeline_logs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        lesson_id       UUID REFERENCES ai_course_lessons(id) ON DELETE CASCADE,
        query_used      TEXT NOT NULL,
        videos_fetched  INTEGER NOT NULL DEFAULT 0,
        videos_passed   INTEGER NOT NULL DEFAULT 0,
        selected_url    TEXT,
        fallback_stage  INTEGER NOT NULL DEFAULT 0,
        error_message   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── Facilitator Subjects: Subject-level scoping ─────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS facilitator_subjects (
        id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        facilitator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        subject_id     UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        is_deleted     BOOLEAN NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE facilitator_subjects ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid = 'facilitator_subjects'::regclass
            AND conname = 'uq_facilitator_subject'
        ) THEN
          ALTER TABLE facilitator_subjects
            ADD CONSTRAINT uq_facilitator_subject UNIQUE (facilitator_id, subject_id);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_fac_subj_fac_id ON facilitator_subjects(facilitator_id) WHERE is_deleted = false;
      CREATE INDEX IF NOT EXISTS idx_fac_subj_subj_id ON facilitator_subjects(subject_id) WHERE is_deleted = false;
    `);

    // Backfill existing active facilitators so their existing dashboard is preserved (runs only on initial setup)
    await client.query(`
      ALTER TABLE facilitator_colleges ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false;
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM facilitator_subjects LIMIT 1) THEN
          INSERT INTO facilitator_subjects (facilitator_id, subject_id)
          SELECT DISTINCT fc.facilitator_id, us.subject_id
          FROM facilitator_colleges fc
          JOIN student_profiles sp ON sp.college_id = fc.college_id
          JOIN user_subjects us ON us.user_id = sp.user_id
          WHERE fc.is_deleted = false
          ON CONFLICT (facilitator_id, subject_id) DO NOTHING;
        END IF;
      END $$;
    `);

    // ── Soft delete: is_deleted flag on every table that previously used hard DELETE ──
    const softDeleteTables = [
      'topics', 'units', 'subtopics', 'lesson_content', 'quizzes',
      'quiz_questions', 'quiz_question_options', 'exercises', 'assignments',
      'projects', 'colleges', 'facilitator_colleges', 'ai_courses',
      'ai_course_modules', 'ai_course_topics', 'ai_course_lessons',
      'college_assignments', 'notifications', 'channel_whitelist',
      'student_projects', 'subjects', 'facilitator_subjects',
    ];
    for (const table of softDeleteTables) {
      await client.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false`,
      );
    }

    // ── Curriculum Developer domain & role_focus on users table ──
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS domain TEXT`,
    );
    await client.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS role_focus TEXT`,
    );

    // ── AI Course status & delta tracking columns ──
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS has_unpublished_changes BOOLEAN NOT NULL DEFAULT false`,
    );
    await client.query(
      `ALTER TABLE ai_courses ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ`,
    );

    // ── Ensure unique constraint on evaluation_results(evaluation_id, submission_id) ──
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evaluation_results') THEN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'evaluation_results'::regclass
              AND conname = 'uq_evaluation_results_eval_submission'
          ) THEN
            -- Safely deduplicate preserving completed submissions, highest marks, and newest rows
            DELETE FROM evaluation_results
            WHERE id IN (
              SELECT id FROM (
                SELECT id,
                       ROW_NUMBER() OVER (
                         PARTITION BY evaluation_id, submission_id
                         ORDER BY 
                           CASE 
                             WHEN status = 'completed' THEN 1 
                             WHEN status = 'failed' THEN 2 
                             ELSE 3 
                           END,
                           marks DESC,
                           created_at DESC
                       ) AS rn
                FROM evaluation_results
                WHERE evaluation_id IS NOT NULL AND submission_id IS NOT NULL
              ) ranked
              WHERE rn > 1
            );

            ALTER TABLE evaluation_results
              ADD CONSTRAINT uq_evaluation_results_eval_submission
              UNIQUE (evaluation_id, submission_id);
            RAISE NOTICE '[Migration] Created unique constraint on evaluation_results(evaluation_id, submission_id).';
          END IF;
        END IF;
      EXCEPTION
        WHEN others THEN
          RAISE NOTICE '[Migration] Skipping evaluation_results constraint: %', SQLERRM;
      END $$;
    `);

    // ── Capstone Projects: Evaluation attributes & Central Evaluator support ──
    await client.query(`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS evaluator_type TEXT;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS test_cases JSONB;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS rubric JSONB;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS max_score INTEGER DEFAULT 100;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS allowed_submission_types JSONB DEFAULT '["file", "github", "docs", "figma", "excel", "url"]'::jsonb;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evaluations') THEN
          ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await client.query(`
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS score NUMERIC;
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS rubric_breakdown JSONB;
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS execution_logs TEXT;
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS submission_type VARCHAR(20) DEFAULT 'github';
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS submission_file_url TEXT;
      ALTER TABLE project_submissions ADD COLUMN IF NOT EXISTS submission_file_name TEXT;
    `);

    // ── Google Meet attendance schema ───────────────────────────────────────
    // This migration is additive and leaves the legacy attendance tables unchanged.
    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TABLE IF NOT EXISTS student_google_identities (
          id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          meet_user_id        TEXT UNIQUE,
          google_email        TEXT,
          status              TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'verified', 'review_required', 'revoked')),
          verification_method TEXT,
          review_reason       TEXT,
          verified_at         TIMESTAMPTZ,
          revoked_at          TIMESTAMPTZ,
          created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS uq_student_active_google_identity
          ON student_google_identities(student_id)
          WHERE status <> 'revoked';
        CREATE INDEX IF NOT EXISTS idx_student_google_identities_status
          ON student_google_identities(status);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS classes (
          id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          subject_id                    UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
          facilitator_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          title                         TEXT NOT NULL,
          scheduled_start_at            TIMESTAMPTZ NOT NULL,
          planned_end_at                TIMESTAMPTZ NOT NULL,
          actual_end_at                 TIMESTAMPTZ,
          attendance_threshold_percent  NUMERIC(5, 2) NOT NULL DEFAULT 70
                                        CHECK (attendance_threshold_percent >= 0
                                               AND attendance_threshold_percent <= 100),
          grace_period_minutes          INTEGER NOT NULL DEFAULT 0
                                        CHECK (grace_period_minutes >= 0),
          policy_version                INTEGER NOT NULL DEFAULT 1
                                        CHECK (policy_version > 0),
          status                        TEXT NOT NULL DEFAULT 'creating'
                                        CHECK (status IN (
                                          'creating', 'scheduled', 'active', 'ending',
                                          'ended', 'sync_pending', 'processing',
                                          'ready_for_review', 'finalised',
                                          'cleanup_pending', 'end_unknown',
                                          'cancelled', 'failed'
                                        )),
          meet_space_name               TEXT,
          meet_uri                      TEXT,
          conference_record_name        TEXT,
          idempotency_key               TEXT NOT NULL UNIQUE,
          created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (planned_end_at > scheduled_start_at),
          CHECK (actual_end_at IS NULL OR actual_end_at >= scheduled_start_at)
        );

        CREATE INDEX IF NOT EXISTS idx_classes_subject_id
          ON classes(subject_id);
        CREATE INDEX IF NOT EXISTS idx_classes_facilitator_id
          ON classes(facilitator_id);
        CREATE INDEX IF NOT EXISTS idx_classes_status
          ON classes(status);
        CREATE INDEX IF NOT EXISTS idx_classes_scheduled_start
          ON classes(scheduled_start_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS class_students (
          class_id             UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
          student_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          source_subject_id    UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
          roster_status        TEXT NOT NULL DEFAULT 'eligible'
                               CHECK (roster_status IN ('eligible', 'removed')),
          roster_reason        TEXT,
          added_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          removed_at           TIMESTAMPTZ,
          PRIMARY KEY (class_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_class_students_student_id
          ON class_students(student_id);
        CREATE INDEX IF NOT EXISTS idx_class_students_class_status_student
          ON class_students(class_id, roster_status, student_id);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS class_access_tickets (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          class_id              UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
          student_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          ticket_hash           TEXT NOT NULL UNIQUE,
          issued_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expires_at            TIMESTAMPTZ NOT NULL,
          consumed_at           TIMESTAMPTZ,
          state                 TEXT NOT NULL DEFAULT 'issued'
                                CHECK (state IN ('issued', 'consumed', 'expired', 'rejected')),
          rejection_reason      TEXT,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (expires_at > issued_at)
        );

        CREATE INDEX IF NOT EXISTS idx_class_access_tickets_lookup
          ON class_access_tickets(class_id, student_id, state);
        CREATE INDEX IF NOT EXISTS idx_class_access_tickets_expiry
          ON class_access_tickets(expires_at);
      `);
      await client.query(`
        ALTER TABLE class_access_tickets
          DROP COLUMN IF EXISTS session_binding_hash;
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS class_access_events (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          class_id          UUID REFERENCES classes(id) ON DELETE RESTRICT,
          student_id        UUID REFERENCES users(id) ON DELETE RESTRICT,
          ticket_id         UUID REFERENCES class_access_tickets(id) ON DELETE SET NULL,
          event_type        TEXT NOT NULL,
          reason            TEXT,
          request_id        TEXT,
          ip_address        INET,
          user_agent        TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_class_access_events_class
          ON class_access_events(class_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_class_access_events_student
          ON class_access_events(student_id, created_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS meet_sessions (
          id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          class_id                   UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
          conference_record_name     TEXT,
          participant_name           TEXT,
          participant_session_name   TEXT NOT NULL,
          meet_user_id               TEXT,
          matched_student_id         UUID REFERENCES users(id) ON DELETE SET NULL,
          participant_type           TEXT,
          joined_at                  TIMESTAMPTZ NOT NULL,
          left_at                    TIMESTAMPTZ,
          raw_participant_data       JSONB,
          synced_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (class_id, participant_session_name),
          CHECK (left_at IS NULL OR left_at >= joined_at)
        );

        CREATE INDEX IF NOT EXISTS idx_meet_sessions_class
          ON meet_sessions(class_id);
        CREATE INDEX IF NOT EXISTS idx_meet_sessions_meet_user
          ON meet_sessions(meet_user_id);
        CREATE INDEX IF NOT EXISTS idx_meet_sessions_matched_student
          ON meet_sessions(matched_student_id);
        CREATE INDEX IF NOT EXISTS idx_meet_sessions_class_student_joined
          ON meet_sessions(class_id, matched_student_id, joined_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS attendance (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          class_id              UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
          student_id            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          attended_minutes      NUMERIC(10, 2) NOT NULL DEFAULT 0
                                CHECK (attended_minutes >= 0),
          attendance_percentage NUMERIC(5, 2)
                                CHECK (attendance_percentage IS NULL
                                       OR (attendance_percentage >= 0
                                           AND attendance_percentage <= 100)),
          attendance_status     TEXT
                                CHECK (attendance_status IS NULL
                                       OR attendance_status IN ('present', 'absent')),
          is_finalised          BOOLEAN NOT NULL DEFAULT false,
          review_required       BOOLEAN NOT NULL DEFAULT false,
          review_reason         TEXT,
          calculated_at         TIMESTAMPTZ,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (class_id, student_id)
        );

        CREATE INDEX IF NOT EXISTS idx_attendance_class
          ON attendance(class_id);
        CREATE INDEX IF NOT EXISTS idx_attendance_student
          ON attendance(student_id);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS attendance_overrides (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          attendance_id         UUID NOT NULL REFERENCES attendance(id) ON DELETE RESTRICT,
          previous_status       TEXT NOT NULL CHECK (previous_status IN ('present', 'absent')),
          new_status            TEXT NOT NULL CHECK (new_status IN ('present', 'absent')),
          reason                TEXT NOT NULL,
          actor_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_attendance_overrides_attendance
          ON attendance_overrides(attendance_id, created_at);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS meet_jobs (
          id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          class_id          UUID REFERENCES classes(id) ON DELETE RESTRICT,
          operation         TEXT NOT NULL
                            CHECK (operation IN (
                              'create_meet_space', 'end_meet_space',
                              'sync_meet_sessions', 'calculate_attendance',
                              'cleanup_memberships'
                            )),
          state             TEXT NOT NULL DEFAULT 'pending'
                            CHECK (state IN (
                              'pending', 'running', 'succeeded',
                              'failed', 'retrying', 'cancelled'
                            )),
          attempt_count     INTEGER NOT NULL DEFAULT 0
                            CHECK (attempt_count >= 0),
          available_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at        TIMESTAMPTZ,
          completed_at      TIMESTAMPTZ,
          idempotency_key   TEXT NOT NULL UNIQUE,
          error_summary     TEXT,
          created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_meet_jobs_ready
          ON meet_jobs(state, available_at);
        CREATE INDEX IF NOT EXISTS idx_meet_jobs_class
          ON meet_jobs(class_id);
      `);

      await client.query('COMMIT');
      console.log('[Migration] Google Meet attendance schema ready.');
    } catch (attendanceMigrationError) {
      await client.query('ROLLBACK');
      throw attendanceMigrationError;
    }

    // Ensure enrolled students receive course update notifications for recently updated subjects
    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT DISTINCT
        us.user_id,
        'course_update',
        'Course Updated: ' || s.name,
        'New curriculum materials and updates have been added to ' || s.name || '. Click to explore!',
        '/dashboard/student/courses/' || s.slug
      FROM user_subjects us
      JOIN subjects s ON s.id = us.subject_id
      WHERE s.is_published = true
        AND s.updated_at >= NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = us.user_id
            AND n.type = 'course_update'
            AND n.link = '/dashboard/student/courses/' || s.slug
            AND n.created_at >= NOW() - INTERVAL '7 days'
        )
      ON CONFLICT DO NOTHING;
    `).catch((err) => console.warn('[Migration] Course update notification sync notice:', err.message));

  } catch (error) {
    console.log('❌ Database connection Failed: ', error);
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
})();

module.exports = pool;
