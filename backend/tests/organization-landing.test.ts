// Runs the real organization router with temporary database fixtures, without
// starting video workers or sending emails. All fixtures are deleted afterwards.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'node:http';
import { inArray } from 'drizzle-orm';
import { db } from '../src/db';
import { users, organizations, orgMemberships, courses, sessions } from '../src/db/schema';
import router from '../src/routes/organizations';
import { resolveOrg } from '../src/middleware/resolveOrg';
import { defaultLandingPage, landingPageSchema } from '../src/lib/organizationLanding';

const run = randomUUID().slice(0, 8);
const userIds: string[] = [];
const orgIds: string[] = [];
let server: Server | undefined;
let base: string;
let org: typeof organizations.$inferSelect;
let otherOrg: typeof organizations.$inferSelect;
let managerSession: string;
let studentSession: string;
let otherSession: string;

before(async () => {
  assert.notEqual(process.env.NODE_ENV, 'production', 'Use a development database for these tests.');
  const people = await db.insert(users).values([
    { name: 'Landing QA manager', email: 'landing-manager-' + run + '@nudra.test', passwordHash: randomUUID(), role: 'organization_manager' },
    { name: 'Landing QA student', email: 'landing-student-' + run + '@nudra.test', passwordHash: randomUUID(), role: 'student' },
    { name: 'Landing QA other manager', email: 'landing-other-' + run + '@nudra.test', passwordHash: randomUUID(), role: 'organization_manager' },
  ]).returning();
  userIds.push(...people.map((person) => person.id));
  const orgs = await db.insert(organizations).values([
    { name: 'Landing QA ' + run, slug: 'landing-qa-' + run, ownerId: people[0].id },
    { name: 'Landing other QA ' + run, slug: 'landing-other-' + run, ownerId: people[2].id },
  ]).returning();
  orgIds.push(...orgs.map((item) => item.id));
  [org, otherOrg] = orgs;
  await db.insert(orgMemberships).values([{ orgId: org.id, userId: people[0].id, role: 'organization_manager', status: 'active' }]);
  const sessionRows = await db.insert(sessions).values(people.map((person) => ({ userId: person.id, expiresAt: new Date(Date.now() + 3600000) }))).returning();
  [managerSession, studentSession, otherSession] = sessionRows.map((row) => row.id);
  await db.insert(courses).values([
    { title: 'QA online', isPublished: true, approvalStatus: 'approved', organizationId: org.id },
    { title: 'QA offline', isPublished: true, approvalStatus: 'approved', deliveryMode: 'offline', organizationId: org.id, bookingUrl: 'https://example.org/booking', location: 'QA classroom', scheduleText: 'Saturday' },
    { title: 'QA unpublished', isPublished: false, approvalStatus: 'approved', organizationId: org.id },
    { title: 'QA pending', isPublished: true, approvalStatus: 'pending', organizationId: org.id },
    { title: 'QA other organization', isPublished: true, approvalStatus: 'approved', organizationId: otherOrg.id },
  ].map((course) => ({ ...course, instructorId: people[0].id, description: 'QA course description', category: 'General', level: 'All levels' })));
  const app = express();
  app.use(express.json()); app.use(cookieParser()); app.use(resolveOrg); app.use('/api/organizations', router);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ message: err.message }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  try {
    if (orgIds.length) {
      await db.delete(courses).where(inArray(courses.organizationId, orgIds));
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
    }
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  } finally { await db.$client.end(); }
});

async function request(path: string, method = 'GET', session?: string, body?: unknown) {
  const response = await fetch(base + '/api/organizations' + path, { method,
    headers: { 'X-Organization-Slug': org.slug, ...(session ? { Cookie: 'session_id=' + session } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() as any };
}

test('template validation rejects unknown sections, scripts in image URLs, duplicate IDs, and empty pages', () => {
  const page = defaultLandingPage(org);
  assert.equal(landingPageSchema.safeParse(page).success, true);
  assert.equal(landingPageSchema.safeParse({ ...page, html: '<script>bad()</script>' }).success, false);
  const unsafe = structuredClone(page);
  unsafe.content[0].props = { ...unsafe.content[0].props, imageUrl: 'javascript:alert(1)' } as any;
  assert.equal(landingPageSchema.safeParse(unsafe).success, false);
  const hidden = structuredClone(page);
  hidden.content.forEach((section) => section.props.enabled = 'no');
  assert.equal(landingPageSchema.safeParse(hidden).success, false);
  const duplicate = structuredClone(page);
  duplicate.content[1].props.id = duplicate.content[0].props.id;
  assert.equal(landingPageSchema.safeParse(duplicate).success, false);
});

test('public course metadata is scoped to approved published courses of the current organization', async () => {
  const response = await request('/public-current');
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.courses.map((course: any) => course.title).sort(), ['QA offline', 'QA online']);
  assert.equal('draft' in response.data, false);
  assert.equal('ownerId' in response.data.organization, false);
});

test('only a manager of the current organization can edit the landing page', async () => {
  const path = '/' + org.id + '/landing-page';
  assert.equal((await request(path)).status, 401);
  assert.equal((await request(path, 'GET', studentSession)).status, 403);
  assert.equal((await request(path, 'GET', otherSession)).status, 403);
  assert.equal((await request('/' + otherOrg.id + '/landing-page', 'GET', managerSession)).status, 403);
  assert.equal((await request(path, 'GET', managerSession)).status, 200);
  assert.equal((await request(path, 'PUT', studentSession, { data: defaultLandingPage(org), expectedRevision: 0, publish: true })).status, 403);
});

test('drafts stay private, publishing is explicit, and stale saves cannot overwrite newer edits', async () => {
  const path = '/' + org.id + '/landing-page';
  const page = defaultLandingPage(org);
  (page.content[0].props as any).title = 'QA unpublished headline';
  let saved = await request(path, 'PUT', managerSession, { data: page, expectedRevision: 0, publish: false });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.revision, 1);
  assert.notEqual((await request('/public-current')).data.landingPage.content[0].props.title, 'QA unpublished headline');
  assert.equal((await request(path, 'PUT', managerSession, { data: page, expectedRevision: 0, publish: true })).status, 409);
  saved = await request(path, 'PUT', managerSession, { data: page, expectedRevision: 1, publish: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await request('/public-current')).data.landingPage.content[0].props.title, 'QA unpublished headline');
  page.content.reverse();
  (page.content.find((section) => section.type === 'Hero')!.props as any).title = 'QA second draft';
  assert.equal((await request(path, 'PUT', managerSession, { data: page, expectedRevision: 2, publish: false })).status, 200);
  assert.equal((await request('/public-current')).data.landingPage.content[0].props.title, 'QA unpublished headline');
  assert.equal((await request(path, 'GET', managerSession)).data.draft.content[0].type, 'CTA');
  assert.equal((await request(path, 'PUT', managerSession, { data: { ...page, content: [] }, expectedRevision: 3, publish: true })).status, 400);
});
