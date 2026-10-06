-- Distinguish regular online enrollments from offline semester-style enrollments.
-- An offline_semester enrollment auto-rosters the student into every future
-- session on the course; the drop-in flow (per-session booking) still works
-- for everyone else via course_bookings.
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'online';

ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_kind_check;
ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_kind_check
    CHECK (kind IN ('online', 'offline_semester'));

-- Status so an enrollment can be left mid-semester without losing the row
-- (keeps attendance history linked for CSV exports).
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE enrollments
  DROP CONSTRAINT IF EXISTS enrollments_status_check;
ALTER TABLE enrollments
  ADD CONSTRAINT enrollments_status_check
    CHECK (status IN ('active', 'cancelled'));

CREATE INDEX IF NOT EXISTS enrollments_course_kind_idx
  ON enrollments(course_id, kind) WHERE status = 'active';
