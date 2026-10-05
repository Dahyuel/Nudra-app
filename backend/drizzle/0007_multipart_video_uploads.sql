CREATE TABLE IF NOT EXISTS public.video_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  instructor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  multipart_upload_id text NOT NULL,
  file_name varchar(255) NOT NULL,
  content_type varchar(120) NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0 AND file_size <= 2147483648),
  part_size integer NOT NULL CHECK (part_size = 8388608),
  status varchar(20) NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'completed')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS video_upload_sessions_owner_lesson_idx
  ON public.video_upload_sessions (instructor_id, lesson_id, expires_at);
