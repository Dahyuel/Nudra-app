CREATE FUNCTION notify_nudra_access_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected_user uuid;
BEGIN
 IF TG_TABLE_NAME='sessions' THEN
  affected_user=OLD.user_id;
 ELSIF TG_TABLE_NAME='users' THEN
  IF OLD.role IS NOT DISTINCT FROM NEW.role AND OLD.organization_id IS NOT DISTINCT FROM NEW.organization_id
   AND OLD.password_hash IS NOT DISTINCT FROM NEW.password_hash AND OLD.must_change_password IS NOT DISTINCT FROM NEW.must_change_password THEN RETURN NEW; END IF;
  affected_user=NEW.id;
 ELSIF TG_TABLE_NAME='enrollments' THEN
  IF TG_OP='UPDATE' AND NEW.status='active' THEN RETURN NEW; END IF;
  affected_user=OLD.student_id;
 ELSIF TG_TABLE_NAME='org_memberships' THEN
  IF TG_OP='UPDATE' AND NEW.status='active' AND OLD.role=NEW.role THEN RETURN NEW; END IF;
  affected_user=OLD.user_id;
 END IF;
 PERFORM pg_notify('nudra_access_revoked',affected_user::text);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER session_realtime_revocation AFTER DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION notify_nudra_access_revocation();
CREATE TRIGGER account_realtime_revocation AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION notify_nudra_access_revocation();
CREATE TRIGGER enrollment_realtime_revocation AFTER UPDATE OR DELETE ON enrollments FOR EACH ROW EXECUTE FUNCTION notify_nudra_access_revocation();
CREATE TRIGGER membership_realtime_revocation AFTER UPDATE OR DELETE ON org_memberships FOR EACH ROW EXECUTE FUNCTION notify_nudra_access_revocation();
