import "server-only";
import { count, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { notifications, user } from "@/db/schema";

export interface NotificationHistoryRow {
  id: string;
  userId: string;
  userName: string | null;
  title: string;
  body: string;
  type: string;
  read: boolean;
  attempted: number;
  succeeded: number;
  failedCount: number;
  createdAt: Date;
}

/** Call only after the current surface verifies its Admin authority. */
export async function listAdminNotificationHistory(page: number, limit: number): Promise<{ rows: NotificationHistoryRow[]; total: number }> {
  const offset = (page - 1) * limit;

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        userName: user.name,
        title: notifications.title,
        body: notifications.body,
        type: notifications.type,
        read: notifications.read,
        attempted: notifications.attempted,
        succeeded: notifications.succeeded,
        failedCount: notifications.failedCount,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .leftJoin(user, eq(notifications.userId, user.id))
      .where(ne(notifications.type, "discussion"))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: count() }).from(notifications).where(ne(notifications.type, "discussion")),
  ]);

  return { rows, total: Number(totalRows[0]?.count ?? 0) };
}
