# Nudra VPS deployment and recovery

Scope: one API instance, one video worker, self-hosted PostgreSQL/Redis/MinIO. Real Paymob is deferred. Run commands from `/opt/nudra`. Keep maintenance access to the host independent of the application.

## Before deployment

Use `infra/production-compose.env.example`, `infra/production-api.env.example`, and `infra/production-worker.env.example` as the three private `.env.production*` files. Restrict them to mode 0600 and never commit them. Generate independent random passwords and secrets; URL-encode database passwords in connection URLs. `EMAIL_OUTBOX_KEY` is exactly 64 hex characters and protects both mail payloads and administrator MFA secrets. Keep a separate encrypted recovery copy; replacing it without migrating encrypted records makes existing MFA and pending email unreadable.

Set domain DNS and public IPv4 correctly; permit inbound 80/443 and restrict SSH. PostgreSQL, Redis, MinIO and its console have no public host ports. Use the migration role only for migrations/restores. The runtime role is a private, non-superuser server role with BYPASSRLS: tenant isolation is enforced by application authorization. It must never be used in browser code or public database endpoints. RLS tables without policies do not provide tenant protection for this role.

The configured container ceilings consume roughly 7 GiB RAM and more than 3 CPU cores in aggregate. These are ceilings, not sizing evidence. Use worker concurrency one; qualify the actual VPS before admitting public traffic. Keep at least 8 GiB free on the worker scratch filesystem and alert at 85% disk usage. Inventory existing media before upgrading: the new storage ledger accounts for newly processed generations, not old unrecorded files.

Storage uses a digest-pinned PGSTY SILO release, a maintained MinIO-derived fork that preserves S3 APIs, `MINIO_*` configuration and the `.minio.sys` format. Its classic image includes both `mcli` and `mc`, so initialization reuses that image. A local scan found two HIGH Go-standard-library findings in each of the SILO and bundled client binaries, no CRITICAL findings. Keep its image-scan CI gate enabled; do not describe the storage layer as vulnerability-free. The former archived MinIO source images have been removed. The local service was switched to SILO after a checksum-verified volume backup and isolated canary check; the production/VPS service has not been changed. Changing a Compose file does not restart a running container. Back up object data before any further service replacement and qualify restore/rollback first.

## Build, initialize and migrate

```bash
node ops/validate-production-compose.mjs
docker compose --env-file .env.production -f compose.production.yml build
docker compose --env-file .env.production -f compose.production.yml up -d postgres redis minio minio-init
bash ops/run-migrations.sh
bash ops/run-migrations.sh
```

SQL files in `backend/drizzle` and `nudra_schema_migrations` are authoritative. Schema push is removed because it omits SQL-only operational tables and risks destructive drift. Never edit an applied migration. Fresh installations need no adoption flags. A legacy filename-only history requires comparison against the deployed SQL, then one explicit `MIGRATION_ADOPT_CHECKSUMS=true` run. An untracked existing schema additionally requires a full schema comparison and explicit `MIGRATION_ADOPT_BASELINE=true`. Neither flag proves that an unknown legacy schema is correct. Use reviewed expand/contract migrations, take a backup first, and restore a compatible complete backup if a destructive migration fails.

