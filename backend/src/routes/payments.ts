import { Router, Request, Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { courses, enrollments, orders } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';
import { createOrder, finalizeOrder, getPaymentProvider, isTestPaymentsEnabled } from '../lib/payments';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();

const publicOrder = (o: typeof orders.$inferSelect, courseTitle?: string) => ({
  id: o.id,
  courseId: o.courseId,
  courseTitle,
  amount: Number(o.amount),
  currency: o.currency,
  status: o.status,
  provider: o.provider,
  createdAt: o.createdAt,
  paidAt: o.paidAt,
});

// Start buying a paid course. The price always comes from the database.
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const courseId = uuid.safeParse(req.body?.courseId);
    if (!courseId.success) return res.status(400).json({ message: 'Invalid course' });

    const provider = getPaymentProvider();
    if (!provider) return res.status(503).json({ message: 'Payments are not available right now.' });

    const [course] = await db.select().from(courses).where(eq(courses.id, courseId.data)).limit(1);
    if (!course || !course.isPublished) return res.status(404).json({ message: 'Course not found' });
    if (Number(course.price) <= 0) {
      return res.status(400).json({ message: 'This course is free. Enroll directly instead.' });
    }

    const studentId = req.user!.id;
    if (course.instructorId === studentId) {
      return res.status(400).json({ message: "You can't buy your own course." });
    }
    const already = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.courseId, course.id)))
      .limit(1);
    if (already.length > 0) return res.status(409).json({ message: 'You are already enrolled in this course.' });

    const order = await createOrder(studentId, course, provider.name);
    const { redirectUrl, providerRef } = await provider.startCheckout(order);
    if (providerRef) await db.update(orders).set({ providerRef }).where(eq(orders.id, order.id));

    return res.status(201).json({ order: publicOrder(order, course.title), redirectUrl });
  } catch (err) {
    console.error('checkout error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Order status for the checkout / result pages (owner only).
router.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const id = uuid.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: 'Invalid order' });
    const [row] = await db
      .select({ order: orders, courseTitle: courses.title })
      .from(orders)
      .innerJoin(courses, eq(orders.courseId, courses.id))
      .where(eq(orders.id, id.data))
      .limit(1);
    if (!row || row.order.studentId !== req.user!.id) return res.status(404).json({ message: 'Order not found' });
    return res.json({ order: publicOrder(row.order, row.courseTitle), testMode: row.order.provider === 'test' });
  } catch (err) {
    console.error('get order error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Test provider only: simulates the gateway confirming or declining a payment.
// Disabled unless PAYMENT_PROVIDER=test and NODE_ENV is not production.
router.post('/test/:id/complete', async (req: Request, res: Response) => {
  try {
    if (!isTestPaymentsEnabled()) return res.status(404).json({ message: 'Not found' });
    const id = uuid.safeParse(req.params.id);
    const outcome = z.enum(['paid', 'failed', 'cancelled']).safeParse(req.body?.outcome);
    if (!id.success || !outcome.success) return res.status(400).json({ message: 'Invalid request' });

    const [order] = await db.select().from(orders).where(eq(orders.id, id.data)).limit(1);
    if (!order || order.studentId !== req.user!.id || order.provider !== 'test') {
      return res.status(404).json({ message: 'Order not found' });
    }
    if (order.status !== 'pending') {
      return res.status(409).json({ message: `This order is already ${order.status}.` });
    }

    const updated = await finalizeOrder(order.id, outcome.data);
    return res.json({ order: publicOrder(updated!) });
  } catch (err) {
    console.error('test payment error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
