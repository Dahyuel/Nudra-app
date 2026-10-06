-- Preserve every existing user as a global Nudra account (organization_id NULL).
-- New organization accounts can reuse an email across separate realms.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_organization_id_organizations_id_fk'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_organization_id_organizations_id_fk
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_organization_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_organization_role_check
      CHECK (organization_id IS NULL OR role IN ('student', 'instructor'));
  END IF;
END $$;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_email_unique;

-- Owners are existing organization managers in the current model. Ensure each
-- owner has the active membership required to authenticate in that tenant.
INSERT INTO public.org_memberships (org_id, user_id, role, status)
SELECT o.id, o.owner_id, 'organization_manager', 'active'
FROM public.organizations AS o
WHERE o.owner_id IS NOT NULL
ON CONFLICT (org_id, user_id) DO UPDATE
SET role = 'organization_manager', status = 'active';

-- The original onboarding allowed an existing student account to become an
-- organization owner/manager. Keep such global accounts eligible for manager
-- authentication under the stricter role check.
UPDATE public.users AS account
SET role = 'organization_manager'
WHERE account.organization_id IS NULL
  AND account.role <> 'admin'
  AND EXISTS (
    SELECT 1
    FROM public.org_memberships AS manager_membership
    WHERE manager_membership.user_id = account.id
      AND manager_membership.role = 'organization_manager'
      AND manager_membership.status = 'active'
  );

CREATE UNIQUE INDEX IF NOT EXISTS users_global_email_unique
  ON public.users (email)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_organization_email_unique
  ON public.users (organization_id, email)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_organization_id_idx
  ON public.users (organization_id);

-- Existing student/instructor memberships point at global accounts. Create an
-- independent account for each organization but require a fresh password reset
-- rather than copying a shared global password hash into tenant realms.
-- Manager memberships remain attached to their global accounts.
INSERT INTO public.users (
  id,
  name,
  organization_id,
  email,
  password_hash,
  role,
  avatar_url,
  grade,
  instructor_status,
  must_change_password,
  preferred_language,
  notify_community,
  notify_sessions,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  global_user.name,
  membership.org_id,
  global_user.email,
  '!organization-account-reset-required!',
  membership.role::public.role,
  global_user.avatar_url,
  global_user.grade,
  global_user.instructor_status,
  true,
  global_user.preferred_language,
  global_user.notify_community,
  global_user.notify_sessions,
  global_user.created_at,
  global_user.updated_at
FROM public.org_memberships AS membership
JOIN public.users AS global_user ON global_user.id = membership.user_id
WHERE membership.role IN ('student', 'instructor')
  AND global_user.organization_id IS NULL
ON CONFLICT (organization_id, email) WHERE organization_id IS NOT NULL DO NOTHING;

-- Retain old/new identities during the following realm-bound data remaps.
CREATE TEMP TABLE nudra_org_user_migration ON COMMIT DROP AS
SELECT
  membership.id AS membership_id,
  membership.org_id,
  membership.role AS membership_role,
  global_user.id AS global_user_id,
  tenant_user.id AS tenant_user_id
FROM public.org_memberships AS membership
JOIN public.users AS global_user ON global_user.id = membership.user_id
JOIN public.users AS tenant_user
  ON tenant_user.organization_id = membership.org_id
  AND tenant_user.email = global_user.email
WHERE membership.role IN ('student', 'instructor')
  AND global_user.organization_id IS NULL;

-- Repoint membership only, leaving its status and timestamps as-is.
UPDATE public.org_memberships AS membership
SET user_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping
WHERE membership.id = mapping.membership_id;

-- Keep tenant instructors attached to their own account rows.
UPDATE public.courses AS course
SET instructor_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping
WHERE course.organization_id = mapping.org_id
  AND course.instructor_id = mapping.global_user_id
  AND mapping.membership_role = 'instructor';

UPDATE public.quizzes AS quiz
SET created_by = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE quiz.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND quiz.created_by = mapping.global_user_id
  AND mapping.membership_role = 'instructor';

-- Move student learning records with their matching tenant student only when
-- the parent course belongs to that same organization.
UPDATE public.enrollments AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.lesson_progress AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.lesson_notes AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.lessons AS lesson, public.courses AS course
WHERE record.lesson_id = lesson.id
  AND lesson.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.course_reviews AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.orders AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.certificates AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.quiz_attempts AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.weak_topics AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.ai_conversations AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE record.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.flashcards AS record
SET student_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.lessons AS lesson, public.courses AS course
WHERE record.lesson_id = lesson.id
  AND lesson.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.student_id = mapping.global_user_id
  AND mapping.membership_role = 'student';

UPDATE public.video_upload_sessions AS record
SET instructor_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.lessons AS lesson, public.courses AS course
WHERE record.lesson_id = lesson.id
  AND lesson.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND record.instructor_id = mapping.global_user_id
  AND mapping.membership_role = 'instructor';

UPDATE public.community_posts AS post
SET author_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.courses AS course
WHERE post.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND post.author_id = mapping.global_user_id;

UPDATE public.community_replies AS reply
SET author_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping, public.community_posts AS post, public.courses AS course
WHERE reply.post_id = post.id
  AND post.course_id = course.id
  AND course.organization_id = mapping.org_id
  AND reply.author_id = mapping.global_user_id;

UPDATE public.post_votes AS vote
SET user_id = mapping.tenant_user_id
FROM nudra_org_user_migration AS mapping
WHERE vote.user_id = mapping.global_user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.community_posts AS post
      JOIN public.courses AS course ON course.id = post.course_id
      WHERE post.id = vote.post_id AND course.organization_id = mapping.org_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.community_replies AS reply
      JOIN public.community_posts AS post ON post.id = reply.post_id
      JOIN public.courses AS course ON course.id = post.course_id
      WHERE reply.id = vote.reply_id AND course.organization_id = mapping.org_id
    )
  );
