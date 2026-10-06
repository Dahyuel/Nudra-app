# Nudra full platform implementation plan

Prepared: 6 October 2026. Baseline: repository commit `4465cbb`.

This is the implementation specification and delivery sequence for the next product iteration. It does not mean these features are already implemented or deployed. Existing code was inspected for this plan; production behavior still needs runtime verification.

## 1. Product contract

Nudra has two learning spaces running on the same VPS application:

| Space | Entry point | Content | Account and access |
|---|---|---|---|
| Nudra | Main Nudra domain | General courses and Academic | Nudra account; course-specific enrollment |
| An organization | Its Nudra subdomain or verified custom domain | That organization's published courses and services | Separate organization registration/login; manager approval required |

The main student navigation becomes Dashboard, Courses, Academic, Organizations, My Learning, Community, AI Tutor, and Progress. Settings, Help, appearance, and logout remain in the profile menu. Academic contains School and University. Existing Sanaweya content becomes part of School rather than a separate top-level product.

The organization student navigation becomes Dashboard, Courses, My Learning, Bookings, Calendar, Community, Progress, and enabled AI features. Managers can enable supported modules within their plan. These pages contain organization data only. The organization portal does not show the Nudra general catalog or Academic navigation.

Only platform admins create organizations, as previously requested. New organization self-service creation is a possible later business decision, not a launch requirement.

## 2. Current implementation and gaps

| Area | Code currently present | Required work |
|---|---|---|
| Main learning experience | Catalog, course player, progress, quizzes, community, AI, instructor pages | Generalize discovery, replace Sanaweya-only navigation, verify actual page behavior |
| Academic | Sanaweya pages/routes and grade/subject fields | Curriculum, school, university, faculty, program, and module catalog |
| Organization discovery | Admin organization listing and tenant landing pages | Student-facing directory, approved public metadata, discovery filters and destination links |
| Authentication | One global unique email/password in `users`; sessions identify only a user | Independent organization account credentials, tenant-bound sessions, scope-specific roles |
| Organization operations | Membership requests/reviews, instructor invites, course creation/review, branding | Complete journeys, lifecycle controls, granular permissions and notifications |
| Tenant learning | A basic organization portal and some scoped course/AI routes | Full student/instructor dashboards; all learning modules scoped consistently |
| Landing editor | Puck-based limited components, drafts, publishing, revision checks | Branding on auth/dashboard pages, asset library, page versions, preview and SEO |
| Offline courses | Delivery mode, location, schedule, capacity and external booking URL | Native sessions, seat inventory, bookings, cancellations, attendance and waitlists |
| Payments | Provider interface and test checkout; test mode blocked in production | Verified real provider, atomic enrollment, refunds, organization billing and settlement rules |
| SaaS commercial features | No complete subscription/entitlement model found | Plans, usage limits, subscriptions, invoices, renewals and lifecycle states |
| Infrastructure | VPS Compose, private services, Caddy, MinIO, Redis and migration scripts | Runtime rehearsal, correctness fixes, backups, alerts, CI and controlled deployment |

The frontend pages and backend routes are useful foundations; their presence alone is not a completion guarantee.

## 3. Decisions for implementation

1. Keep the existing React/Vite frontend, Node/Express API, Socket.IO, PostgreSQL/pgvector, Redis/BullMQ, MinIO, Caddy and separate video worker. Continue Resend, Groq transcription, and hosted Qwen for production AI. Avoid a framework rewrite during the platform expansion.
2. Use separate account realms: one platform realm and one realm for each organization. The same email can register independently in Nudra, Org A, and Org B, with different passwords and profiles. Approval belongs to one organization only.
3. Each account gets one or more scoped role assignments. Being an organization instructor does not grant permission to publish on Nudra or manage another organization. Instructors may also learn as students in their own realm.
4. Each hostname resolves to a server-validated realm. Session, resource, role, and realm must all agree. Host headers or client-provided organization IDs alone cannot grant access.
5. Main-domain Organizations is a discovery directory. Selecting a card opens the organization's active primary domain; use its valid Nudra subdomain when no active custom domain exists. Directory navigation does not automatically log the student into that organization.
6. Public organization pages may show safe published course summaries; full learning access requires an approved account and any required course enrollment. Organization approval and purchasing/enrolling in a course are separate actions.
7. Use shared UI components with realm-aware layouts and server permissions. Avoid creating a second copy of every course player, quiz and progress component.
8. Use English/LTR by default and Arabic/RTL when explicitly selected. Store language preference per realm account; isolate email addresses, codes and mixed-language text correctly.
9. Catalog records and organizations have archive/suspension states. Deletion must never make an organization course a public Nudra course.
10. Launch pricing and financial arrangements remain business inputs. Implement configurable entitlements; do not hardcode prices or promise unlimited video/AI use.

