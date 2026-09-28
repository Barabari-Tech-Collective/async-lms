const { Pool } = require('pg');
const pool = new Pool({
  host: (process.env.PGHOST || '').trim(),
  database: (process.env.PGDATABASE || '').trim(),
  user: (process.env.PGUSER || '').trim(),
  password: (process.env.PGPASSWORD || '').trim(),
  port: process.env.PGPORT,
  ssl: { rejectUnauthorized: false },
  family: 4,
  connectionTimeoutMillis: 30000, // Increased to 30s so sleeping Neon DBs have time to wake up!
  idleTimeoutMillis: 10000, // Close idle connections after 10s to prevent Neon pooler disconnects
  keepAlive: true,
});

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
        WHEN c.total_items = 0 THEN 0 
        ELSE ROUND((c.completed_items::float / c.total_items) * 100)::int 
      END
      FROM computed c
      WHERE us.user_id = c.user_id AND us.subject_id = c.subject_id;
    `);
    console.log('[Migration] progress_percent backfill complete.');
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
        created_by   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        title        TEXT NOT NULL,
        description  TEXT,
        due_date     TIMESTAMPTZ,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      ALTER TABLE college_assignments 
      ADD COLUMN IF NOT EXISTS instruction_file_url TEXT,
      ADD COLUMN IF NOT EXISTS instruction_file_name TEXT,
      ADD COLUMN IF NOT EXISTS course TEXT DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS test_cases JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS rubric JSONB,
      ADD COLUMN IF NOT EXISTS evaluator_type TEXT,
      ADD COLUMN IF NOT EXISTS assignment_description TEXT
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
        submission_link       TEXT,
        submission_file_url   TEXT,
        submission_file_name  TEXT,
        submitted_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      )
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
      END $$
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_college_assignments_college_id ON college_assignments(college_id)`,
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

    // Last accessed tracking for "Continue Learning"
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS last_accessed_subtopic_slug TEXT`,
    );
    await client.query(
      `ALTER TABLE user_subjects ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ`,
    );

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
  } catch (error) {
    console.log('❌ Database connection Failed: ', error);
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
})();

module.exports = pool;
