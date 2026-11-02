import { afterEach, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createPostgresTestDb } from "../helpers/postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { executeAdminCreateTutorAvailability } from "@/app/(admin)/admin/(academic)/schedules/actions";
import { buildAdminCoverage, deriveAdminCoverageStatus } from "@/lib/schedule/admin-coverage";
import {
  isConcreteDateInRange,
  normalizeAdminOverrideReason,
  normalizeAdminWeekOffset,
} from "@/lib/schedule/admin-operations";

const repoRoot = process.cwd();

const clients: Array<Awaited<ReturnType<typeof createPostgresTestDb>>["client"]> = [];
beforeAll(async () => {
  const { client } = await createPostgresTestDb();
  await client.close();
}, 60_000);
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function createAdminAvailabilityDb() {
  const { client, testDb } = await createPostgresTestDb();
  clients.push(client);

  const now = new Date("2026-09-09T08:00:00.000+07:00");
  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin", createdAt: now },
    { id: "peran-tutor", code: "tutor", createdAt: now },
  ]);
  await testDb.insert(schema.user).values([
    {
      id: "admin-1",
      name: "Admin Satu",
      email: "admin1@zyx.test",
      createdAt: now,
      updatedAt: now,
      role: "admin",
    },
    {
      id: "tutor-1",
      name: "Tutor Satu",
      email: "tutor1@zyx.test",
      createdAt: now,
      updatedAt: now,
      role: "teacher",
    },
  ]);
  await testDb.insert(schema.pengguna).values([
    { id: "admin-1", status: "active", createdAt: now, updatedAt: now },
    { id: "tutor-1", status: "active", createdAt: now, updatedAt: now },
  ]);
  await testDb.insert(schema.penggunaPeran).values([
    {
      id: "pp-admin",
      penggunaId: "admin-1",
      peranId: "peran-admin",
      source: "seed",
      createdAt: now,
    },
    {
      id: "pp-tutor",
      penggunaId: "tutor-1",
      peranId: "peran-tutor",
      source: "seed",
      createdAt: now,
    },
  ]);

  return { client, testDb };
}

