ALTER TABLE lessons ADD COLUMN duration_seconds integer CHECK(duration_seconds > 0 AND duration_seconds <= 86400);
ALTER TABLE lesson_progress ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE video_jobs ADD COLUMN generation_id uuid;
ALTER TABLE video_jobs ADD COLUMN raw_key text;

CREATE TABLE exam_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  questions jsonb NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  result jsonb
);
ALTER TABLE exam_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX exam_assignments_student_created_idx ON exam_assignments(student_id,started_at DESC);
CREATE INDEX exam_assignments_course_idx ON exam_assignments(course_id);

CREATE TABLE mock_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK(outcome IN('paid','failed','cancelled','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);
ALTER TABLE mock_payment_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);
ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX email_outbox_pending_idx ON email_outbox(available_at) WHERE delivered_at IS NULL AND attempts<8;

CREATE TABLE object_cleanup_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  prefix text NOT NULL,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  finished_at timestamptz
);
ALTER TABLE object_cleanup_tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX object_cleanup_pending_idx ON object_cleanup_tasks(available_at) WHERE finished_at IS NULL;

CREATE TABLE security_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text NOT NULL,
  outcome integer NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE security_audit_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX security_audit_actor_time_idx ON security_audit_events(actor_id,created_at DESC);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX lessons_course_position_idx ON lessons(course_id,position);
CREATE INDEX lessons_section_position_idx ON lessons(section_id,position);
CREATE INDEX course_sections_course_position_idx ON course_sections(course_id,position);
CREATE INDEX enrollments_course_status_idx ON enrollments(course_id,status);
CREATE INDEX community_posts_course_time_idx ON community_posts(course_id,created_at DESC);
CREATE INDEX community_posts_subject_time_idx ON community_posts(subject_community_id,created_at DESC);
CREATE INDEX community_replies_post_time_idx ON community_replies(post_id,created_at);
CREATE INDEX community_votes_post_idx ON post_votes(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX community_votes_reply_idx ON post_votes(reply_id) WHERE reply_id IS NOT NULL;
CREATE INDEX ai_messages_conversation_time_idx ON ai_messages(conversation_id,created_at);
CREATE INDEX notifications_user_time_idx ON notifications(user_id,created_at DESC);
CREATE INDEX orders_student_status_idx ON orders(student_id,status,created_at DESC);
CREATE INDEX orders_course_status_idx ON orders(course_id,status);
CREATE INDEX quiz_attempts_student_course_time_idx ON quiz_attempts(student_id,course_id,completed_at DESC);
CREATE INDEX quiz_attempts_quiz_idx ON quiz_attempts(quiz_id);
CREATE INDEX quiz_attempts_lesson_idx ON quiz_attempts(lesson_id);
CREATE INDEX lesson_progress_course_student_idx ON lesson_progress(course_id,student_id);
CREATE INDEX video_jobs_status_time_idx ON video_jobs(status,updated_at);
CREATE INDEX video_upload_instructor_idx ON video_upload_sessions(instructor_id);
CREATE INDEX video_upload_lesson_idx ON video_upload_sessions(lesson_id);
CREATE INDEX course_bookings_student_course_idx ON course_bookings(student_id,course_id);