## 4. Accounts, permissions and membership

Introduce account realms, realm accounts, scoped roles, invitations, email verification, account links, and realm-bound session/reset records. Use a unique constraint on realm plus normalized email. Every active account belongs to exactly one realm; optional links between accounts require explicit verification of both accounts.

| Role | Scope | Permissions |
|---|---|---|
| Platform administrator | Nudra platform | Catalog governance, organizations, platform instructors, billing operations, reports and audited support |
| Nudra instructor | Nudra | Own courses, students in those courses, assessments, approved analytics and earnings |
| Nudra student | Nudra | Nudra learning, Academic, purchases, progress and organization directory |
| Organization owner/manager | One organization | Members, invitations, course approvals, branding, billing and permitted reporting |
| Organization instructor | One organization | Assigned/owned courses, assessments and students in those courses; submit publication requests |
| Organization student | One organization | Approved organization's learning and bookings subject to course access |
| Organization support/content staff | Later configurable role | Explicit delegated permissions, no automatic manager or financial rights |

Membership states: pending, active, rejected, suspended, withdrawn. Invitations have separate invited/accepted/expired/revoked states. State changes are server-controlled, transactional, audited and visible to the affected member.

Registration journey: open organization domain, register organization account, verify email, see pending approval screen, manager approves/rejects, receive branded notice, enter the organization's student dashboard after approval. Pending users can view status, help, account settings and logout; they cannot open private lessons or AI context. Suspension revokes learning access and relevant sessions promptly.

Instructor invitations use `no-reply@nudra.org`, organization branding, and an expiring single-use activation link. Keep the existing requirement to establish/change the password before access. Credentials and reset links must apply only to the intended realm; sending reusable plaintext passwords is not the new flow.

Require MFA for administrators and organization owners/managers before commercial launch. Add session/device management, secure logout, email change verification, account recovery and security event reporting. Privileged support access must be explicit, time-limited and audited.

Existing-account migration must preserve Nudra IDs where possible. Create organization account mappings for existing memberships, migrate each tenant's dependent learning records consistently, and issue password-setup links for new tenant credentials. Do not silently copy a shared password into multiple unrelated organizations. Test the mapping with accounts that belong to more than one organization and have different roles.

## 5. Academic and general course catalog

The catalog is structured data managed by platform administrators, with bilingual labels, slugs, descriptions, display order, visibility, provenance and archive status.

| Catalog | Browsing hierarchy | Important metadata |
|---|---|---|
| Courses | Field → specialization → course | Topic, skill, difficulty, language, prerequisites and learning outcomes |
| School | Curriculum → stage/qualification → grade/year → subject → course | Country, board where relevant, syllabus code, syllabus version and exam session |
| University | University → faculty → program/major → module → learning course | Campus, degree level, academic year/semester, module code and prerequisites |

Start School with configurable records for Egyptian National, IGCSE/British, IB, American Diploma and other requested curricula. Board/qualification/year are optional curriculum-specific fields; do not force all curricula into Egyptian grade labels. Add universities and faculties through verified data imports and admin tools, rather than inventing a complete national list. A module such as Calculus can have multiple learning courses from different instructors. Do not imply official university affiliation unless confirmed.

Data entities: catalog fields/topics, school curricula, exam boards, qualifications/stages, grades, subjects, syllabus versions, universities, faculties, programs, academic modules, and course classification associations. Validate the full parent relationship at save time. University programs can share modules. Courses may be associated with multiple suitable subjects/modules without duplicating the course or progress records.

Migrate existing Sanaweya courses, exams and profiles into the National school track, preserving IDs, enrollments, certificates, AI chunks and URLs. Add redirects for old `/sanaweya` paths. Record uncertain mappings for admin review; never guess a course's university or syllabus.

Student onboarding can select interests, school curriculum/grade, or university/program. These preferences personalize discovery and dashboards; they do not grant course access. Students can explore other tracks.

