// Review instructor applications until an admin UI exists.
//
//   npm run instructors -- list [pending|approved|rejected|all]   (default: pending)
//   npm run instructors -- show <email>
//   npm run instructors -- approve <email>
//   npm run instructors -- reject <email> [note...]
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { users, instructorApplications, notifications } from '../db/schema';
import { sendEmail } from '../lib/mailer';

type Status = 'pending' | 'approved' | 'rejected';

// Applicant names are user-controlled, so escape them before putting them in email HTML.
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

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
    .select({ user: users, application: instructorApplications })
    .from(instructorApplications)
    .innerJoin(users, eq(instructorApplications.userId, users.id))
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

async function list(filter: Status | 'all') {
  const rows = await db
    .select({ user: users, application: instructorApplications })
    .from(instructorApplications)
    .innerJoin(users, eq(instructorApplications.userId, users.id))
    .where(filter === 'all' ? undefined : eq(instructorApplications.status, filter))
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
  const { user } = found;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ instructorStatus: decision, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx
      .update(instructorApplications)
      .set({ status: decision, reviewNote: note, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(instructorApplications.userId, user.id));
    // Inserted directly: Socket.IO only exists inside the API server, so the
    // user sees this on their next page load rather than in real time.
    await tx.insert(notifications).values({
      userId: user.id,
      type: 'instructor_application',
      title: decision === 'approved' ? 'You are now a Nudra instructor' : 'Instructor application update',
      body:
        decision === 'approved'
          ? 'Your application was approved. You can now create and publish courses.'
          : `Your application was not approved.${note ? ` Note: ${note}` : ''}`,
      link: decision === 'approved' ? '/instructor/dashboard' : '/instructor/pending',
    });
  });

  await sendEmail({
    to: user.email,
    subject: decision === 'approved' ? 'Your Nudra instructor application was approved' : 'Your Nudra instructor application',
    html:
      decision === 'approved'
        ? `<p>Hi ${escapeHtml(user.name)},</p><p>Your application to teach on Nudra was approved. You can now sign in and open the Instructor Studio.</p>`
        : `<p>Hi ${escapeHtml(user.name)},</p><p>Unfortunately your application to teach on Nudra was not approved.</p>${
            note ? `<p>Note from the reviewer: ${escapeHtml(note)}</p>` : ''
          }`,
  }).catch((err) => console.warn('email failed (status was still updated):', err?.message ?? err));

  console.log(`${user.email} -> ${decision}`);
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
