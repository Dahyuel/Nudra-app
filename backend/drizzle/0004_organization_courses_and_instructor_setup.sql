ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS delivery_mode varchar(20) NOT NULL DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS approval_status varchar(20) NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS booking_url text,
  ADD COLUMN IF NOT EXISTS schedule_text text,
  ADD COLUMN IF NOT EXISTS capacity integer;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_delivery_mode_check,
  DROP CONSTRAINT IF EXISTS courses_approval_status_check;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_delivery_mode_check CHECK (delivery_mode IN ('online', 'offline')),
  ADD CONSTRAINT courses_approval_status_check CHECK (approval_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS courses_organization_approval_idx
  ON public.courses (organization_id, approval_status, is_published);
