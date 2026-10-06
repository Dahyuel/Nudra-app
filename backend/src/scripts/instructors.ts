// Review instructor applications from the terminal (the admin dashboard at
// /admin does the same thing in the browser).
//
//   npm run instructors -- list [pending|approved|rejected|all]   (default: pending)
//   npm run instructors -- show <email>
//   npm run instructors -- approve <email>
//   npm run instructors -- reject <email> [note...]
import { and, eq, desc, isNull } from 'drizzle-orm';
import { db } from '../db';
import { users, instructorApplications } from '../db/schema';
import { reviewInstructorApplication } from '../lib/instructorReview';

type Status = 'pending' | 'approved' | 'rejected';

const usage = () => {
  console.log(
    [
      'Usage:',
      '  npm run instructors -- list [pending|approved|rejected|all]',
      '  npm run instructors -- show <email>',
      '  npm run instructors -- approve <email>',
      '  npm run instructors -- reject <email> [note...]',
    ].join('\n')
  );
};

async function findApplication(email: string) {
  const rows = await db
    .select({ user: { id: users.id, name: users.name, email: users.email }, application: instructorApplications })
    .from(instructorApplications)
    .innerJoin(users, eq(instructorApplications.userId, users.id))
    .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.organizationId)))
    .limit(1);
  return rows[0] ?? null;
}

async function list(filter: Status | 'all') {
  const rows = await db
    .select({ user: { id: users.id, name: users.name, email: users.email }, application: instructorApplications })
    .from(instructorApplications)
    .innerJoin(users, eq(instructorApplications.userId, users.id))
    .where(filter === 'all'
      ? isNull(users.organizationId)
      : and(eq(instructorApplications.status, filter), isNull(users.organizationId)))
    .orderBy(desc(instructorApplications.createdAt));

  if (rows.length === 0) {
    console.log(`No ${filter === 'all' ? '' : filter + ' '}applications.`);
    return;
  }

  console.table(
    rows.map(({ user, application }) => ({
      email: user.email,
      name: user.name,
      status: application.status,
      subjects: application.subjects.slice(0, 40),
      years: application.experienceYears,
      applied: application.createdAt.toISOString().slice(0, 10),
    }))
  );
}

async function show(email: string) {
  const found = await findApplication(email);
  if (!found) {
    console.error(`No application found for ${email}`);
    process.exitCode = 1;
    return;
  }
  const { user, application } = found;
  console.log(
    [
      `Name:        ${user.name}`,
      `Email:       ${user.email}`,
      `Status:      ${application.status}`,
      `Subjects:    ${application.subjects}`,
      `Experience:  ${application.experienceYears} years`,
      `Portfolio:   ${application.portfolioUrl ?? '-'}`,
      `Applied:     ${application.createdAt.toISOString()}`,
      `Reviewed:    ${application.reviewedAt?.toISOString() ?? '-'}`,
      `Review note: ${application.reviewNote ?? '-'}`,
      '',
      'Bio:',
      application.bio,
    ].join('\n')
  );
}

async function review(email: string, decision: 'approved' | 'rejected', note: string | null) {
  const found = await findApplication(email);
  if (!found) {
    console.error(`No application found for ${email}`);
    process.exitCode = 1;
    return;
  }
  // The CLI is a deliberate admin action, so it may re-review decided applications.
  const result = await reviewInstructorApplication(found.user.id, decision, note, { force: true });
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  console.log(`${result.email} -> ${result.decision}`);
}

async function main() {
  const [command, arg, ...rest] = process.argv.slice(2);

  switch (command) {
    case 'list': {
      const filter = (arg ?? 'pending') as Status | 'all';
      if (!['pending', 'approved', 'rejected', 'all'].includes(filter)) return usage();
      return list(filter);
    }
    case 'show':
      if (!arg) return usage();
      return show(arg);
    case 'approve':
      if (!arg) return usage();
      return review(arg, 'approved', null);
    case 'reject':
      if (!arg) return usage();
      return review(arg, 'rejected', rest.join(' ').trim() || null);
    default:
      usage();
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
