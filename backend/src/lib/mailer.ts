import nodemailer from 'nodemailer';

const SMTP_HOST: string = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT: number = Number(process.env.SMTP_PORT || 1025);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false,
});

const FROM: string = process.env.SMTP_FROM || 'noreply@nudra.com';
// The Vite dev server runs on port 3000 (see package.json); 5173 linked to nothing.
const FRONTEND_URL: string = process.env.FRONTEND_URL || 'http://localhost:3000';

// Names and titles are user-provided; escape them before putting them in email HTML.
const esc = (value: string) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<void> {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (err) {
    console.warn('email send failed', err);
  }
}

function wrapper(bodyHtml: string): string {
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" /></head><body style="margin:0;padding:0;background-color:#F8FAF9;font-family:Quicksand,Arial,sans-serif;"><div style="max-width:560px;margin:0 auto;padding:24px;"><div style="background-color:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05);"><div style="background-color:#2D6A4F;padding:28px 24px;text-align:center;"><h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:800;">ندرة</h1><p style="margin:6px 0 0;color:#B7E4C7;font-size:13px;">منصة التعلم الذكية</p></div><div style="padding:28px 24px;">${bodyHtml}</div><div style="background-color:#F8FAF9;padding:16px 24px;text-align:center;"><p style="margin:0;color:#9CA3AF;font-size:11px;">© Nudra - ندرة</p></div></div></div></body></html>`;
}

function button(href: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;"><a href="${href}" style="display:inline-block;background-color:#2D6A4F;color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:12px;font-weight:700;font-size:14px;">${label}</a></div>`;
}

export async function sendWelcomeEmail(user: { name: string; email: string; role: string }): Promise<void> {
  const dashboard = user.role === 'instructor' ? '/instructor/dashboard' : '/dashboard';
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">أهلاً ${esc(user.name)}</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">مرحباً بك في ندرة! يسعدنا انضمامك إلى منصة التعلم الذكية.</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">ابدأ رحلتك التعليمية الآن واستكشف المقررات والمساعد الذكي.</p>` +
      button(`${FRONTEND_URL}${dashboard}`, 'ابدأ التعلم الآن')
  );
  await sendEmail({ to: user.email, subject: 'مرحباً بك في ندرة 🎓', html });
}

export async function sendEnrollmentEmail(
  user: { name: string; email: string },
  course: { title: string }
): Promise<void> {
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">تم تسجيلك بنجاح</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">مرحباً ${esc(user.name)}، تم تسجيلك في المقرر التالي:</p>` +
      `<p style="margin:0 0 8px;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(course.title)}</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">يمكنك الآن البدء بمشاهدة الدروس وإكمال المقرر.</p>` +
      button(`${FRONTEND_URL}/my-courses`, 'ابدأ المقرر')
  );
  await sendEmail({ to: user.email, subject: `تم تسجيلك في ${course.title} ✅`, html });
}

export async function sendCertificateEmail(
  user: { name: string; email: string },
  course: { title: string },
  certCode: string
): Promise<void> {
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">تهانينا ${esc(user.name)}!</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">لقد أتممت بنجاح مقرر:</p>` +
      `<p style="margin:0 0 8px;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(course.title)}</p>` +
      `<p style="margin:0;color:#4B5563;font-size:14px;line-height:1.8;">رقم الشهادة: <span style="font-weight:700;color:#1B1B1B;">${certCode}</span></p>` +
      button(`${FRONTEND_URL}/progress`, 'تحميل الشهادة')
  );
  await sendEmail({ to: user.email, subject: 'تهانينا! حصلت على شهادتك 🏆', html });
}

export async function sendCommunityReplyEmail(
  user: { name: string; email: string },
  post: { title: string; courseId: string | null }
): Promise<void> {
  const link = post.courseId ? `${FRONTEND_URL}/course/${post.courseId}/community` : `${FRONTEND_URL}/community`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">رد جديد على سؤالك</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">مرحباً ${esc(user.name)}، قام شخص ما بالرد على منشورك:</p>` +
      `<p style="margin:0;color:#2D6A4F;font-size:16px;font-weight:700;">${esc(post.title)}</p>` +
      button(link, 'عرض الرد')
  );
  await sendEmail({ to: user.email, subject: 'رد جديد على سؤالك في ندرة 💬', html });
}

export async function sendPasswordResetEmail(user: { name: string; email: string }, token: string): Promise<void> {
  const link = `${FRONTEND_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = wrapper(
    `<h2 style="margin:0 0 12px;color:#1B1B1B;font-size:20px;">إعادة تعيين كلمة المرور</h2>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;">مرحباً ${esc(user.name)}، طلبت إعادة تعيين كلمة المرور لحسابك في ندرة.</p>` +
      `<p style="margin:0 0 8px;color:#4B5563;font-size:14px;line-height:1.8;" dir="ltr">Hi ${esc(user.name)}, use the button below to choose a new Nudra password.</p>` +
      button(link, 'تعيين كلمة مرور جديدة / Reset password') +
      `<p style="margin:16px 0 0;color:#9CA3AF;font-size:12px;line-height:1.8;">الرابط صالح لمدة 30 دقيقة ويُستخدم مرة واحدة. إذا لم تطلب ذلك، تجاهل هذه الرسالة. / This link expires in 30 minutes and works once. If you didn't request it, ignore this email.</p>`
  );
  await sendEmail({ to: user.email, subject: 'Reset your Nudra password / إعادة تعيين كلمة المرور', html });
}
