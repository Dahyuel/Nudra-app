-- The API uses server-side authorization with a dedicated BYPASSRLS role.
-- Enabling RLS without policies gives accidental non-bypass roles a closed
-- default, but does not replace the application's tenant checks.
DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'nudra_schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target.schemaname, target.tablename);
  END LOOP;
END
$$;