describe("admin scheduling operations", () => {
  it("normalizes the admin week offset to the supported navigation window", () => {
    expect(normalizeAdminWeekOffset("3.8")).toBe(3);
    expect(normalizeAdminWeekOffset(9999)).toBe(520);
    expect(normalizeAdminWeekOffset(-9999)).toBe(-520);
    expect(normalizeAdminWeekOffset("not-a-week")).toBe(0);
  });

  it("rejects empty and whitespace-only override reasons", () => {
    expect(normalizeAdminOverrideReason("   ")).toBeNull();
    expect(normalizeAdminOverrideReason(null)).toBeNull();
    expect(normalizeAdminOverrideReason("  Tutor berhalangan  ")).toBe("Tutor berhalangan");
  });

  it("derives the four compact coverage statuses", () => {
    expect(deriveAdminCoverageStatus(0, 0)).toBe("Belum submit");
    expect(deriveAdminCoverageStatus(6, 5)).toBe("Low availability");
    expect(deriveAdminCoverageStatus(2, 0)).toBe("Ada availability");
    expect(deriveAdminCoverageStatus(2, 2)).toBe("Fully booked");
  });

  it("counts only concrete target-week slots in coverage", () => {
    const rows = buildAdminCoverage(
      [{ id: "tutor-a", name: "Alya" }],
      [
        { tutorId: "tutor-a", sessionDate: "2026-09-15", booking: null },
        { tutorId: "tutor-a", sessionDate: "2026-09-16", booking: { status: "scheduled" } },
        { tutorId: "tutor-a", sessionDate: null, booking: null },
      ],
    );
    expect(rows[0]).toMatchObject({ slotsOpened: 2, booked: 1, available: 1 });
  });

  it("does not count cancelled sessions as filled capacity", () => {
    const rows = buildAdminCoverage(
      [{ id: "tutor-a", name: "Alya" }],
      [
        { tutorId: "tutor-a", sessionDate: "2026-09-15", booking: { status: "cancelled" } },
        { tutorId: "tutor-a", sessionDate: "2026-09-16", booking: { status: "scheduled" } },
      ],
    );
    expect(rows[0]).toMatchObject({ slotsOpened: 2, booked: 1, available: 1 });
  });

  it("recognizes concrete dates only inside the visible admin range", () => {
    expect(isConcreteDateInRange("2026-09-16", "2026-09-14", "2026-09-20")).toBe(true);
    expect(isConcreteDateInRange("2026-09-21", "2026-09-14", "2026-09-20")).toBe(false);
    expect(isConcreteDateInRange(null, "2026-09-14", "2026-09-20")).toBe(false);
  });

  it("keeps tutorial mode from wiring the academic drag creator", () => {
    const dashboard = readFileSync(
      `${repoRoot}/components/admin/academic-schedules-dashboard.tsx`,
      "utf8",
    );
    expect(dashboard).toContain('onCreateScheduleDirect={calendarMode === "academic" || calendarMode === "all" ? handleCreateDirect : undefined}');
    expect(dashboard).toContain('adminMode={calendarMode as "all" | "tutorial" | "academic"}');
  });

  it("routes tutor visits to the canonical tutor schedule page", () => {
    const page = readFileSync(
      `${repoRoot}/app/(student)/dashboard/schedule/page.tsx`,
      "utf8",
    );
    expect(page).toContain('redirect("/tutor/schedule")');
  });

  it("requires structural validation and a reason for admin availability overrides", () => {
    const actions = readFileSync(
      `${repoRoot}/app/(admin)/admin/(academic)/schedules/actions.ts`,
      "utf8",
    );
    expect(actions).toContain("validateSlotDuration(startTime, endTime)");
    expect(actions).toContain("doTutorSlotsOverlap");
    expect(actions).toContain("requireReason(input.reason)");
  });

  it("keeps admin availability overrides independent from the tutor deadline", () => {
    const actions = readFileSync(
      `${repoRoot}/app/(admin)/admin/(academic)/schedules/actions.ts`,
      "utf8",
    );
    const start = actions.indexOf("export async function executeAdminCreateTutorAvailability");
    const end = actions.indexOf("export type AdminAssignTutorialSessionInput");
    const availabilityAction = actions.slice(start, end);
    expect(availabilityAction).not.toContain("isTutorialWeekLocked");
    expect(availabilityAction).not.toContain("canTutorCreateAvailability");
  });

  it("creates a dated availability after the tutor deadline and records the override audit", async () => {
    const { testDb } = await createAdminAvailabilityDb();

    const result = await executeAdminCreateTutorAvailability(
      {
        tutorId: "tutor-1",
        sessionDate: "2026-09-14",
        startTime: "09:00",
        endTime: "10:30",
        mode: "online",
        reason: "Pengganti tutor berhalangan",
      },
      { actorId: "admin-1", executor: testDb, now: new Date("2026-09-12T08:00:00.000+07:00") },
    );

    expect(result.success).toBe(true);
    const slots = await testDb.select().from(schema.tutorSlots);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      tutorId: "tutor-1",
      sessionDate: "2026-09-14",
      startTime: "09:00",
      endTime: "10:30",
    });

    const audits = await testDb
      .select()
      .from(schema.auditMutasi)
      .where(eq(schema.auditMutasi.action, "admin.tutor_slot.create_override"));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: "admin-1",
      reason: "Pengganti tutor berhalangan",
      outcome: "success",
    });
    expect(audits[0].beforeSnapshot).toBeNull();
    expect(audits[0].afterSnapshot).toBeTruthy();
  });

  it("rejects non-90-minute and overlapping admin availability overrides", async () => {
    const { testDb } = await createAdminAvailabilityDb();
    const options = {
      actorId: "admin-1",
      executor: testDb,
      now: new Date("2026-09-12T08:00:00.000+07:00"),
    };

    const invalidDuration = await executeAdminCreateTutorAvailability(
      {
        tutorId: "tutor-1",
        sessionDate: "2026-09-14",
        startTime: "09:00",
        endTime: "10:00",
        mode: "online",
        reason: "Koreksi jadwal",
      },
      options,
    );
    expect(invalidDuration).toMatchObject({ success: false, reason: "INVALID_DURATION_NOT_90_MINUTES" });

    const first = await executeAdminCreateTutorAvailability(
      {
        tutorId: "tutor-1",
        sessionDate: "2026-09-14",
        startTime: "09:00",
        endTime: "10:30",
        mode: "online",
        reason: "Membuka slot pengganti",
      },
      options,
    );
    expect(first.success).toBe(true);

    const overlap = await executeAdminCreateTutorAvailability(
      {
        tutorId: "tutor-1",
        sessionDate: "2026-09-14",
        startTime: "10:00",
        endTime: "11:30",
        mode: "online",
        reason: "Membuka slot pengganti kedua",
      },
      options,
    );
    expect(overlap).toMatchObject({ success: false, reason: "TUTOR_SLOT_OVERLAP" });

    const slots = await testDb.select().from(schema.tutorSlots);
    expect(slots).toHaveLength(1);
  });

  it("keeps legacy null-date rows as a warning source rather than bookable data", () => {
    const actions = readFileSync(
      `${repoRoot}/app/(admin)/admin/(academic)/schedules/actions.ts`,
      "utf8",
    );
    const calendar = readFileSync(
      `${repoRoot}/components/schedule/schedule-calendar-view.tsx`,
      "utf8",
    );
    expect(actions).toContain("legacyNullDateSlotCount");
    expect(calendar).toContain("const dateIso = slot.sessionDate as CalendarDate | null | undefined;");
    expect(calendar).toContain("if (!dateIso || bookingSlotIds.has(slot.id) || slot.booking) continue;");
  });
});
