import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { pkaAnnouncements, pkaSchedules } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { PkaAnnouncementState } from "@/packages/academic/pka-lifecycle";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduleWriter = Pick<Transaction, "insert" | "delete">;
type AnnouncementWriter = Pick<Transaction, "insert" | "update">;
type Announcement = Pick<typeof pkaAnnouncements.$inferSelect, "id" | "title" | "body" | "isArchived" | "isPinned">;

export function pkaAnnouncementState(row: Announcement): PkaAnnouncementState {
  const archived = row.isArchived;
  const pinned = row.isPinned;
  return { archived, pinned, revision: revisionOf({ id: row.id, title: row.title, body: row.body, archived, pinned }) };
}

export async function createPkaScheduleRecord(writer: ScheduleWriter, record: typeof pkaSchedules.$inferInsert) {
  await writer.insert(pkaSchedules).values(record);
}

export async function deletePkaScheduleRecord(writer: ScheduleWriter, scheduleId: string) {
  await writer.delete(pkaSchedules).where(eq(pkaSchedules.id, scheduleId));
}

export async function updatePkaAnnouncementState(writer: AnnouncementWriter, id: string, field: "archived" | "pinned", value: boolean) {
  await writer.update(pkaAnnouncements).set(field === "archived" ? { isArchived: value } : { isPinned: value })
    .where(eq(pkaAnnouncements.id, id));
}

export async function createPkaAnnouncementRecord(writer: AnnouncementWriter, record: typeof pkaAnnouncements.$inferInsert) {
  await writer.insert(pkaAnnouncements).values(record);
}
