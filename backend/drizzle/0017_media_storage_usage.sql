CREATE TABLE media_storage_usage (
 generation_id uuid PRIMARY KEY,
 lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
 instructor_id uuid NOT NULL REFERENCES users(id),
 organization_id uuid REFERENCES organizations(id),
 bytes bigint NOT NULL CHECK(bytes>=0),
 hls_prefix text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE media_storage_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX media_storage_usage_org_idx ON media_storage_usage(organization_id);
CREATE INDEX media_storage_usage_instructor_idx ON media_storage_usage(instructor_id);
CREATE INDEX media_storage_usage_lesson_idx ON media_storage_usage(lesson_id);
