import { randomBytes } from "node:crypto";
import { inArray } from "drizzle-orm";
import { assertFixtureRunner } from "./scope";

export const notificationId = "dd2869b7-7655-4b62-92f5-575412fc76f2";
const otherNotificationId = "99cafebd-1909-4406-9bbe-3c9b1fe9ecb6";

export async function seedStudentInbox(accountId: string) {
  assertFixtureRunner();
  const [{ auth }, { db }, { notifications }] = await Promise.all([
    import("@/lib/auth"), import("@/db"), import("@/db/schema"),
  ]);
  const context = await auth.$context;
  const other = await context.internalAdapter.createUser({
    name: "Other Preview Student",
    email: `other-preview-${randomBytes(8).toString("hex")}@example.test`,
    emailVerified: true,
  });
  await db.insert(notifications).values([
    { id: notificationId, userId: accountId, title: "Preview course update", body: "A new course announcement is available.",
      type: "announcement", metadata: { url: "/dashboard" } },
    { id: otherNotificationId, userId: other.id, title: "Private preview update", body: "Another learner received this update.",
      type: "announcement", metadata: { url: "/dashboard" } },
  ]);
}

export async function verifiedInboxAcknowledgement(accountId: string) {
  assertFixtureRunner();
  const [{ db }, { notifications }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  const rows = await db.select({ id: notifications.id, userId: notifications.userId, read: notifications.read }).from(notifications)
    .where(inArray(notifications.id, [notificationId, otherNotificationId]));
  const own = rows.find(row => row.id === notificationId);
  const other = rows.find(row => row.id === otherNotificationId);
  return own?.userId === accountId && own.read === true && !!other && other.userId !== accountId && other.read === false;
}
