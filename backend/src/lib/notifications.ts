import { eq } from 'drizzle-orm';
import { db } from '../db';
import { notifications } from '../db/schema';
import { getIO } from './socket';

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  link?: string
): Promise<void> {
  try {
    const inserted = await db
      .insert(notifications)
      .values({ userId, type, title, body, link: link ?? null })
      .returning();

    const notification = inserted[0];

    try {
      const io = getIO();
      io.to(`user:${userId}`).emit(`notification:${userId}`, notification);
    } catch (emitErr) {
      console.warn('notification emit failed', emitErr);
    }
  } catch (err) {
    console.warn('create notification failed', err);
  }
}