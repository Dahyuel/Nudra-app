import { queueEmail } from './emailOutbox';
import { db } from '../db';

const FROM: string = process.env.SMTP_FROM || 'Nudra Support <support@nudra.org>';
const INSTRUCTOR_FROM: string = process.env.INSTRUCTOR_INVITE_FROM || 'Nudra <no-reply@nudra.org>';
// The Vite dev server runs on port 3000 (see package.json); 5173 linked to nothing.
const FRONTEND_URL: string = process.env.FRONTEND_URL || 'http://localhost:3000';
const BASE_DOMAIN: string = process.env.BASE_DOMAIN || process.env.NUDRA_BASE_DOMAIN || 'nudra.org';
const LOGO_URL: string = process.env.MAIL_LOGO_URL || `${FRONTEND_URL}/nudra-text-logo.png`;

// Names and titles are user-provided; escape them before putting them in email HTML.
const esc = (value: string) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({to,subject,html}:SendEmailOptions, executor: Pick<typeof db,'execute'> = db):Promise<void> {
  await queueEmail({to,subject,html,from:FROM},executor);
}

function wrapper(bodyHtml: string): string {
  return `<!DOCTYPE html><html dir="ltr" lang="en"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background-color:#F8FAF9;font-family:Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:24px;"><div style="background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);"><div style="background-color:#2D6A4F;padding:24px;text-align:center;"><img src="${LOGO_URL}" alt="Nudra" width="150" style="display:block;width:150px;max-height:72px;object-fit:contain;margin:0 auto;" /><p style="margin:10px 0 0;color:#D8F3DC;font-size:13px;">Your learning space</p></div><div style="padding:28px 24px;text-align:left;">${bodyHtml}</div><div style="background-color:#F8FAF9;padding:16px 24px;text-align:center;"><p style="margin:0;color:#9CA3AF;font-size:11px;">© Nudra</p></div></div></div></body></html>`;
}

function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background-color:#2D6A4F;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:14px;">${label}</a></div>`;
}

export async function sendWelcomeEmail(user: { name: string; email: string; role: string },executor: Pick<typeof db,'execute'> = db): Promise<void> {
  const dashboard = user.role === 'instructor' ? '/instructor/dashboard' : '/dashboard';
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">Welcome to Nudra, ${esc(user.name)}!</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">Your account is ready. We’re glad you’re here.</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">Explore your courses and learning tools whenever you’re ready.</p>` +
      button(`${FRONTEND_URL}${dashboard}`, 'Open Nudra')
  );
  await sendEmail({ to: user.email, subject: 'Welcome to Nudra', html },executor);
}

export async function sendEnrollmentEmail(
  user: { name: string; email: string },
  course: { title: string },
  executor: Pick<typeof db,'execute'> = db
): Promise<void> {
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">You’re enrolled</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">Hi ${esc(user.name)}, you now have access to:</p>` +
      `<p style="margin:0 0 8px;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(course.title)}</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">You can start watching lessons and continue learning now.</p>` +
      button(`${FRONTEND_URL}/my-courses`, 'Open my courses')
  );
  await sendEmail({ to: user.email, subject: `You’re enrolled in ${course.title}`, html },executor);
}

export async function sendCertificateEmail(
  user: { name: string; email: string },
  course: { title: string },
  certCode: string,
  executor: Pick<typeof db,'execute'> = db
): Promise<void> {
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">Congratulations, ${esc(user.name)}!</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">You’ve completed:</p>` +
      `<p style="margin:0 0 8px;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(course.title)}</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">Certificate code: <span style="font-weight:700;color:#1B1B1B;">${esc(certCode)}</span></p>` +
      button(`${FRONTEND_URL}/progress`, 'View certificate')
  );
  await sendEmail({ to: user.email, subject: 'Your Nudra course certificate', html },executor);
}

export async function sendCommunityReplyEmail(
  user: { name: string; email: string },
  post: { title: string; courseId: string | null }
): Promise<void> {
  const link = post.courseId ? `${FRONTEND_URL}/course/${post.courseId}/community` : `${FRONTEND_URL}/community`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">A new reply to your post</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">Hi ${esc(user.name)}, someone replied to:</p>` +
      `<p style="margin:0;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(post.title)}</p>` +
      button(link, 'View reply')
  );
  await sendEmail({ to: user.email, subject: 'New reply on Nudra', html });
}

