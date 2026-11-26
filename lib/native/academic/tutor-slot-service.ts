import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { executeAddTutorSlot, executeUpdateTutorSlot } from "@/app/(tutor)/tutor/schedule/actions";
import { db } from "@/db";
import { tutorSlotNotes } from "@/db/schedule-extras";
import { auditMutasi, bookings, session, tutorSlots } from "@/db/schema";
import { buildTutorMutationAuditRow, recordTutorMutationAudit } from "@/lib/audit/mutasi";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { isCalendarDate } from "@/lib/date-utils";
import { getIndonesianDayFromDate } from "@/lib/schedule/tutor-policy";
import { lockScheduleEntity } from "@/lib/schedule/transaction-lock";
import { timeToMinutes } from "@/lib/schedule-lock";
import { stableStringify } from "@/lib/staging/migration-ledger";
import type { TutorSlotFields, TutorSlotTarget } from "@/packages/academic/tutor-slot";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const slotColumns = {
  id: tutorSlots.id,
  tutorId: tutorSlots.tutorId,
  date: tutorSlots.sessionDate,
  start: tutorSlots.startTime,
  end: tutorSlots.endTime,
  mode: tutorSlots.mode,
  location: tutorSlots.location,
  notes: tutorSlotNotes.notes,
  booked: sql<boolean>`exists (select 1 from ${bookings} where ${bookings.slotId} = ${tutorSlots.id})`,
  successfulChanges: sql<number>`(
    select count(*) from ${auditMutasi}
    where ${auditMutasi.entityId} = ${tutorSlots.id} and ${auditMutasi.entityType} = 'tutor_slot'
      and ${auditMutasi.outcome} = 'success'
  )`.mapWith(Number),
};

