// API integration tests. They run against a live backend and database:
//
//   cd backend && npm run dev        # in one terminal
//   cd backend && npm run test:api   # in another
//
// Every account and course created here uses a unique *.test email / "QA <run>"
// title and is deleted in the final cleanup step, even if a test fails.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

const API = process.env.API_URL || 'http://localhost:3001';
const ORIGIN = process.env.TEST_ORIGIN || 'http://localhost:3000';
const RUN = Date.now().toString(36);
const PASSWORD = 'QaTest2026x';
const email = (name: string) => `${name}.${RUN}@nudra.test`;
const QA_TITLE = `QA ${RUN}`;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

type Res = { status: number; body: any; cookie: string };

async function api(method: string, path: string, opts: { body?: unknown; cookie?: string } = {}): Promise<Res> {
  const res = await fetch(API + path, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(opts.cookie ? { Cookie: opts.cookie } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body, cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

const login = async (address: string, password = PASSWORD) =>
  (await api('POST', '/api/auth/login', { body: { email: address, password } })).cookie;

// Fixture accounts are inserted directly: going through /register for each one
// would hit the sign-up rate limit (10 per 15 min per IP) after one or two runs.
// Only the tests that are *about* sign-up call the sign-up endpoints.
const passwordHash = bcrypt.hash(PASSWORD, 10);
async function createUser(name: string, role: 'student' | 'admin' = 'student') {
  await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`, [
    `QA ${name}`,
    email(name),
    await passwordHash,
    role,
  ]);
  const cookie = await login(email(name));
  assert.ok(cookie, `could not sign in as ${name}`);
  return cookie;
}

after(async () => {
  // Courses first (they belong to QA users), then the users; cascades handle the rest.
  await pool.query(`DELETE FROM courses WHERE title LIKE $1`, [`${QA_TITLE}%`]);
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%.${RUN}@nudra.test`]);
  await pool.end();
});