export async function sendOrganizationInstructorInviteEmail(input: {
  name: string;
  email: string;
  organizationName: string;
  organizationSlug: string;
  membershipId: string;
  setupToken?: string;
}, executor: Pick<typeof db, 'execute'> = db): Promise<void> {
  const link = organizationScopedUrl('/organization', input.organizationSlug, { invite: input.membershipId });
  const setupLink = input.setupToken
    ? organizationScopedUrl('/reset-password', input.organizationSlug, { token: input.setupToken, setup: '1' })
    : null;
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">You’re invited to teach on Nudra</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">Hi ${esc(input.name)}, ${esc(input.organizationName)} invited your instructor account to join its learning space.</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">Your instructor login email is <strong>${esc(input.email)}</strong>. ${setupLink ? 'Create your password using the secure link below. You will be asked to change it after your first sign in.' : 'Sign in with this email address to accept the invitation.'}</p>` +
      (setupLink ? button(setupLink, 'Create instructor password') : '') +
      button(link, 'Review invitation')
  );
  await queueEmail({to:input.email,subject:'Instructor invitation from '+input.organizationName,html,from:setupLink?INSTRUCTOR_FROM:FROM}, executor);
}

type OrganizationResetContext = {
  slug: string;
  customDomain?: string | null;
  customDomainStatus?: string | null;
  customDomainVerifiedAt?: Date | string | null;
};

function organizationScopedUrl(path: string, slug: string, values: Record<string, string> = {}): string {
  const query = new URLSearchParams({ ...values, org: slug });
  if (process.env.NODE_ENV === 'production') {
    const baseDomain = BASE_DOMAIN.trim().toLowerCase();
    if (/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(baseDomain) && !baseDomain.includes('..')) {
      const url = new URL(`https://${slug}.${baseDomain}${path}`);
      url.search = query.toString();
      return url.toString();
    }
  }

  const url = new URL(path, FRONTEND_URL);
  url.search = query.toString();
  return url.toString();
}

function organizationResetLink(token: string, organization: OrganizationResetContext): string {
  const query = new URLSearchParams({ token });
  const customDomain = organization.customDomain?.trim().toLowerCase();
  if (customDomain && organization.customDomainStatus === 'active' && organization.customDomainVerifiedAt) {
    // The domain comes from the database's active verified-domain record. Still
    // validate its shape so corrupted data cannot inject a URL or path.
    const safeHostname = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(customDomain) && !customDomain.includes('..');
    if (safeHostname) {
      const url = new URL(`https://${customDomain}/reset-password`);
      if (url.hostname === customDomain && !url.username && !url.password) {
        query.set('org', organization.slug);
        url.search = query.toString();
        return url.toString();
      }
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    return organizationScopedUrl('/reset-password', organization.slug, { token });
  }

  const baseDomain = BASE_DOMAIN.trim().toLowerCase();
  if (/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(baseDomain) && !baseDomain.includes('..')) {
    const url = new URL(`https://${organization.slug}.${baseDomain}/reset-password`);
    url.search = query.toString();
    return url.toString();
  }

  // Configuration fallback remains organization-scoped in the frontend API.
  return organizationScopedUrl('/reset-password', organization.slug, { token });
}

export async function sendPasswordResetEmail(
  user: { name: string; email: string },
  token: string,
  organization?: OrganizationResetContext,
  executor: Pick<typeof db,'execute'> = db,
): Promise<void> {
  const link = organization
    ? organizationResetLink(token, organization)
    : `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">Reset your password</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">Hi ${esc(user.name)}, we received a request to reset your Nudra password.</p>` +
      button(link, 'Choose a new password') +
      `<p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.8;">This link expires in 30 minutes and can only be used once. If you didn’t request it, you can ignore this email.</p>`
  );
  await sendEmail({ to: user.email, subject: 'Reset your Nudra password', html },executor);
}
