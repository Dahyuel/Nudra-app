-- Native offline sessions and bookings. Capacity is guarded by locking the
-- parent session row while creating/cancelling reservations.
CREATE TABLE IF NOT EXISTS course_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  location text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS course_sessions_course_start_idx
  ON course_sessions(course_id, starts_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS course_sessions_org_start_idx
  ON course_sessions(organization_id, starts_at) WHERE status = 'scheduled';

CREATE TABLE IF NOT EXISTS course_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES course_sessions(id) ON DELETE RESTRICT,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show')),
  waitlist_position integer,
  booked_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, student_id),
  CHECK ((status = 'waitlisted' AND waitlist_position IS NOT NULL AND waitlist_position > 0) OR status <> 'waitlisted')
);

CREATE INDEX IF NOT EXISTS course_bookings_student_idx
  ON course_bookings(student_id, booked_at DESC);
CREATE INDEX IF NOT EXISTS course_bookings_session_status_idx
  ON course_bookings(session_id, status, booked_at);
CREATE INDEX IF NOT EXISTS course_bookings_org_student_idx
  ON course_bookings(organization_id, student_id, booked_at DESC);

CREATE OR REPLACE FUNCTION validate_course_session_realm() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE course_org uuid;
BEGIN
  SELECT organization_id INTO course_org FROM courses WHERE id = NEW.course_id;
  IF NOT FOUND OR course_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'course session realm must match its course';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_sessions_realm_guard ON course_sessions;
CREATE TRIGGER course_sessions_realm_guard
  BEFORE INSERT OR UPDATE OF course_id, organization_id ON course_sessions
  FOR EACH ROW EXECUTE FUNCTION validate_course_session_realm();

CREATE OR REPLACE FUNCTION validate_course_booking_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE session_course uuid; session_org uuid; course_org uuid; student_org uuid;
BEGIN
  SELECT course_id, organization_id INTO session_course, session_org FROM course_sessions WHERE id = NEW.session_id;
  SELECT organization_id INTO course_org FROM courses WHERE id = NEW.course_id;
  SELECT organization_id INTO student_org FROM users WHERE id = NEW.student_id;
  IF session_course IS DISTINCT FROM NEW.course_id OR session_org IS DISTINCT FROM NEW.organization_id
     OR course_org IS DISTINCT FROM NEW.organization_id OR student_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'booking resources must belong to the same realm';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_bookings_scope_guard ON course_bookings;
CREATE TRIGGER course_bookings_scope_guard
  BEFORE INSERT OR UPDATE OF session_id, course_id, organization_id, student_id ON course_bookings
  FOR EACH ROW EXECUTE FUNCTION validate_course_booking_scope();