Catalog UX includes hierarchical breadcrumbs, combined filters, sorting, pagination, bookmark/wishlist, meaningful empty states, and links that remain shareable. Course authoring offers dependent academic selectors. Admins can merge/archive catalog records without losing enrollments.

## 6. Organization product and branding

Add a Nudra Organizations directory with search, category/location filters, organization cards, safe course counts, active destination URLs and verified branding. Organizations can be listed or unlisted, subject to admin governance. Public discovery never reveals member identities, enrollment histories or private courses.

Expand organization management into Dashboard, Members/Requests, Instructors, Courses/Approvals, Bookings, Landing Page, Branding/Domain, Analytics, Billing, and Settings. Add bulk invitations/imports with validation, role delegation, suspension/reinstatement and audited approval decisions.

Preserve the existing limited Puck editor. Support approved sections: hero, about, course feed, programs/services, instructor highlights, FAQs, contact and enrollment CTA. Allow ordering, supported content, visibility, theme tokens and uploaded assets. Keep arbitrary scripts, CSS and executable embeds out of manager-authored content. Add preview, responsive controls, page versions, rollback and published/draft status. Only approved published courses appear dynamically.

Propagate permitted branding to login/register/reset pages, loading/error states, student/instructor dashboards and email templates. Enforce theme contrast, image validation, asset ownership and size limits. Add per-domain title, metadata, social preview, favicon, canonical URLs, robots rules and sitemap; verify rendered metadata for the SPA instead of assuming client-side title changes cover previews.

Domain lifecycle: requested, DNS ownership verified, HTTPS pending, active, error, removed. Track DNS and certificate health separately. Support domain replacement, ownership rechecks, safe removal, conflict resolution and renewal alerts. Resolve DNS record labels correctly for both apex and nested subdomains. Define primary-domain redirects before login; avoid cross-domain cookies or token-bearing redirect URLs.

## 7. Online learning, offline bookings and instructor workflows

Online course workflow: draft → submitted → approved/rejected → published → archived. Managers can author courses and assign one or more active instructors. Use course-instructor assignments with lead/editor permissions; the current single `instructorId` does not represent multiple instructors. Approved live-course edits should use revisions so learners can continue using the published version while a manager reviews changes, including curriculum and media changes.

Complete reusable learning modules in both spaces: videos, resources, captions/transcripts, quizzes, assignments, progress, certificates, announcements and course discussions. Apply realm plus course access to every API, media request, transcript, export, notification and Socket.IO room. Personal dashboards must use actual progress and deadlines rather than display-only metrics.

Offline offerings remain booking products. Add venues, course runs/cohorts, scheduled sessions, seat capacity, bookings, attendance, cancellation policy and waitlists. Use atomic seat reservations with expiry and idempotent confirmation to avoid overbooking. Online enrollment must never grant offline attendance, and offline booking must not accidentally unlock online material. A later hybrid mode can combine explicit entitlements.

Student booking journey: select run/session, see availability and terms, reserve/pay where applicable, get confirmation/calendar entry, cancel within policy, receive reminders, attend, and obtain a receipt or attendance record. Managers/instructors get attendance and booking reports. External booking URLs can remain an explicit transitional option.

Instructor tools: course builder, reusable question banks, assignment grading/rubrics, learner progress, announcements, course analytics, moderation and realistic earnings records. Platform approval and organization approval are separate. Existing instructor accounts retain only their intended realm permissions during migration.

## 8. AI and differentiated learning features

Complete the existing provider abstraction and validated development/production configurations. Development may use local/deepseek providers; production uses Groq `whisper-large-v3-turbo` and a confirmed Qwen endpoint/model. Verify available chat and embedding model IDs, compatible embedding dimensions, API limits and cost before production; current example model strings are configuration placeholders until tested.

AI retrieval must filter by realm, authorized course, enrollment, published content and embedding provider/version. Re-embedding jobs need explicit state and versioned indexes so incompatible vectors are not mixed. Never let user prompts choose a different tenant or unlock a course.

High-value differentiators to deliver after reliable fundamentals:

- Curriculum-aware tutoring with references to the actual authorized lesson/syllabus and clear unsupported-answer handling.
- A mastery map connecting quiz mistakes to learning outcomes and suggested revision.
- Spaced-repetition flashcards and a daily revision queue based on learner performance.
- Exam readiness planning using the student's track and exam date, with approved question banks.
- University prerequisite maps and module pathways, without claiming official university credit.
- Organization interventions that show instructors which learners may need support, with visible reasons and human review.
- Arabic/English explanations, accessible captions, low-bandwidth playback and downloadable permitted study resources.