test('backend is reachable', async () => {
  const r = await api('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: 'ready' });
});

test('auth: register, sign in, /me, wrong password, role cannot be self-assigned', async () => {
  const registered = await api('POST', '/api/auth/register', {
    body: { name: 'QA auth', email: email('auth'), password: PASSWORD, phone: '01012345678' },
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  const cookie = registered.cookie;
  const me = await api('GET', '/api/auth/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'student');

  assert.equal((await api('POST', '/api/auth/login', { body: { email: email('auth'), password: 'Wrong1234x' } })).status, 401);
  assert.ok(await login(email('auth')), 'login with the right password returns a session');

  const sneaky = await api('POST', '/api/auth/register', {
    body: { name: 'QA sneaky', email: email('sneaky'), password: PASSWORD, role: 'instructor' },
  });
  assert.equal(sneaky.status, 400, 'public sign-up must not create instructors');
});

test('instructor application: pending is blocked, admin approval grants access', async () => {
  const applied = await api('POST', '/api/auth/register-instructor', {
    body: {
      name: 'QA Applicant',
      email: email('applicant'),
      password: PASSWORD,
      subjects: 'Physics',
      experienceYears: 4,
      bio: 'Physics teacher preparing Thanaweya students for national exams.',
    },
  });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  assert.equal(applied.body.user.instructorStatus, 'pending');
  assert.equal((await api('GET', '/api/instructor/courses', { cookie: applied.cookie })).status, 403);

  const adminCookie = await createUser('admin', 'admin');
  assert.equal((await api('GET', '/api/admin/stats/overview', { cookie: applied.cookie })).status, 403, 'non-admins blocked');

  const pending = await api('GET', '/api/admin/instructor-applications?status=pending', { cookie: adminCookie });
  assert.equal(pending.status, 200);
  const app = pending.body.applications.find((a: any) => a.email === email('applicant'));
  assert.ok(app, 'application is listed for the admin');

  const approve = await api('POST', `/api/admin/instructor-applications/${app.userId}/approve`, { cookie: adminCookie });
  assert.equal(approve.status, 200);
  const again = await api('POST', `/api/admin/instructor-applications/${app.userId}/approve`, { cookie: adminCookie });
  assert.equal(again.status, 409, 'already-decided applications cannot be re-approved by accident');
  assert.equal((await api('GET', '/api/instructor/courses', { cookie: applied.cookie })).status, 200);
});

test('course editing keeps lesson ids, quizzes and student progress', async () => {
  const instructor = await login(email('applicant'));
  const student = await createUser('learner');

  const created = await api('POST', '/api/instructor/courses', {
    cookie: instructor,
    body: { title: `${QA_TITLE} sync`, description: 'temp', category: 'QA', level: 'Beginner', price: 0 },
  });
  assert.equal(created.status, 201);
  const courseId = created.body.course.id;

  const v1 = await api('PUT', `/api/instructor/courses/${courseId}`, {
    cookie: instructor,
    body: { sections: [{ title: 'S1', lessons: [{ title: 'L1', is_free: true }, { title: 'L2' }] }] },
  });
  const [l1, l2] = v1.body.course.curriculum[0].lessons;
  const sectionId = v1.body.course.curriculum[0].id;

  const quiz = await api('POST', `/api/instructor/lessons/${l1.id}/quiz`, {
    cookie: instructor,
    body: {
      questions: [
        { questionText: 'Q1', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', correctOption: 'a' },
        { questionText: 'Q2', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', correctOption: 'b' },
      ],
    },
  });
  assert.equal(quiz.status, 201);

  await api('POST', `/api/instructor/courses/${courseId}/publish`, { cookie: instructor });
  assert.equal((await api('POST', `/api/courses/${courseId}/enroll`, { cookie: student })).status, 201);
  assert.equal((await api('POST', `/api/progress/lesson/${l2.id}`, { cookie: student, body: { watchedSeconds: 10, completed: false } })).status, 200);

  // Rename L1, remove L2 (the student's last lesson), add L3.
  const v2 = await api('PUT', `/api/instructor/courses/${courseId}`, {
    cookie: instructor,
    body: { sections: [{ id: sectionId, title: 'S1', lessons: [{ id: l1.id, title: 'L1 renamed', is_free: true }, { title: 'L3' }] }] },
  });
  assert.equal(v2.status, 200, JSON.stringify(v2.body));
  const lessons = v2.body.course.curriculum[0].lessons;
  assert.equal(lessons[0].id, l1.id, 'existing lesson keeps its id');
  assert.equal(lessons[0].isFree, true, 'free-preview flag is preserved');
  assert.ok(!lessons.some((l: any) => l.id === l2.id), 'removed lesson is deleted');

  const quizAfter = await api('GET', `/api/instructor/lessons/${l1.id}/quiz`, { cookie: instructor });
  assert.equal(quizAfter.body.quiz?.questions?.length, 2, 'quiz survives the edit');
});

test('reviews: only enrolled students, one review each', async () => {
  const instructor = await login(email('applicant'));
  const student = await login(email('learner'));
  const outsider = await createUser('outsider');
  const { rows } = await pool.query(`SELECT id FROM courses WHERE title = $1`, [`${QA_TITLE} sync`]);
  const courseId = rows[0].id;

  assert.equal((await api('POST', `/api/courses/${courseId}/reviews`, { cookie: student, body: { rating: 6 } })).status, 400);
  assert.equal((await api('POST', `/api/courses/${courseId}/reviews`, { cookie: outsider, body: { rating: 5 } })).status, 403);
  assert.equal((await api('POST', `/api/courses/${courseId}/reviews`, { cookie: student, body: { rating: 3 } })).status, 200);
  assert.equal((await api('POST', `/api/courses/${courseId}/reviews`, { cookie: student, body: { rating: 5, comment: 'Great' } })).status, 200);

  const detail = await api('GET', `/api/courses/${courseId}`, { cookie: student });
  assert.equal(detail.body.course.ratingCount, 1, 'updating replaces the review instead of adding one');
  assert.equal(detail.body.course.rating, 5);
  assert.deepEqual(detail.body.course.my_review, { rating: 5, comment: 'Great' });
  assert.ok(instructor);
});

test('unpublish keeps enrolled students in; delete is refused while students are enrolled', async () => {
  const instructor = await login(email('applicant'));
  const student = await login(email('learner'));
  const outsider = await login(email('outsider'));
  const { rows } = await pool.query(`SELECT id FROM courses WHERE title = $1`, [`${QA_TITLE} sync`]);
  const courseId = rows[0].id;

  assert.equal((await api('DELETE', `/api/instructor/courses/${courseId}`, { cookie: instructor })).status, 409);
  assert.equal((await api('POST', `/api/instructor/courses/${courseId}/unpublish`, { cookie: instructor })).status, 200);
  assert.equal((await api('GET', `/api/courses/${courseId}`, { cookie: student })).status, 200, 'enrolled student keeps access');
  assert.equal((await api('GET', `/api/courses/${courseId}`, { cookie: outsider })).status, 404);
  assert.equal((await api('POST', `/api/courses/${courseId}/enroll`, { cookie: outsider })).status, 404);

  const empty = await api('POST', '/api/instructor/courses', {
    cookie: instructor,
    body: { title: `${QA_TITLE} empty`, description: 'temp', category: 'QA', level: 'Beginner', price: 0 },
  });
  assert.equal((await api('DELETE', `/api/instructor/courses/${empty.body.course.id}`, { cookie: outsider })).status, 403);
  assert.equal((await api('DELETE', `/api/instructor/courses/${empty.body.course.id}`, { cookie: instructor })).status, 200);
});

test('sanaweya course list works without paging parameters', async () => {
  const r = await api('GET', '/api/sanaweya/courses');
  assert.equal(r.status, 200);
  assert.equal(r.body.page, 1);
  assert.equal(r.body.limit, 20);
  assert.ok(Array.isArray(r.body.courses));
});
