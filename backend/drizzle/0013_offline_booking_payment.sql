-- Collect a contact phone for every account; required for new registrations
-- after this migration, but existing rows are allowed to backfill lazily.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(32);

-- Record how the student plans to pay for an offline session booking and
-- the current state of that payment. 'online' is a UI-only stub today:
-- the booking is marked 'paid' immediately pending a real gateway.
-- 'offline' bookings start as 'pending' until the instructor marks the
-- student as having paid at the venue.
ALTER TABLE course_bookings
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

-- Only accept the two values the UI exposes. Existing rows have NULL and
-- are grandfathered; new rows must pass. 'pending' / 'paid' / 'refunded' /
-- 'waived' cover the lifecycle without pre-committing to a provider shape.
ALTER TABLE course_bookings
  DROP CONSTRAINT IF EXISTS course_bookings_payment_method_check;
ALTER TABLE course_bookings
  ADD CONSTRAINT course_bookings_payment_method_check
    CHECK (payment_method IS NULL OR payment_method IN ('online', 'offline'));

ALTER TABLE course_bookings
  DROP CONSTRAINT IF EXISTS course_bookings_payment_status_check;
ALTER TABLE course_bookings
  ADD CONSTRAINT course_bookings_payment_status_check
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'waived'));

CREATE INDEX IF NOT EXISTS course_bookings_payment_status_idx
  ON course_bookings(session_id, payment_status);
