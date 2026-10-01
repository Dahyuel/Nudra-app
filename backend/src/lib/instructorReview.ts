// Approve/reject instructor applications. Shared by the admin API and the
// `npm run instructors` script so both behave identically.
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users, instructorApplications, notifications } from '../db/schema';
import { sendEmail } from './mailer';
import { getIO } from './socket';

export type ReviewDecision = 'approved' | 'rejected';

export type ReviewResult =
  | { ok: true; email: string; decision: ReviewDecision }
  | { ok: false; status: 404 | 409; message: string };

// Applicant names and review notes are user/admin text, so escape them for email HTML.
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export async function reviewInstructorApplication(
  userId: string,
  decision: ReviewDecision,
  note: string | null,
  options: { force?: boolean } = {}
): Promise<ReviewResult> {
  const rows = await db
    .select({ user: users, application: instructorApplications })
    .from(instructorApplications)
    .innerJoin(users, eq(instructorApplications.userId, users.id))
    .where(eq(instructorApplications.userId, userId))
    .limit(1);

  const found = rows[0];
  if (!found) return { ok: false, status: 404, message: 'Application not found' };

  // Re-reviewing a decided application must be deliberate (e.g. un-rejecting someone).
  if (found.application.status !== 'pending' && !options.force) {
    return {
      ok: false,
      status: 409,
      message: `Application was already ${found.application.status}`,
    };
  }

  const { user } = found;
  const title = decision === 'approved' ? 'You are now a Nudra instructor' : 'Instructor application update';
  const body =
    decision === 'approved'
      ? 'Your application was approved. You can now create and publish courses.'
      : `Your application was not approved.${note ? ` Note: ${note}` : ''}`;
  const link = decision === 'approved' ? '/instructor/dashboard' : '/instructor/pending';

  const notification = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ instructorStatus: decision, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    await tx
      .update(instructorApplications)
      .set({ status: decision, reviewNote: note, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(instructorApplications.userId, user.id));
    const [inserted] = await tx
      .insert(notifications)
      .values({ userId: user.id, type: 'instructor_application', title, body, link })
      .returning();
    return inserted;
  });

  // Real-time push only exists inside the API server; the CLI skips it and the
  // user sees the notification on their next page load.
  try {
    getIO().to(`user:${user.id}`).emit(`notification:${user.id}`, notification);
  } catch {
    // Socket.IO not initialised (CLI context).
  }

  const name = escapeHtml(user.name);
  await sendEmail({
    to: user.email,
    subject:
      decision === 'approved'
        ? 'Your Nudra instructor application was approved'
        : 'Your Nudra instructor application',
    html:
      decision === 'approved'
        ? `<p>Hi ${name},</p><p>Your application to teach on Nudra was approved. You can now sign in and open the Instructor Studio.</p>`
        : `<p>Hi ${name},</p><p>Unfortunately your application to teach on Nudra was not approved.</p>${
            note ? `<p>Note from the reviewer: ${escapeHtml(note)}</p>` : ''
          }`,
  }).catch((err) => console.warn('instructor review email failed (status was still updated):', err?.message ?? err));

  return { ok: true, email: user.email, decision };
}
