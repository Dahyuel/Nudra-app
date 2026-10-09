// Payment flow, independent of the payment provider.
//
//   1. createOrder(): server-side price, status 'pending'.
//   2. provider.startCheckout(): where to send the student to pay.
//   3. The provider confirms the result (webhook / callback) -> finalizeOrder().
//   4. finalizeOrder('paid') enrols the student. Nothing else creates paid enrollments.
//
// PAYMENT_PROVIDER selects disabled, legacy test, or paymob_mock. Production
// simulation requires a separate demo database, buckets and test-user allowlist.
// A real provider (e.g. Paymob, Fawry) is added by implementing PaymentProvider
// and confirming payments from its verified webhook via finalizeOrder().
import { and, eq, sql, gt } from 'drizzle-orm';
import { db } from '../db';
import { orders, courses, courseSections, lessons, enrollments, users } from '../db/schema';
import { sendEnrollmentEmail } from './mailer';
import { createNotification } from './notifications';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
type Order = typeof orders.$inferSelect;

export interface PaymentProvider {
  name: string;
  /** Returns the URL (absolute, or a frontend path) where the student pays. */
  startCheckout(order: Order): Promise<{ redirectUrl: string; providerRef?: string }>;
}

const testProvider: PaymentProvider = {
  name: 'test',
  async startCheckout(order) {
    return { redirectUrl: `/checkout/test/${order.id}`, providerRef: `test_${order.id}` };
  },
};

const mockProvider: PaymentProvider = {
  name: 'paymob_mock',
  async startCheckout(order) { return {redirectUrl:`/checkout/test/${order.id}`,providerRef:`mock_${order.id}`}; },
};
const providers: Record<string, PaymentProvider> = { test: testProvider, paymob_mock: mockProvider };

export function isTestPaymentsEnabled() {
  const provider=process.env.PAYMENT_PROVIDER || 'test';
  if (!['test','paymob_mock'].includes(provider)) return false;
  if (process.env.NODE_ENV !== 'production') return true;
  if (process.env.APP_MODE !== 'demo' || process.env.MINIO_BUCKET_PREFIX !== 'nudra-demo') return false;
  try {return new URL(process.env.DATABASE_URL!).pathname.endsWith('_demo');} catch {return false;}
}

export function canSimulatePayment(email:string) {
  if (!isTestPaymentsEnabled()) return false;
  const allowed=(process.env.MOCK_PAYMENT_ALLOWED_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
  return allowed.length ? allowed.includes(email.toLowerCase()) : process.env.NODE_ENV !== 'production';
}

export function getPaymentProvider(): PaymentProvider | null {
  const name = process.env.PAYMENT_PROVIDER || 'test';
  if (['test','paymob_mock'].includes(name) && !isTestPaymentsEnabled()) return null;
  return providers[name] ?? null;
}

export async function createOrder(studentId: string, course: { id: string; price: string }, provider: string) {
  return db.transaction(async tx => {
  await tx.select({id:courses.id}).from(courses).where(eq(courses.id,course.id)).for('update');
  const [pending]=await tx.select().from(orders).where(and(eq(orders.studentId,studentId),eq(orders.courseId,course.id),eq(orders.provider,provider),eq(orders.status,'pending'),gt(orders.createdAt,new Date(Date.now()-30*60*1000)))).limit(1);
  if (pending) return pending;
  const [order] = await tx
    .insert(orders)
    .values({ studentId, courseId: course.id, amount: course.price, provider })
    .returning();
  return order;
  });
}

/**
 * Apply a provider's verdict to a pending order. Idempotent: an order that is
 * already paid/failed/cancelled is returned unchanged.
 */
export async function finalizeOrder(orderId: string, outcome: Exclude<OrderStatus, 'pending'>, providerRef?: string) {
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id,orderId)).for('update');
    if (current?.status==='pending' && ['paymob_mock','test'].includes(current.provider) && Date.now()-current.createdAt.getTime()>30*60*1000) outcome='expired';
    // The order status and enrollment commit together. Concurrent/duplicate
    // provider callbacks can only transition a pending order once.
    const [updated] = await tx
      .update(orders)
      .set({
        status: outcome,
        paidAt: outcome === 'paid' ? new Date() : null,
        updatedAt: new Date(),
        ...(providerRef ? { providerRef } : {}),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
      .returning();

    if (updated && ['paymob_mock','test'].includes(updated.provider)) await tx.execute(sql`INSERT INTO mock_payment_events(order_id,outcome) VALUES(${orderId},${outcome}) ON CONFLICT(order_id) DO NOTHING`);
    const order = updated ?? (await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
    if (!order || !updated || outcome !== 'paid') return { order, enrollmentCreated: false, student: null, course: null };

    const [course] = await tx
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(eq(courses.id, order.courseId))
      .limit(1);
    if (!course) throw new Error(`Order ${order.id} references a missing course`);

    const [firstLesson] = await tx
      .select({ id: lessons.id })
      .from(lessons)
      .innerJoin(courseSections, eq(lessons.sectionId, courseSections.id))
      .where(eq(lessons.courseId, course.id))
      .orderBy(courseSections.position, lessons.position)
      .limit(1);
    const enrolled = await tx
      .insert(enrollments)
      .values({ studentId: order.studentId, courseId: course.id, progress: 0, lastLessonId: firstLesson?.id ?? null })
      .onConflictDoUpdate({ target: [enrollments.studentId, enrollments.courseId], set:{status:'active'},where:eq(enrollments.status,'cancelled') })
      .returning({ id: enrollments.id });
    const [student] = enrolled.length
      ? await tx.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, order.studentId)).limit(1)
      : [];
    if(student)await sendEnrollmentEmail(student,{title:course.title},tx);
    return { order, enrollmentCreated: enrolled.length > 0, student: student ?? null, course };
  });

  if (!result.order) return null;
  if (result.enrollmentCreated && result.student && result.course) {
    createNotification(
      result.order.studentId,
      'enrollment_confirmed',
      'تم التسجيل بنجاح',
      `تم تسجيلك في ${result.course.title}`,
      `/course/${result.course.id}`
    ).catch(console.warn);
  }
  return result.order;
}
