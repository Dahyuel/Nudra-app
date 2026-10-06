# Nudra VPS Deployment and Migration Runbook

This runbook moves Nudra from managed hosting to one Hostinger VPS. It keeps **Resend** for email, **Groq Cloud** for Whisper Large V3 Turbo, and the hosted **Qwen** API for chat and embeddings. The frontend, Node API, background video/transcription worker, PostgreSQL with pgvector, Redis, and MinIO run on the VPS.

The migration is not complete until the export, restore, file copy, production smoke checks, and DNS cutover have all been performed. The existing Supabase project must remain available until then.

## Target layout

| Component | Runs where | Public access |
| --- | --- | --- |
| React/Vite frontend | Static files served by Caddy | HTTPS 80/443 only |
| Express API + Socket.IO | Node container | Through Caddy `/api` and `/socket.io` |
| Video/transcription worker | Separate long-running Node container | None |
| PostgreSQL + pgvector | Private Compose network and persistent volume | None |
| Redis/BullMQ | Private Compose network and persistent volume | None |
| MinIO | Private Compose network and persistent volume | Through Caddy storage routes only |
| Caddy | VPS reverse proxy and automatic HTTPS | 80/443 |
| Resend, Groq, Qwen | External APIs | Outbound connections from backend/worker |

Production does not need Supabase Auth/Storage, Vercel, Railway, Upstash, Cloudflare R2, Ollama, Mailpit, or the local Whisper container. Cloudflare can remain the DNS provider and proxy, but it does not host the application. Hostinger remains the VPS provider. The local development `docker-compose.yml` stays separate from the VPS production Compose file.

## Before starting

- Select **Hostinger KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe)** for an initial low-traffic launch; select KVM 4 if video uploads/transcodes or concurrent classes will be common. These are starting estimates, not capacity guarantees. One VPS is a single failure and storage boundary.
- Use a current supported Ubuntu LTS image. Reserve the VPS public IPv4 and record it; if IPv6 is configured, expose and firewall it consistently too.
- Keep the Nudra domain's DNS on Cloudflare if convenient. The VPS still serves all production application traffic.
- Make sure there is enough free disk for videos, HLS output, database data, and backups. Video transcoding needs temporary disk space. Set disk alerts before accepting large uploads.
- Do not transfer DNS or shut down Supabase yet. Complete a rehearsal on the VPS first.

## 1. Secure the Hostinger VPS

1. Create the VPS with Ubuntu LTS and use SSH keys. Disable password login and root SSH login after confirming a second SSH session with your key works.
2. Create a non-root administrator account with `sudo`; keep a second recovery key/account in a safe place.
3. Update the OS and enable automatic security updates. Configure the Hostinger firewall and host firewall to allow inbound **22/tcp** only from your admin IP where possible, plus **80/tcp** and **443/tcp**. Do not open 3000, 3001, 5432, 6379, 9000, or 9001 to the internet.
4. Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository. Keep Docker packages updated. Do not add the app user to the Docker group unless required: Docker group membership grants root-equivalent control.
5. Set timezone to UTC, enable NTP, and configure log rotation and disk monitoring. Use a Hostinger snapshot only as an extra recovery aid, never as the only backup.
6. Create a private deployment directory (for example `/opt/nudra`), owned by the deployment administrator. Place the checked-out code, production Compose file, Caddy config, and three owner-only (`chmod 600`) environment files there: `.env.production` for Compose interpolation/infrastructure credentials, `.env.production.api` for API-only secrets, and `.env.production.worker` for AI-provider keys used by the worker. Start from the matching examples under `infra/`. Never commit these files or paste them into chat.

## 2. DNS and HTTPS

At Cloudflare (or the current authoritative DNS provider), point the root hostname and `www` to the VPS IP. Add a wildcard record for tenant subdomains (`*.nudra.org`) pointing to the same VPS so new organization slugs route automatically. Use the exact IP supplied by Hostinger. If proxying through Cloudflare, use Full (strict) TLS and allow Cloudflare's published address ranges through the firewall, while retaining an admin SSH allowlist. Alternatively use DNS-only records and let Caddy serve public HTTPS directly.