Put AI-generated assessments into instructor review before official use. Enforce per-realm usage limits, provider timeouts, cancellation, budget controls and auditable usage. No unsupported guarantee of uniqueness, guaranteed grades or unlimited AI/video capacity.

## 9. SaaS plans, billing and commerce

Implement organization plans as configurable features and metered limits: active members, instructors, storage, video processing, AI usage, domains, analytics and supported modules. Admin-created organizations can begin with a trial or manually assigned plan. Define active, trial, past_due, suspended and cancelled lifecycle behavior, grace periods and read-only/export rules; retention is a documented business policy.

Treat organization subscriptions, course purchases and offline bookings as distinct financial flows. Create plan versions, subscriptions, billing periods, usage ledgers, invoices, payment events, refunds, payouts where legally/operationally supported, and entitlement checks on the server. Enforce limits during operations and reservations, not just in UI buttons.

Integrate one real payment provider after merchant eligibility, supported methods, currency, recurring-payment capability and signed webhook behavior are confirmed. The business must choose whether organizations collect their own money or Nudra collects and settles it; this determines merchant accounts, fees, payout handling and accounting. Recurring billing needs an approved provider capability or an explicit manual renewal flow.

Use server-calculated prices; verified, deduplicated webhook events; an immutable event/ledger history; transactional payment confirmation plus enrollment/booking; and reconciliation for missed or delayed callbacks. Refund/reversal policy must define access changes. Instructor earnings must follow settled transactions and actual commission rules. Persist invoice/receipt records; do not describe generated receipts as legally compliant tax invoices without business review.

## 10. Data and API architecture

Keep one modular backend initially, organized into identity, authorization, catalog, organizations, learning, booking, commerce, AI, notifications and operations services. Routes use shared services rather than reimplementing permissions. Validate input/output contracts and provide generated API documentation during implementation.

Use an explicit realm identifier on owned records and authenticated execution context. Domain aliases point to the same organization realm, not to a separate account database. Scope cache keys, storage keys, event rooms, queue jobs, exports and logs as well as SQL queries. Child resources must belong to their parent realm, protected by database constraints where possible. Index realm/owner/status foreign keys used by listings and access checks; paginate large collections.

Use PostgreSQL transactions for approval, invitation, enrollment, booking inventory, and financial state changes. Add an outbox so notifications and jobs are durably queued after a successful database change. Workers validate recorded realm/resource relationships and use idempotency keys. Add retry/dead-letter controls and graceful shutdown.

Add database RLS as an additional isolation layer using transaction-local account/realm context and a runtime role without BYPASSRLS. Migrate this in stages after auditing the current BYPASSRLS app role and testing application/background-job policies. Never use session-persistent tenant context on a reused connection. Platform-wide operations need a separate, audited authorization path. Existing API authorization remains required.

Use expand/backfill/verify/switch/contract migrations. Preserve old columns until dependent code and backfills are verified. Maintain a migration journal, advisory locking, validation reports, and rollback/forward-recovery instructions. Development must initialize an empty local database; production must support both a fresh install and importing existing data without blindly replaying the baseline schema.

## 11. Baseline fixes and current status

Phase 0 fixes are implemented and locally verified. The API and transcode worker run separately; worker concurrency and scratch cleanup are handled; numbered migrations support fresh and restored databases with an advisory lock; Nginx uses a full non-root-compatible configuration; organization course deletion is restricted; and paid order finalization commits enrollment atomically. The development launcher uses the local Compose database rather than the private `.env` Supabase URL, and local service ports bind to loopback.

Phase 1 adds separate global and organization accounts, realm-specific email uniqueness, per-organization student/instructor users, active manager authorization, pending-member learning guards, scoped learning/resource checks, and a verified-domain resolver that does not confuse custom domains with matching organization slugs. Existing tenant member records are remapped by their course's organization. Newly cloned tenant accounts require a password reset instead of reusing the global account's password hash. Course-less notifications remain with the global account because their tenant cannot be inferred safely.

Remaining before production:

