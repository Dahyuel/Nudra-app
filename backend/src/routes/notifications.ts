import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(20);

    return res.json({ notifications: rows });
  } catch (err) {
    console.error('get notifications error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));

    return res.json({ success: true });
  } catch (err) {
    console.error('read all notifications error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const updated = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();

    return res.json({ notification: updated[0] });
  } catch (err) {
    console.error('read notification error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;