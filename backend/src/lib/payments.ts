// Payment flow, independent of the payment provider.
//
//   1. createOrder(): server-side price, status 'pending'.
//   2. provider.startCheckout(): where to send the student to pay.
//   3. The provider confirms the result (webhook / callback) -> finalizeOrder().
//   4. finalizeOrder('paid') enrols the student. Nothing else creates paid enrollments.
//
// PAYMENT_PROVIDER selects the provider. Only 'test' exists today: a local
// simulator page with "pay" / "fail" buttons, refused when NODE_ENV=production.
// A real provider (e.g. Paymob, Fawry) is added by implementing PaymentProvider
// and confirming payments from its verified webhook via finalizeOrder().
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { orders, courses } from '../db/schema';
import { enrollStudent } from './enrollment';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'cancelled';
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

const providers: Record<string, PaymentProvider> = { test: testProvider };

export function isTestPaymentsEnabled() {
  return (process.env.PAYMENT_PROVIDER || 'test') === 'test' && process.env.NODE_ENV !== 'production';
}

export function getPaymentProvider(): PaymentProvider | null {
  const name = process.env.PAYMENT_PROVIDER || 'test';
  if (name === 'test' && !isTestPaymentsEnabled()) return null;
  return providers[name] ?? null;
}

export async function createOrder(studentId: string, course: { id: string; price: string }, provider: string) {
  const [order] = await db
    .insert(orders)
    .values({ studentId, courseId: course.id, amount: course.price, provider })
    .returning();
  return order;
}

/**
 * Apply a provider's verdict to a pending order. Idempotent: an order that is
 * already paid/failed/cancelled is returned unchanged.
 */
export async function finalizeOrder(orderId: string, outcome: Exclude<OrderStatus, 'pending'>, providerRef?: string) {
  // Only a pending order may change, and only once (guards against duplicate webhooks).
  const [updated] = await db
    .update(orders)
    .set({
      status: outcome,
      paidAt: outcome === 'paid' ? new Date() : null,
      updatedAt: new Date(),
      ...(providerRef ? { providerRef } : {}),
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, 'pending')))
    .returning();

  const order = updated ?? (await db.select().from(orders).where(eq(orders.id, orderId)).limit(1))[0];
  if (!order) return null;

  if (updated && outcome === 'paid') {
    const [course] = await db
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(eq(courses.id, order.courseId))
      .limit(1);
    if (course) await enrollStudent(order.studentId, course);
  }
  return order;
}
