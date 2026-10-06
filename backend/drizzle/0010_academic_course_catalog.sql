CREATE TABLE IF NOT EXISTS public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track varchar(20) NOT NULL,
  kind varchar(30) NOT NULL CHECK (kind IN (
    'general_field', 'specialization', 'curriculum', 'stage', 'qualification',
    'grade', 'subject', 'syllabus_version', 'university', 'faculty', 'program', 'module'
  )),
  parent_id uuid REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  slug varchar(160) NOT NULL,
  name_en varchar(255) NOT NULL,
  name_ar varchar(255),
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT false,
  provenance varchar(80) NOT NULL DEFAULT 'admin',
  archived_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_items_track_kind_check CHECK (
    (track = 'general' AND kind IN ('general_field', 'specialization')) OR
    (track = 'school' AND kind IN ('curriculum', 'stage', 'qualification', 'grade', 'subject', 'syllabus_version')) OR
    (track = 'university' AND kind IN ('university', 'faculty', 'program', 'module'))
  ),
  CONSTRAINT catalog_items_display_order_check CHECK (display_order >= 0),
  CONSTRAINT catalog_items_metadata_object_check CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_parent_slug_unique
  ON public.catalog_items (track, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
CREATE INDEX IF NOT EXISTS catalog_items_track_parent_order_idx
  ON public.catalog_items (track, parent_id, display_order);
CREATE INDEX IF NOT EXISTS catalog_items_visible_tree_idx
  ON public.catalog_items (track, parent_id, is_visible) WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_catalog_item_parent()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  parent_kind varchar(30);
  allowed_parent boolean;
BEGIN
  IF NEW.parent_id IS NULL THEN
    IF NEW.kind NOT IN ('general_field', 'curriculum', 'university') THEN
      RAISE EXCEPTION 'Catalog item kind % requires a parent', NEW.kind USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Catalog item cannot be its own parent' USING ERRCODE = '23514';
  END IF;

  SELECT kind INTO parent_kind FROM public.catalog_items WHERE id = NEW.parent_id AND track = NEW.track;
  IF parent_kind IS NULL THEN
    RAISE EXCEPTION 'Catalog parent must exist in the same track' USING ERRCODE = '23514';
  END IF;

  allowed_parent := CASE NEW.track
    WHEN 'general' THEN (NEW.kind = 'specialization' AND parent_kind IN ('general_field', 'specialization'))
    WHEN 'school' THEN (NEW.kind = 'stage' AND parent_kind = 'curriculum')
      OR (NEW.kind = 'qualification' AND parent_kind = 'stage')
      OR (NEW.kind = 'grade' AND parent_kind = 'qualification')
      OR (NEW.kind = 'subject' AND parent_kind = 'grade')
      OR (NEW.kind = 'syllabus_version' AND parent_kind = 'subject')
    WHEN 'university' THEN (NEW.kind = 'faculty' AND parent_kind = 'university')
      OR (NEW.kind = 'program' AND parent_kind = 'faculty')
      OR (NEW.kind = 'module' AND parent_kind = 'program')
    ELSE false
  END;
  IF NOT allowed_parent THEN
    RAISE EXCEPTION 'Invalid catalog parent kind % for % in % track', parent_kind, NEW.kind, NEW.track USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM public.catalog_items WHERE parent_id = OLD.id
      UNION ALL
      SELECT child.id FROM public.catalog_items child JOIN descendants d ON child.parent_id = d.id
    ) SELECT 1 FROM descendants WHERE id = NEW.parent_id
  ) THEN
    RAISE EXCEPTION 'Catalog hierarchy cannot contain a cycle' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS catalog_items_parent_guard ON public.catalog_items;
CREATE TRIGGER catalog_items_parent_guard
  BEFORE INSERT OR UPDATE ON public.catalog_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_catalog_item_parent();