Provision each global administrator's authenticator before enabling production login. Run the existing administrator CLI to create/promote the intended account, then run `node dist/scripts/admin-mfa.js ADMIN_EMAIL` inside the API image with the real runtime environment. The CLI prints a private authenticator secret once to the operator terminal. Store it privately, enroll the device, verify login and delete terminal captures; never send it to normal application logs. Reprovisioning invalidates the previous secret and revokes sessions. Keep host-level recovery access for lost authenticators. MFA is mandatory for global administrators in production.

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
bash ops/check-production-health.sh
```

Test root and approved tenant/custom domains through Caddy, including actual TLS issuance. Internal domain authorization is independently authenticated and runs before public organization resolution. Liveness is `/api/health`; dependency readiness is `/api/health/ready`. Keep public traffic closed until readiness, authentication, private media, mail and actual TLS checks pass.

## Payment demonstration

Live configuration uses `PAYMENT_PROVIDER=disabled`, `APP_MODE=live`. A production-hosted mock must be a separate deployment/project with its own networks/volumes, database ending `_demo`, `MINIO_BUCKET_PREFIX=nudra-demo`, separate MinIO application user ending `-demo` or `_demo`, `APP_MODE=demo`, `PAYMENT_PROVIDER=paymob_mock`, and an explicit `MOCK_PAYMENT_ALLOWED_EMAILS` list. Do not share a live database or overwrite its MinIO policy/user. Demo outcome controls are owner-bound and clearly labeled; they collect no card information. Course checkout supports paid/failed/cancelled/expired simulations; real booking settlement and Paymob callbacks/refunds remain deferred. Selecting online booking payment leaves payment pending.

## Mail and identity policy

Production requires a Resend key and encrypted outbox key. Invitation/account creation, reset tokens, enrollments, mock fulfillment and certificate messages are queued in their domain transaction. Jobs retry up to eight times with provider idempotency keys; alert on delayed/failed mail. Some community/decision notifications remain best effort; do not interpret missing notification as a failed domain operation. Verify sender-domain DNS, actual delivery, retries and bounce handling against the configured provider before launch.

Development mail delivery is disabled unless `ENABLE_EMAIL_DELIVERY=true`, even if a key is present. Signup queues a one-time realm-bound verification URL; authenticated accounts can request another through `/api/auth/verify-email/request`. Verification status is explicit. Email verification is currently optional for learning; it is not a verified-identity guarantee or a compulsory enrollment gate.

## Monitoring and capacity

Install `infra/nudra-health.service`, `.timer`, and `nudra-alert@.service` into systemd, reload and enable the timer. The bundled failure action writes a journal alert; configure an independent external monitor and the operator's actual notification destination. Test delivery by stopping a dependency during maintenance and restoring it. A journal entry alone is not an externally delivered alert.

Monitor API readiness/error rates, pool waits, CPU/RAM, disk and inodes, queue age/failures, mail delay and object cleanup failure. `dist/scripts/check-operations.js` returns a sanitized snapshot and a nonzero exit on actionable backlog. Finished jobs and Docker logs have bounded retention. Cleanup and outbox draining run from API maintenance; keep the API healthy for these lifecycles. AI ceilings are request-count budgets, not currency-denominated spend guarantees; use provider billing alerts too. Private HLS remains authenticated and proxied; benchmark shared-IP playback rather than extrapolating user capacity from container limits.

Run a representative load test on the selected VPS with login, browsing, concurrent HLS viewers behind one NAT, upload/transcode, AI and backups. Record p50/p95/p99 latency, errors/429, query plans/pool waits, queue age and host CPU/RAM/IO/network. Tune limits only from measured results. The current profile is one bounded 720p rendition; adaptive bitrate is a later measured optimization. No supported-user count is established.

## Encrypted independent backups

Install PostgreSQL client tools, `sha256sum`, and restic on the host. Configure a truly independent `RESTIC_REPOSITORY`, its access credentials and a private `RESTIC_PASSWORD_FILE`; retain the key outside the VPS. Schedule `ops/backup-production-offsite.sh` in a maintenance window. It stops API/worker, dumps PostgreSQL, stops MinIO, and saves database and the object volume as two encrypted snapshots with the same backup-set tag. Its trap resumes services on failure. This strategy causes downtime; monitor every backup result and snapshot age. Do not assume automated offsite protection merely because scripts exist.

Suggested initial target, subject to actual business approval: nightly backup (up to 24h data loss), 30 daily/12 monthly snapshots, monthly restore drill. Configure restic retention/prune separately and measure recovery time. Keep application release/image digests and encrypted configuration/key backup with the backup-set manifest. Redis is not the authoritative learning/payment record; its video queue can be reconciled from persisted pending jobs. In-progress jobs still need restart verification.

## Restore drill / disaster recovery

Keep traffic closed. Initialize an empty destination PostgreSQL with the exact role bootstrap and pgvector image; never restore over a live database. Retrieve database and checksum into a different directory and run `ops/restore-public-database.sh` with the destination deployment environment. The script validates checksum, archive and emptiness and restores as the migration role. Match database/object snapshots by backup-set tag.

Create an empty object Docker volume, stop all containers using it, and run `ops/restore-production-objects.sh OBJECT_SNAPSHOT EMPTY_VOLUME`. It refuses a nonempty or in-use destination. Start the matching MinIO build, run bootstrap policies and validate representative thumbnail, raw and private HLS objects; anonymous HLS/raw reads must fail. Restore configuration encryption keys before testing MFA or mail. Do not drain restored outgoing mail into real recipients until its age/state is reviewed.

Apply only compatible reviewed migrations. Verify migration counts/checksums, representative accounts, active/canceled tenant access, stored exam results, course counts, video playback, queue reconciliation and administrator login. Record actual elapsed recovery time and newest recoverable data timestamp. Reopen traffic only after those checks and external monitoring pass. Database-only restore was exercised locally; a complete offsite database-plus-object restore on the target VPS remains a launch gate.

## Retention and upgrade effects

Maintenance removes expired sessions/reset/verification tokens, exam assignments older than 90 days, delivered outbox entries older than 30 days and audit events older than 365 days. Stored quiz attempts remain; quizzes with attempt history cannot be destructively replaced. Course deletion with enrollment/booking/order history is refused; removed lesson/object cleanup is deferred and retryable. Certificates are checked against current curriculum and valid server-recorded activity; legacy zero-watch or unverifiable completions do not establish eligibility. Announce these behavior changes before upgrading real learners. Account export/deletion and any statutory retention decisions require an explicit product policy and separate complete workflow.

Stay on one API instance until a Socket.IO Redis adapter and distributed socket revocation are qualified. PostgreSQL notifications already revoke user sessions across listeners; room broadcasting and per-process connection counts still have single-instance assumptions. Pin tested image digests, run CI and image scans on upgrades, and record an operator and rollback procedure for every release.