1. Multipart admission is now atomic, limited to two active uploads per instructor and a configurable global cap, with an hourly Redis-backed start limit. Still verify retries after ambiguous completion, browser reload recovery, abandoned uploads, storage reservations/checksums and real end-to-end uploads above 100 MB.
2. Organization progress, notes, stats, quizzes, notifications, Sanaweya, payments and general/subject community remain intentionally unavailable where a full tenant-safe implementation is not ready. Add each module only with explicit organization scoping and acceptance checks.
3. Run browser walkthroughs and a complete staging boot; validate container/resource limits, secret handling, public firewall and trusted proxy behavior on the real VPS/Cloudflare setup. The PostgreSQL backup script does not back up MinIO objects or copy dumps offsite.

## 12. Security, reliability and delivery

Security work includes tenant-bound authentication, least-privilege authorization, privileged MFA, session revocation, CSRF protection, tenant-aware CORS, safe hostname/redirect handling, upload validation, rate limits and immutable audit events for sensitive actions. Test active suspension and role removal, not just initial login. Apply the [OWASP multi-tenant guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) and [authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) to implementation reviews.

Keep only Caddy public, with API/data/storage containers private and outbound access only where required. Review Docker forwarding and provider firewall rules together: published Docker ports can bypass normal UFW filtering. Verify this externally, following [Docker firewall guidance](https://docs.docker.com/engine/network/packet-filtering-firewalls/). Validate trusted proxy handling for real client IPs when Cloudflare is enabled so rate limits do not group all users behind an edge address.

Create development and staging profiles with local Postgres/Redis/MinIO and explicit AI/email switches. Add synthetic demo data for each role/realm and prevent development email jobs from contacting real users. Use Docker builds for consistent Node 24 runtime; validate environment variables before startup.

CI runs typechecks, relevant unit/integration tests, production builds, migration checks, dependency/secret scanning and container startup smoke checks. High-value tests cover isolation, credentials, permissions, payments, booking races and migration mappings. Use a dedicated test database and provider sandboxes. Code assertions and screenshots supplement runtime tests; build success is not an end-to-end pass.

Implement offsite encrypted database and object backups, automated schedules, retention and restore rehearsals. Keep assets and database backups coordinated. Add request IDs, structured redacted logs, health/readiness probes, queue metrics, storage/CPU/RAM alerts, TLS alerts and provider cost alerts. Agree recovery objectives after a measured restore exercise. A single VPS remains a single availability boundary.

Deployment must be repeatable: staging rehearsal, reviewed release, backup, database migration, service rollout, health checks, user journey checks and documented rollback. Preserve source data until migration/cutover verification. Resolve the oversized frontend bundle through route loading and measured optimization before mobile launch.

## 13. Delivery phases and completion gates

| Phase | Deliverable | Dependency | Completion gate | Status (6 Oct 2026) |
|---|---|---|---|---|
| 0 | Baseline fixes, staging/dev profiles, runtime startup | None | API and worker run independently; fresh/restored DB paths work; images boot; critical baseline defects resolved | Complete; local startup, worker split, Nginx config, payment atomicity and fresh/restored migrations verified |
| 1 | Realm identity, roles, sessions and tenant isolation | 0 | Same email has independent accounts in Nudra/A/B; copied cookies and resource IDs do not cross realms; approval/suspension enforced | Complete for current modules; migration and middleware checks passed on disposable PostgreSQL; some organization modules intentionally remain disabled |
| 2 | Academic catalog model, admin editor, imports and migration | 1 | General, school and university classifications work; Sanaweya data preserved; catalog relationships validated | Complete; API, migration, Academic navigation and admin editor built; restored-database migration and builds verified |
| 3 | Main Nudra discovery, Academic pages and Organizations directory | 2 | Student browses both academic tracks/general fields; directory opens the correct organization primary domain | Implemented: searchable public directory, Academic and home CTAs, verified-domain/subdomain links; no browser or live-domain walkthrough yet |
| 4 | Complete organization onboarding, student/instructor/manager dashboards | 1, 3 | Separate branded signup/login, pending/rejected/active flows and scoped learning modules work | Implemented for existing routes: student approval, scoped organization instructor studio, manager workload; modules without tenant guarantees remain blocked |
| 5 | Course assignments, revisions and complete online learning | 2, 4 | Manager-assigned and instructor-submitted courses work; live revision review preserves published lessons; quizzes/progress/resources scoped | Implemented: manager assignment, instructor submission, approval/rejection and re-review on edits; reassignment UI, rejection-note display and instructor decision notifications remain |
| 6 | Offline booking, cohorts, attendance and calendar | 4, 5 | Seat races cannot overbook; cancellation/waitlist/reminders work; offline access remains distinct | Core booking implemented: locked capacity, waitlist promotion, learner cancellation, session scheduling and attendance; reminders, cancellation policy, calendar integration and paid booking remain |
| 7 | Branding, landing editor versions, domains and SEO | 4 | Drafts stay private; rollback works; custom-domain HTTPS and auth work; mobile/accessibility checks pass | Editor and server-side revision history/restore implemented; domain onboarding/Caddy authorization exist; real TLS, SEO and browser/accessibility checks remain |
| 8 | Real course/booking commerce and organization subscriptions | 5, 6; merchant setup | Verified sandbox/live-approved payments, webhook replay, refunds, plan limits and billing lifecycle pass | Not launch-ready: test checkout only; real payment provider, merchant policy, subscriptions, refunds and usage entitlements require business/provider setup |
| 9 | AI tutoring completion, mastery/revision and metering | 2, 5, 8 | Tutor uses only authorized material, provider failures handled, usage/cost limits enforced and outputs reviewed | Local/cloud provider switches and request rate limits exist; production key/model verification, budget metering and plan-level quotas remain |
| 10 | Analytics, admin/support operations and accessibility/performance | 4–9 | Reports reconcile to actual data; scoped exports/moderation and critical keyboard/mobile journeys pass | Added route-level code splitting and upload admission controls; main entry is about 655 kB, while video/markdown chunks and support/audit/MFA/accessibility work remain |
| 11 | Migration rehearsal, backup recovery and production launch | All launch-critical gates | No unresolved critical isolation/payment/data-loss defect; complete restore and controlled pilot succeed | Added private PostgreSQL backup/checksum/retention script; offsite encryption, MinIO backup, full restore rehearsal, VPS hardening and production smoke/cutover remain |

Work can run in parallel only after account/realm contracts are stable. Catalog administration and learning UI can then be independent streams; billing depends on finalized access and booking rules. When agent delegation is requested for implementation, assign separate file ownership and merge through the same phase gates. Do not promise the full platform in one week; size and estimate each phase after its data and provider requirements are confirmed.

## 14. Required acceptance journeys

1. A Nudra student registers, browses a general field and both Academic tracks, enrolls, watches a lesson, completes an assessment and sees correct progress.
2. The same email registers independently in Org A and Org B; passwords, profiles, reset tokens and approval are independent. A role/session in one realm never unlocks another.
3. A student selects an organization from Nudra, lands on its branded active domain, registers, waits for approval, receives the decision, and enters only that organization's dashboard.
4. Managers can see/manage only their members and courses. A suspended student or instructor loses access on API, media, AI and realtime paths.
5. A manager invites an instructor and assigns a course; an instructor submits another course; rejection/revision/approval/publication work, including multi-instructor permissions.
6. A manager edits landing-page content, saves draft, publishes and rolls back. Draft assets/content and member information never leak through public endpoints.
7. Two students book the final offline seat concurrently; only one gets confirmation, and cancellation promotes the waitlist correctly.
8. Payment confirmation delivered twice creates one charge record and one enrollment/booking. A crash, delayed callback, refund or failed payment produces correct access and reconciliation.
9. Unknown or removed domains cannot acquire organization certificates or access tenant data. A domain change does not leak session/reset credentials.
10. Uploads over 100 MB complete through chunks with retries; reload/restart recovery, quotas, transcoding, transcription and private playback work.
11. Admin/manager MFA, session revocation, audit history, restore, application restart and provider failure recovery work in staging.
12. Existing account/course/enrollment/progress/file counts and ownership mappings reconcile after the upgrade, with documented exceptions reviewed before launch.

## 15. Business/user inputs and external work

Implementation can proceed with the defaults above. Before commercial launch, the owner must supply approved school/university catalog data, organization listing rules, plan prices/limits/trial periods, payment merchant decisions/accounts, instructor commission rules, booking/refund policies, retention/deletion rules, support contact and reviewed privacy/terms/age-related requirements. Organization tenants can include school students, so handling of minor accounts and consent needs an explicit policy.

The owner also provisions the VPS, controls DNS, supplies provider keys privately, confirms production Qwen model availability, authorizes real email/payment testing, provides offsite backup storage and approves final cutover. Coding work can prepare these integrations and scripts; real domain/payment/provider verification requires those external resources.

Phases 0–2 are implemented and locally verified. This establishes the runtime, identity boundary and catalog foundation; phases 3–11 remain future work before the full SaaS launch.