Caddy must be the only internet-facing application container. It serves the built frontend, proxies `/api/*` and `/socket.io/*` to the API, and sends `/storage/*` to MinIO with private buckets kept private. It must set forwarding headers itself. Do not expose the Node API, PostgreSQL, Redis, or MinIO console on host ports. Caddy is the single edge proxy; a generic extra API gateway would add a hop without replacing authorization in the API.

### Organization-owned domains

The manager enters a domain in Nudra. Nudra displays an A record to the VPS and a TXT ownership challenge. The owner adds both records, waits for public DNS, then presses **Check connection**. The API verifies the TXT token and address before marking the domain active. For a domain managed in Cloudflare, set the organization A record to **DNS only** (gray cloud) while verifying; the verifier checks that public DNS resolves directly to the VPS IPv4. Caddy's on-demand TLS authorization calls an internal backend endpoint that accepts only active, verified organization domains or valid Nudra tenant subdomains; protect that endpoint with a random shared secret on the private Docker network. This prevents arbitrary visitors from using the VPS to request certificates for unrelated domains.

Before enabling this for real customers, test domain ownership, certificate issuance/renewal, login cookies, API calls, password reset, and Socket.IO from a separate external domain. Do not use a user-controlled Host header as proof of domain ownership. Keep the Caddy authorization endpoint inaccessible from the public network.

## 3. Production secrets and configuration

Generate new, unique secrets on a trusted computer. Use long random values for the session secret, anonymous token salt, PostgreSQL passwords, MinIO keys, Redis password, and the Caddy domain-auth shared secret. Do not reuse development values. Rotate the database credential, Resend key, and Upstash credential previously shared during setup before production; the VPS will no longer use Supabase or Upstash. Rotate provider keys independently if they were exposed elsewhere.

Copy the templates `infra/production-compose.env.example`, `infra/production-api.env.example`, and `infra/production-worker.env.example` to `.env.production`, `.env.production.api`, and `.env.production.worker`. Set fresh, private values in each. The API and worker receive separate app environment files; Compose does not pass Postgres superuser/migration passwords or MinIO root credentials to them.