CREATE TABLE IF NOT EXISTS public.course_catalog_items (
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES public.catalog_items(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_catalog_items_course_item_unique UNIQUE (course_id, catalog_item_id)
);
CREATE INDEX IF NOT EXISTS course_catalog_items_item_course_idx
  ON public.course_catalog_items (catalog_item_id, course_id);

ALTER TABLE public.sanaweya_profiles
  ADD COLUMN IF NOT EXISTS catalog_grade_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL;
ALTER TABLE public.past_exams
  ADD COLUMN IF NOT EXISTS catalog_subject_id uuid REFERENCES public.catalog_items(id) ON DELETE SET NULL;

-- The one general root and the Egyptian national curriculum are neutral
-- navigation roots. No third-party institution affiliation is implied.
INSERT INTO public.catalog_items (track, kind, slug, name_en, name_ar, is_visible, provenance)
VALUES ('general', 'general_field', 'general-courses', 'General courses', 'دورات عامة', true, 'system')
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_items (track, kind, slug, name_en, name_ar, is_visible, provenance)
VALUES ('school', 'curriculum', 'egyptian-national', 'Egyptian National Curriculum', 'المنهج المصري', true, 'system')
ON CONFLICT DO NOTHING;

-- These are empty navigation roots requested by the product brief. They do
-- not imply school accreditation, official affiliation, or verified syllabus
-- content; institution-specific material must be curated separately.
INSERT INTO public.catalog_items (track, kind, slug, name_en, name_ar, is_visible, provenance, metadata)
VALUES
  ('school', 'curriculum', 'igcse-british', 'IGCSE / British Curriculum', 'IGCSE / المنهج البريطاني', true, 'system', '{"contentStatus":"empty_root","affiliationClaim":false}'::jsonb),
  ('school', 'curriculum', 'international-baccalaureate', 'International Baccalaureate (IB)', 'البكالوريا الدولية (IB)', true, 'system', '{"contentStatus":"empty_root","affiliationClaim":false}'::jsonb),
  ('school', 'curriculum', 'american-diploma', 'American Diploma', 'الدبلومة الأمريكية', true, 'system', '{"contentStatus":"empty_root","affiliationClaim":false}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_items (track, kind, parent_id, slug, name_en, name_ar, is_visible, provenance)
SELECT 'school', 'stage', curriculum.id, 'secondary-school', 'Secondary School', 'المرحلة الثانوية', true, 'system'
FROM public.catalog_items curriculum
WHERE curriculum.track = 'school' AND curriculum.slug = 'egyptian-national'
ON CONFLICT DO NOTHING;

INSERT INTO public.catalog_items (track, kind, parent_id, slug, name_en, name_ar, is_visible, provenance)
SELECT 'school', 'qualification', stage.id, 'general-secondary', 'General Secondary Education', 'الثانوية العامة', true, 'system'
FROM public.catalog_items stage
WHERE stage.track = 'school' AND stage.slug = 'secondary-school'
ON CONFLICT DO NOTHING;

-- Import only grade/subject labels already present in Nudra data. Keep the
-- original text intact and label its provenance so it can be reviewed later.
WITH grade_labels(label) AS (
  SELECT NULLIF(btrim(sanaweya_grade), '') FROM public.courses WHERE organization_id IS NULL AND sanaweya_grade IS NOT NULL
  UNION SELECT NULLIF(btrim(grade), '') FROM public.past_exams WHERE grade IS NOT NULL
  UNION SELECT NULLIF(btrim(grade), '') FROM public.sanaweya_profiles WHERE grade IS NOT NULL
), parent AS (
  SELECT id FROM public.catalog_items WHERE track = 'school' AND slug = 'general-secondary'
)
INSERT INTO public.catalog_items (track, kind, parent_id, slug, name_en, name_ar, is_visible, provenance, metadata)
SELECT 'school', 'grade', parent.id,
       'existing-' || substr(md5(grade_labels.label), 1, 16),
       CASE lower(grade_labels.label)
         WHEN 'year1' THEN 'Year 1 Secondary'
         WHEN 'year2' THEN 'Year 2 Secondary'
         WHEN 'year3' THEN 'Year 3 Secondary'
         ELSE grade_labels.label
       END,
       CASE lower(grade_labels.label)
         WHEN 'year1' THEN 'سنة أولى ثانوي'
         WHEN 'year2' THEN 'سنة ثانية ثانوي'
         WHEN 'year3' THEN 'سنة ثالثة ثانوي'
         ELSE NULL
       END,
       true, 'existing_data', jsonb_build_object('source', 'legacy_grade', 'originalValue', grade_labels.label)
FROM grade_labels CROSS JOIN parent
WHERE grade_labels.label IS NOT NULL
ON CONFLICT DO NOTHING;

WITH subject_labels(grade_label, subject_label) AS (
  SELECT NULLIF(btrim(sanaweya_grade), ''), NULLIF(btrim(sanaweya_subject), '')
  FROM public.courses WHERE organization_id IS NULL AND sanaweya_grade IS NOT NULL AND sanaweya_subject IS NOT NULL
  UNION
  SELECT NULLIF(btrim(grade), ''), NULLIF(btrim(subject), '')
  FROM public.past_exams WHERE grade IS NOT NULL AND subject IS NOT NULL
  UNION
  SELECT NULLIF(btrim(grade), ''), NULLIF(btrim(subject), '')
  FROM public.subject_communities WHERE grade IS NOT NULL AND subject IS NOT NULL
)
INSERT INTO public.catalog_items (track, kind, parent_id, slug, name_en, is_visible, provenance, metadata)
SELECT 'school', 'subject', grade.id,
       'existing-' || substr(md5(subject_labels.grade_label || '::' || subject_labels.subject_label), 1, 16),
       subject_labels.subject_label, true, 'existing_data',
       jsonb_build_object('source', 'legacy_subject', 'originalGrade', subject_labels.grade_label, 'originalValue', subject_labels.subject_label)
FROM subject_labels
JOIN public.catalog_items grade ON grade.track = 'school' AND grade.kind = 'grade'
  AND grade.metadata->>'originalValue' = subject_labels.grade_label
WHERE subject_labels.grade_label IS NOT NULL AND subject_labels.subject_label IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.course_catalog_items (course_id, catalog_item_id)
SELECT course.id, COALESCE(subject_item.id, grade_item.id)
FROM public.courses course
LEFT JOIN public.catalog_items grade_item
  ON grade_item.track = 'school' AND grade_item.kind = 'grade' AND grade_item.metadata->>'originalValue' = btrim(course.sanaweya_grade)
LEFT JOIN public.catalog_items subject_item
  ON subject_item.track = 'school' AND subject_item.kind = 'subject'
  AND subject_item.parent_id = grade_item.id
  AND subject_item.metadata->>'originalValue' = btrim(course.sanaweya_subject)
WHERE course.organization_id IS NULL AND course.sanaweya_grade IS NOT NULL
  AND COALESCE(subject_item.id, grade_item.id) IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.sanaweya_profiles profile
SET catalog_grade_id = grade_item.id
FROM public.catalog_items grade_item
WHERE grade_item.track = 'school' AND grade_item.kind = 'grade'
  AND grade_item.metadata->>'originalValue' = btrim(profile.grade) AND profile.catalog_grade_id IS NULL;

UPDATE public.past_exams exam
SET catalog_subject_id = subject_item.id
FROM public.catalog_items grade_item
JOIN public.catalog_items subject_item ON subject_item.parent_id = grade_item.id AND subject_item.kind = 'subject'
WHERE grade_item.track = 'school' AND grade_item.kind = 'grade'
  AND grade_item.metadata->>'originalValue' = btrim(exam.grade)
  AND subject_item.metadata->>'originalValue' = btrim(exam.subject)
  AND exam.catalog_subject_id IS NULL;