function digest(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export async function tutorSlotDetails(userId: string, slotIds: readonly string[], client: Pick<Transaction, "select"> = db) {
  if (!slotIds.length) return [];
  const rows = await client.select(slotColumns).from(tutorSlots)
    .leftJoin(tutorSlotNotes, eq(tutorSlotNotes.slotId, tutorSlots.id))
    .where(and(eq(tutorSlots.tutorId, userId), inArray(tutorSlots.id, [...slotIds])));
  return rows.map(({ successfulChanges, tutorId, ...slot }) => ({
    ...slot,
    revision: digest([tutorId, successfulChanges, slot]),
  }));
}

type FailureStatus = 400 | 401 | 403 | 404 | 409 | 500;

export class TutorSlotWriteError extends Error {
  constructor(public readonly status: FailureStatus, public readonly code: string) {
    super(code);
  }
}

type Failure = { status: FailureStatus; code: string };
export type TutorSlotWriteService = (
  actor: { id: string; sessionId: string; requestId: string },
  fields: TutorSlotFields,
  target?: TutorSlotTarget,
) => Promise<{ slotId: string; date: string }>;

export const saveTutorSlot: TutorSlotWriteService = async (actor, fields, target) => {
  const start = timeToMinutes(fields.start);
  if (!isCalendarDate(fields.date) || start === null || start + 90 >= 24 * 60) {
    throw new TutorSlotWriteError(400, "INVALID_SLOT");
  }
  const end = start + 90;
  const command = {
    dayOfWeek: getIndonesianDayFromDate(fields.date),
    sessionDate: fields.date,
    startTime: fields.start.padStart(5, "0"),
    endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    mode: fields.mode,
    location: fields.mode === "offline" ? fields.location.trim() : undefined,
  };
  const normalizedNotes = fields.notes.trim();
  const fingerprint = digest([command, normalizedNotes, target?.expectedRevision ?? null]);
  const receipt = {
    actorId: actor.id, actorRoles: ["tutor"], courseId: "global", entityType: "native_command",
    entityId: target?.slotId ?? "tutor-slot-create", entityVersion: 1, action: "native.tutor.slot.command",
    outcome: "success", reason: "Tutor availability receipt",
    requestId: `req-native-slot-${digest([actor.id, actor.sessionId, target?.slotId ?? null, actor.requestId])}`,
  } as const;
  const receiptId = buildTutorMutationAuditRow(receipt).id;

  const result = await db.transaction(async (tx): Promise<{ slotId: string; date: string } | Failure> => {
    await lockScheduleEntity(tx, "tutor", actor.id);
    try {
      await assertAuthoringActor(tx, actor.id, { roles: ["tutor"], error: "TUTOR_FORBIDDEN", lock: true });
    } catch (error) {
      if (error instanceof Error && error.message === "TUTOR_FORBIDDEN") throw new TutorSlotWriteError(403, error.message);
      throw error;
    }
    const [active] = await tx.select({ expiresAt: session.expiresAt }).from(session)
      .where(and(eq(session.id, actor.sessionId), eq(session.userId, actor.id))).limit(1).for("share");
    if (!active || active.expiresAt.getTime() <= Date.now()) throw new TutorSlotWriteError(401, "UNAUTHENTICATED");

    const [saved] = await tx.select({ owner: auditMutasi.actorId, after: auditMutasi.afterSnapshot })
      .from(auditMutasi).where(eq(auditMutasi.id, receiptId)).limit(1);
    if (saved) {
      const value = saved.after?.snapshot as { slotId?: unknown; date?: unknown; fingerprint?: unknown } | undefined;
      if (saved.owner !== actor.id || value?.fingerprint !== fingerprint || typeof value.slotId !== "string" || typeof value.date !== "string") {
        throw new TutorSlotWriteError(409, "REQUEST_CONFLICT");
      }
      return { slotId: value.slotId, date: value.date };
    }

    if (target) {
      const [owned] = await tx.select({ id: tutorSlots.id }).from(tutorSlots)
        .where(and(eq(tutorSlots.id, target.slotId), eq(tutorSlots.tutorId, actor.id))).for("update");
      if (!owned) throw new TutorSlotWriteError(404, "SLOT_NOT_FOUND");
      const [current] = await tutorSlotDetails(actor.id, [target.slotId], tx);
      if (current?.booked) return { status: 409, code: "CANNOT_EDIT_BOOKED_SLOT" };
      if (!current || current.revision !== target.expectedRevision) throw new TutorSlotWriteError(409, "SLOT_CHANGED");
    }

    // The server actions take the same transaction-level schedule lock. Their
    // nested transactions are savepoints so the write and receipt commit together.
    const options = { actorId: actor.id, executor: tx };
    const mutation = target
      ? await executeUpdateTutorSlot({ ...command, slotId: target.slotId }, options, normalizedNotes)
      : await executeAddTutorSlot(command, options);
    if (!mutation.success || !mutation.slotId) {
      const code = mutation.reason ?? "SLOT_WRITE_FAILED";
      if (["DUPLICATE_TUTOR_SLOT", "TUTOR_SLOT_OVERLAP", "CANNOT_EDIT_BOOKED_SLOT"].includes(code)) return { status: 409, code };
      if (code === "SLOT_NOT_FOUND") return { status: 404, code };
      if (code === "AUTH_FAILED" || code === "SLOT_NOT_OWNED_BY_TUTOR") return { status: 403, code };
      return { status: code === "DATABASE_ERROR" || code === "SLOT_WRITE_FAILED" ? 500 : 400, code };
    }
    if (!target && normalizedNotes) {
      await tx.insert(tutorSlotNotes).values({ slotId: mutation.slotId, notes: normalizedNotes });
    }
    const outcome = { slotId: mutation.slotId, date: fields.date };
    await recordTutorMutationAudit({ ...receipt, after: { ...outcome, fingerprint } }, tx);
    return outcome;
  });
  if ("status" in result) throw new TutorSlotWriteError(result.status, result.code);
  return result;
};