`.env.production` also requires `POSTGRES_DB`, `POSTGRES_SUPERUSER`, `POSTGRES_SUPERUSER_PASSWORD`, `POSTGRES_APP_USER`, `POSTGRES_APP_PASSWORD`, `POSTGRES_MIGRATION_USER`, `POSTGRES_MIGRATION_PASSWORD`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `REDIS_PASSWORD`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_APP_USER`, `MINIO_APP_PASSWORD`, `BASE_DOMAIN`, `PUBLIC_IPV4`, `ACME_EMAIL`, `ASSETS_HOST`, and `DOMAIN_AUTH_SHARED_SECRET`. The app connection string must match the app role/password; the migration URL must match the separate migration role/password. The API and worker get only the runtime app URL. Use URL-encoded passwords in PostgreSQL URLs. The VPS build uses same-origin `/api` and Socket.IO paths. Never put server secrets in `VITE_*` variables.

In Resend, preserve the verified `nudra.org` sender setup. When DNS is changed, copy Resend's exact DKIM/SPF/verification records to the authoritative DNS provider; don't invent or edit those values. `no-reply@nudra.org` must be allowed by the verified sending domain. Email body branding and an inbox sender avatar are separate: the avatar is controlled by each mailbox provider and may require BIMI/provider-specific setup.

## 4. Prepare and restore PostgreSQL

The app uses its own `public` schema; Supabase Auth/Storage are not the app's identity or file store. PostgreSQL must have pgvector installed. The production bootstrap creates a non-superuser migration owner and a separate application role with only runtime data privileges. Existing database tables have RLS enabled without per-user policies; this server-session app enforces access in its API, so the runtime role uses `BYPASSRLS` but is not a superuser. Never give the API a superuser or migration credential.

1. Take a Hostinger snapshot before the first production cutover and a separate database export. The snapshot does not replace a portable database backup.
2. From a trusted computer with PostgreSQL client tools, run `ops/export-public-database.sh` with `SOURCE_DATABASE_URL` set to the existing Supabase PostgreSQL connection. The script writes a mode-600 custom-format dump plus SHA-256 file under `backups/`. Keep both private and copy them to the VPS over SSH. Do not put the source URL in shell history; use a protected temporary environment or prompt-based secret manager.
3. Start only the production Postgres service and initialize its database/roles using the provided bootstrap files. Keep Postgres unpublished to the host. Confirm `vector` is available.
4. Restore only into a **new empty** Nudra database using `ops/restore-public-database.sh` after loading `.env.production` in the deployment shell. The script uses `docker compose exec` to access PostgreSQL privately, refuses a target that already has public tables, and verifies the dump checksum. Do not use `--clean` and do not point the script back to the source project.
5. Compare the restored schema with `backend/src/db/schema.ts`, then apply pending migrations with the migration-only URL through `ops/run-migrations.sh`. The runner tracks applied files and skips baseline `0000`, which creates the initial schema. Review each SQL change first; keep schema changes backward-compatible when possible. The import includes existing user password hashes, organizations, courses, lessons, memberships, and learning records.
6. Compare table/row counts for important tables, verify `vector` and indexes, sign in with existing accounts, and check organization/course ownership. The restore script verifies archive integrity, not correctness of every application row.
7. Store an encrypted copy of the dump off the VPS. A local backup on the same disk does not protect against disk failure or account compromise.

Do not run `drizzle-kit push` against production. Use versioned SQL migrations and the migration role. Test every migration against a disposable copy first.

## 5. Move uploaded objects to MinIO

Database backup does not copy video, HLS, thumbnail, avatar, or lesson-resource files. Inspect the source storage currently in use and make a complete object inventory. Copy every required object while preserving bucket/key names expected by the rows in `thumbnail_url`, `video_url`, `file_url`, and related columns. The target buckets are `nudra-thumbnails`, `nudra-raw-videos`, and `nudra-hls`.

Use an S3-compatible transfer tool from a trusted machine. If source files are in Supabase Storage or R2, export/copy those objects before retiring that provider. Compare object counts and total bytes, then sample-download thumbnails, lesson resources, original videos, and HLS playlists/segments. Keep raw videos and HLS private; serve them only through authorized backend routes. Only expose public course images/thumbnails if the app intentionally supports that visibility. Do not apply a public-read policy to raw-video or HLS buckets.

## 6. Build and launch the VPS stack

1. Select the intended commit and inspect `git status`; do not deploy `.env`, `creds.txt`, local databases, or backups.
2. Build the frontend and backend using the repository's documented Node version. The production frontend should use relative `/api` paths and same-origin Socket.IO.
3. From the private deployment directory, validate the Compose configuration without printing environment values into logs. Check container images, mounted volumes, health checks, network membership, resource limits, and restart policies.
4. Start the production stack with `docker compose --env-file .env.production -f compose.production.yml up -d`. Compose health dependencies bring up PostgreSQL, Redis, MinIO and its bucket initializer, API/worker, frontend, and Caddy. Ensure no service except Caddy publishes a host port.
5. Confirm every service is healthy. Run `ops/run-migrations.sh` when installing a new release; the API and worker use only the runtime database account. Check logs for secrets before sharing any output.
6. Confirm Caddy serves the frontend and `/api/health`, WebSocket upgrades work, and uploads reach MinIO. Verify cookies are Secure/HttpOnly/SameSite as intended and API CORS allows only configured Nudra origins and verified tenant hosts.
7. Create the first admin using the supported backend admin script from a controlled shell. Do not enable a public admin-registration flow. Change any one-time password immediately.

## 7. Verify before DNS cutover

- Existing student, instructor, admin, and organization-manager accounts can sign in; each can see only authorized data.
- Password reset and instructor invitation messages arrive through Resend with working links.
- The API can read/write MinIO, Redis queue jobs survive API restarts, and the separate worker processes a small video upload end-to-end. Then test a video larger than Cloudflare's request upload cap: the browser sends authenticated 8 MiB chunks through Caddy/API, retries failed parts, and asks the API to complete the private MinIO multipart upload. Each HTTP request stays under Cloudflare Free/Pro's 100 MB cap, so proxying can remain enabled. [Cloudflare upload limits](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/)
- Groq transcription uses `whisper-large-v3-turbo`; Qwen chat and embeddings use the selected production endpoint and retain 768-vector compatibility.
- HLS remains private and requires an authorized request; an unrelated user cannot fetch another student's private material.
- The Caddy authorization endpoint rejects unknown hosts and invalid secrets. Test wildcard tenant routing and one test custom domain's TXT/A verification and automatic HTTPS.
- Test registration, login/logout, password reset, course browsing/enrollment, live notifications, upload/transcode, thumbnail display, and account roles from external browsers.
- Reboot the VPS and confirm persistent volumes, health checks, Caddy certificates, and worker startup recover correctly.
- Test a database backup and restore into a disposable empty database. Record restore duration and verify a sample user/course/video.

## 8. Cutover and rollback

1. Announce a short maintenance window. Temporarily stop writes/uploads on the old app.
2. Take a final fresh Postgres export and final object-storage sync; restore/import the final data and newly changed objects to the VPS.
3. Run the smoke checks again and confirm the VPS database/object counts match the source export/inventory.
4. Lower DNS TTL in advance, then point the root, `www`, wildcard tenant record, and any API/assets names to the VPS (or Cloudflare proxy to the VPS). Confirm HTTPS and WebSocket routing externally.
5. Keep Supabase and prior object storage read-only and paid/available through the rollback window. Do not delete the project or buckets immediately.
6. If critical checks fail, point DNS back to the old deployment and re-enable writes there. If users have already written data to both sides, stop and reconcile rather than blindly overwriting either database. Preserve both backups.
7. After a stable period and successful offsite backup restore rehearsal, revoke unused cloud credentials and retire old paid services deliberately.

## 9. Backups, maintenance, and monitoring

- `ops/backup-production-database.sh` creates a private custom-format PostgreSQL dump from the production Compose database, validates the archive and checksum, and prunes local dumps by `NUDRA_BACKUP_RETENTION_DAYS` (default 30). Run it from the deployment directory containing `.env.production`; keep output off the web root and copy both files to encrypted offsite storage. Schedule it daily only after an offsite copy path is configured and tested. This script backs up PostgreSQL only; it does not back up MinIO objects.
- Back up MinIO video, HLS, thumbnail, and resource objects separately and coordinate object and database snapshots so restored URLs continue to resolve. Retain daily and weekly generations and periodically restore both into a disposable environment.
- Keep Postgres/Redis/MinIO data in named persistent volumes. Back up the app database and object files together so URLs continue to resolve after restore.
- Monitor disk (especially video growth), RAM, CPU/transcode queue depth, HTTP error rate, TLS renewal, failed login rates, Postgres connections, Redis memory, MinIO capacity, and provider usage/costs.
- Apply OS and container image security updates on a planned cadence. Back up before updates; pin/review image versions rather than deploying arbitrary `latest` tags.
- Use least-privilege provider keys, separate production/development credentials, rotate secrets if exposed, and never include secret values in logs or support messages.
- A single VPS is not high availability. A disk, host, or region outage takes the whole app offline; offsite backups reduce data-loss risk but do not provide automatic failover.

## Current blockers and user actions

This repository can prepare deployment code and a migration runbook, but it cannot provision a Hostinger server without the account action and server details. Before go-live, you still need to buy/configure the VPS, enter secrets privately, provide the VPS IP through the environment, add/verify the DNS records, transfer existing files, and approve the DNS cutover. Do not share credentials in this chat.

Paid-course checkout is still a test-only integration; a real payment provider and verified payment webhooks are needed before accepting course payments. Review video upload limits, retention, terms, privacy, and backup storage costs before inviting a large number of users.
