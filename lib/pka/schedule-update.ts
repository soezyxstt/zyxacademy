import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { pkaSchedules } from "@/db/schema";
import { revisionOf } from "@/lib/admin-mcp/revision";
import type { PkaScheduleRevision } from "@/packages/academic/pka-schedule-edit";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ScheduleFields = Pick<typeof pkaSchedules.$inferSelect, "title" | "sessionAt" | "meetLink">;

export function pkaScheduleRevision(id: string, row: ScheduleFields): PkaScheduleRevision {
  const fields = { title: row.title, sessionAt: row.sessionAt.toISOString(), meetLink: row.meetLink };
  return { ...fields, revision: revisionOf({ id, ...fields }) };
}

export async function lockPkaSchedule(tx: Transaction, id: string) {
  const [row] = await tx.select().from(pkaSchedules).where(eq(pkaSchedules.id, id)).limit(1).for("update");
  return row;
}

export function pkaScheduleDeliveryRequired(before: ScheduleFields, fields: ScheduleFields) {
  return !!fields.meetLink && fields.meetLink !== before.meetLink && fields.sessionAt.getTime() > Date.now();
}

/** Update a row previously selected with lockPkaSchedule in this transaction. */
export async function updatePkaSchedule(tx: Transaction, before: typeof pkaSchedules.$inferSelect, fields: ScheduleFields) {
  await tx.update(pkaSchedules).set(fields).where(eq(pkaSchedules.id, before.id));
}
