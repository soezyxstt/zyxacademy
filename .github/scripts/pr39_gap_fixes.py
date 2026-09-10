from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


# 1. Keep Ops AI inside the admin scheduling domain for rollback cleanup.
admin_actions = "app/(admin)/admin/(academic)/schedules/actions.ts"
admin_text = read(admin_actions)
if "export async function executeAdminDeleteTutorAvailability" not in admin_text:
    marker = "export type AdminAssignTutorialSessionInput = {"
    primitive = '''export type AdminDeleteTutorAvailabilityInput = {
  slotId: string;
  reason: string;
};

export async function executeAdminDeleteTutorAvailability(
  input: AdminDeleteTutorAvailabilityInput,
  options?: AdminScheduleMutationOptions,
) {
  const actor = await getAdminActorContext(options);
  const requestId = generateRequestId();
  const slotId = typeof input.slotId === "string" ? input.slotId.trim() : "";
  const reason = requireReason(input.reason);

  if (!reason) {
    return { success: false, error: "Alasan override wajib diisi.", reason: "REASON_REQUIRED" };
  }
  if (!slotId) {
    return { success: false, error: "Slot wajib dipilih.", reason: "SLOT_ID_REQUIRED" };
  }

  try {
    await actor.client.transaction(async (tx) => {
      const slotRows = await tx
        .select()
        .from(tutorSlots)
        .where(eq(tutorSlots.id, slotId))
        .limit(1);
      const slot = slotRows[0];
      if (!slot) throw new Error("SLOT_NOT_FOUND");

      const existingBooking = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.slotId, slotId))
        .limit(1);
      if (existingBooking.length > 0) throw new Error("SLOT_ALREADY_BOOKED");

      const deleted = await tx.delete(tutorSlots).where(eq(tutorSlots.id, slotId));
      if ((deleted.rowsAffected ?? 0) === 0) throw new Error("SLOT_NOT_FOUND");

      await recordMutationAudit({
        actorId: actor.actorId,
        actorRoles: actor.actorRoles,
        courseId: "global",
        entityType: "tutor_slot",
        entityId: slotId,
        entityVersion: 1,
        action: "admin.tutor_slot.delete_override",
        outcome: "success",
        requestId,
        reason,
        before: {
          id: slot.id,
          tutorId: slot.tutorId,
          sessionDate: slot.sessionDate,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          endTime: slot.endTime,
          mode: slot.mode,
          location: slot.location ?? null,
        },
        after: null,
      }, tx);
    });

    revalidateAdminSchedulePaths(["/admin/schedules", "/tutor/schedule", "/dashboard/schedule"]);
    return { success: true as const };
  } catch (error) {
    const code = error instanceof Error ? error.message : "DATABASE_ERROR";
    if (code === "SLOT_NOT_FOUND") {
      return { success: false as const, error: "Slot tidak ditemukan.", reason: code };
    }
    if (code === "SLOT_ALREADY_BOOKED") {
      return { success: false as const, error: "Slot sudah terisi dan tidak dapat dihapus.", reason: code };
    }
    console.error("Admin tutor availability delete override error:", error);
    return { success: false as const, error: "Gagal menghapus availability tutor.", reason: "DATABASE_ERROR" };
  }
}

'''
    if admin_text.count(marker) != 1:
        raise SystemExit("Admin assignment marker not found exactly once")
    write(admin_actions, admin_text.replace(marker, primitive + marker, 1))

ops_path = "lib/admin-ops-ai/domain-schedules.ts"
ops = read(ops_path)
if "executeAdminDeleteTutorAvailability" not in ops:
    ops = ops.replace(
        "  executeAdminCreateTutorAvailability,\n  executeAdminMoveTutorialSession,",
        "  executeAdminCreateTutorAvailability,\n  executeAdminDeleteTutorAvailability,\n  executeAdminMoveTutorialSession,",
        1,
    )

ops, removed = re.subn(
    r'\nasync function rollbackCreatedAvailability\(slotId: string\) \{[\s\S]*?\n\}\n\nexport async function executeListSchedules',
    '\nexport async function executeListSchedules',
    ops,
    count=1,
)
if removed != 1:
    raise SystemExit(f"Expected one raw rollback helper, removed {removed}")

old_assignment = '''  if (!booking.success || !createdBookingId) {
    const rolledBack = await rollbackCreatedAvailability(availability.slotId).catch(() => false);
    throw new Error(
      `${booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling."}${rolledBack ? "" : " Slot yang baru dibuat tidak dibersihkan karena sudah terisi atau rollback gagal."}`,
    );
  }'''
new_assignment = '''  if (!booking.success || !createdBookingId) {
    const rollback = await executeAdminDeleteTutorAvailability(
      {
        slotId: availability.slotId,
        reason: `${reason}; rollback setelah assignment gagal`,
      },
      options,
    );
    const safeConcurrentOutcome = !rollback.success &&
      (rollback.reason === "SLOT_ALREADY_BOOKED" || rollback.reason === "SLOT_NOT_FOUND");
    if (!rollback.success && !safeConcurrentOutcome) {
      throw new Error(
        `${booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling."} Rollback slot juga gagal: ${rollback.error || "unknown error"}`,
      );
    }
    throw new Error(booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling.");
  }'''
if ops.count(old_assignment) != 1:
    raise SystemExit("Ops AI assignment rollback block not found exactly once")
ops = ops.replace(old_assignment, new_assignment, 1)

old_move = '''  const moved = await executeAdminMoveTutorialSession({ bookingId, targetSlotId, reason }, options);
  if (!moved.success) {
    const rolledBack = createdTargetSlotId
      ? await rollbackCreatedAvailability(createdTargetSlotId).catch(() => false)
      : true;
    throw new Error(`${moved.error || "Gagal memindahkan sesi."}${rolledBack ? "" : " Slot tujuan tidak dibersihkan karena sudah terisi atau rollback gagal."}`);
  }'''
new_move = '''  const moved = await executeAdminMoveTutorialSession({ bookingId, targetSlotId, reason }, options);
  if (!moved.success) {
    if (createdTargetSlotId) {
      const rollback = await executeAdminDeleteTutorAvailability(
        {
          slotId: createdTargetSlotId,
          reason: `${reason}; rollback setelah reschedule gagal`,
        },
        options,
      );
      const safeConcurrentOutcome = !rollback.success &&
        (rollback.reason === "SLOT_ALREADY_BOOKED" || rollback.reason === "SLOT_NOT_FOUND");
      if (!rollback.success && !safeConcurrentOutcome) {
        throw new Error(
          `${moved.error || "Gagal memindahkan sesi."} Rollback slot juga gagal: ${rollback.error || "unknown error"}`,
        );
      }
    }
    throw new Error(moved.error || "Gagal memindahkan sesi.");
  }'''
if ops.count(old_move) != 1:
    raise SystemExit("Ops AI move rollback block not found exactly once")
ops = ops.replace(old_move, new_move, 1)
write(ops_path, ops)


# 2. Preserve date-only academic schedules as all-day events outside 07:00-24:00.
calendar_path = "components/schedule/schedule-calendar-view.tsx"
replace_once(
    calendar_path,
    '  locked?: boolean;\n  source: any;',
    '  locked?: boolean;\n  allDay?: boolean;\n  source: any;',
)
replace_once(
    calendar_path,
    '''        <p className={cn("break-words leading-tight text-current/80", compact ? "text-[9px]" : "text-[10px]")}>{minutesToTime(event.startMinutes)}–{minutesToTime(event.endMinutes)}</p>''',
    '''        {event.allDay ? (
          <p className={cn("break-words leading-tight text-current/80", compact ? "text-[9px]" : "text-[10px]")}>Sepanjang hari</p>
        ) : (
          <p className={cn("break-words leading-tight text-current/80", compact ? "text-[9px]" : "text-[10px]")}>{minutesToTime(event.startMinutes)} - {minutesToTime(event.endMinutes)}</p>
        )}''',
)
replace_once(
    calendar_path,
    '''      const end = parseAcademicInstant(schedule.endDate);
      const sameDayEnd = end && end.dateIso === start.dateIso ? end.minutes : null;
      const endMinutes = sameDayEnd && sameDayEnd > start.minutes ? sameDayEnd : start.minutes + 90;
      result.push({''',
    '''      const end = parseAcademicInstant(schedule.endDate);
      const allDay = start.minutes === 0 && !schedule.endDate;
      const sameDayEnd = end && end.dateIso === start.dateIso ? end.minutes : null;
      const endMinutes = allDay
        ? END_MINUTES
        : sameDayEnd && sameDayEnd > start.minutes
          ? sameDayEnd
          : start.minutes + 90;
      result.push({''',
)
replace_once(
    calendar_path,
    '''        courseId: schedule.courseId || schedule.course?.id || null,
        source: schedule,''',
    '''        courseId: schedule.courseId || schedule.course?.id || null,
        allDay,
        source: schedule,''',
)
replace_once(
    calendar_path,
    '''            <div className="max-h-[72vh] overflow-y-auto">''',
    '''            {filteredEvents.some((event) => event.allDay && visibleDays.some((day) => day.dateIso === event.dateIso)) ? (
              <div
                className="grid border-b border-border/70 bg-card"
                style={{ gridTemplateColumns: viewMode === "day" ? "56px minmax(0,1fr)" : "56px repeat(7,minmax(108px,1fr))" }}
              >
                <div className="flex items-center justify-end border-r border-border/70 px-1 py-1.5 text-[9px] font-medium text-muted-foreground">
                  Sepanjang hari
                </div>
                {visibleDays.map((day) => {
                  const allDayEvents = filteredEvents.filter((event) => event.allDay && event.dateIso === day.dateIso);
                  return (
                    <div key={`all-day-${day.dateIso}`} className={cn("min-h-10 space-y-1 border-r border-border/60 p-1", day.isToday && "bg-brand-primary/[0.02]")}>
                      {allDayEvents.map((event) => (
                        <div key={event.id} className="min-h-10">
                          <EventCard event={event} compact onOpen={() => openEvent(event)} />
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : null}

            <div className="max-h-[72vh] overflow-y-auto">''',
)
replace_once(
    calendar_path,
    '''                  const dayEvents = layoutEvents(filteredEvents.filter((event) => event.dateIso === dayIso && event.endMinutes > START_MINUTES && event.startMinutes < END_MINUTES));''',
    '''                  const dayEvents = layoutEvents(filteredEvents.filter((event) => !event.allDay && event.dateIso === dayIso && event.endMinutes > START_MINUTES && event.startMinutes < END_MINUTES));''',
)


# 3. Make lib/date-utils.ts the sole implementation owner for calendar primitives.
date_utils = Path("lib/date-utils.ts")
calendar_module = Path("lib/schedule/calendar-date.ts")
date_text = date_utils.read_text()
calendar_impl = calendar_module.read_text().strip()
import_block = '''import {
  addCalendarDays,
  assertCalendarDate,
  calendarDateToJakartaInstant,
  getCalendarDayIndex,
  getCalendarMonthLabel,
  getCalendarWeekRange,
  getJakartaCalendarDate,
  parseCalendarDate,
} from "@/lib/schedule/calendar-date";
'''
if date_text.count(import_block) != 1:
    raise SystemExit("calendar-date import block not found exactly once in lib/date-utils.ts")
date_text = date_text.replace(import_block, "", 1)
date_fns_import = 'import { addDays, format, subDays, subWeeks, startOfDay as fnsStartOfDay, startOfWeek as fnsStartOfWeek } from "date-fns";\n'
if date_text.count(date_fns_import) != 1:
    raise SystemExit("date-fns import marker not found")
date_text = date_text.replace(date_fns_import, date_fns_import + "\n" + calendar_impl + "\n", 1)
duplicate_tz = '\nconst JAKARTA_TIME_ZONE = "Asia/Jakarta";\n\nfunction jakartaDateParts'
if date_text.count(duplicate_tz) != 1:
    raise SystemExit("duplicate Jakarta time-zone marker not found")
date_text = date_text.replace(duplicate_tz, '\nfunction jakartaDateParts', 1)
date_utils.write_text(date_text)
calendar_module.write_text('''export {
  addCalendarDays,
  addCalendarMonths,
  assertCalendarDate,
  calendarDateFromInput,
  calendarDateToJakartaInstant,
  compareCalendarDates,
  diffCalendarDays,
  formatCalendarDate,
  getCalendarDayIndex,
  getCalendarMonthLabel,
  getCalendarMonthRange,
  getCalendarWeekRange,
  getJakartaCalendarDate,
  isCalendarDate,
  parseCalendarDate,
  type CalendarDate,
  type CalendarDateParts,
} from "@/lib/date-utils";
''')


# 4. Update regression contracts to match the final guarded rollback and debt fixes.
regression_path = "tests/contracts/schedule-calendar-regressions.test.ts"
regression = read(regression_path)
regression = regression.replace(
    '    expect(ops).toContain("rollbackCreatedAvailability");',
    '    expect(ops).toContain("executeAdminDeleteTutorAvailability");\n    expect(ops).not.toContain("rollbackCreatedAvailability");\n    expect(ops).not.toMatch(/\\.delete\\(tutorSlots\\)/);',
)
write(regression_path, regression)

Path("tests/contracts/schedule-review-fixes.test.ts").write_text('''import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("schedule PR review fixes", () => {
  test("tutor dashboard loads complete owned work and uses structured empty states", () => {
    const source = read("app/(tutor)/tutor/page.tsx");
    expect(source).not.toContain("fromDate: week.startIso");
    expect(source).not.toContain("toDate: week.endIso");
    expect(source).toContain("AdminEmptyState");
    expect(source).toContain('title="Belum ada sesi mendatang"');
    expect(source).toContain('title="Tidak ada tiket pending"');
  });

  test("academic date-only events remain visible outside the timed grid", () => {
    const source = read("components/schedule/schedule-calendar-view.tsx");
    expect(source).toContain("allDay?: boolean");
    expect(source).toContain("const allDay = start.minutes === 0 && !schedule.endDate");
    expect(source).toContain("Sepanjang hari");
    expect(source).toContain("!event.allDay && event.dateIso === dayIso");
  });

  test("Ops AI filters before limit and rolls back only through guarded admin scheduling", () => {
    const source = read("lib/admin-ops-ai/domain-schedules.ts");
    expect(source).toContain("conditions.push(inArray(bookings.slotId");
    expect(source).not.toContain("rows.filter((booking) => booking.slot?.tutorId");
    expect(source).toContain("executeAdminDeleteTutorAvailability");
    expect(source).not.toContain("rollbackCreatedAvailability");
    expect(source).not.toMatch(/\\.delete\\(tutorSlots\\)/);

    const actions = read("app/(admin)/admin/(academic)/schedules/actions.ts");
    expect(actions).toContain("export async function executeAdminDeleteTutorAvailability");
    expect(actions).toContain("SLOT_ALREADY_BOOKED");
    expect(actions).toContain("admin.tutor_slot.delete_override");
  });

  test("date-only primitives are implemented only in lib/date-utils.ts", () => {
    const dateUtils = read("lib/date-utils.ts");
    const shim = read("lib/schedule/calendar-date.ts");
    expect(dateUtils).toContain("export function getCalendarWeekRange");
    expect(dateUtils).toContain("export function calendarDateToJakartaInstant");
    expect(shim).toContain('from "@/lib/date-utils"');
    expect(shim).not.toContain("CALENDAR_DATE_PATTERN");
  });

  test("student week failure is recoverable and current server week owns lock state", () => {
    const source = read("app/(student)/dashboard/schedule/schedule-client.tsx");
    expect(source).toContain("setLoadError");
    expect(source).toContain("Coba Lagi");
    expect(source).toContain("weekInfo={activeData.weekInfo}");
    expect(source).toContain("isWeekLocked={activeData.isWeekLocked}");
  });

  test("reviewed schedule files contain no prohibited en or em dash", () => {
    const files = [
      "app/(tutor)/tutor/page.tsx",
      "components/schedule/schedule-calendar-view.tsx",
      "lib/admin-ops-ai/domain-schedules.ts",
      "lib/date-utils.ts",
      "lib/schedule/calendar-date.ts",
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(/[–—]/);
    }
  });
});
''')


# 5. Make schedule validation a persistent staging PR gate.
Path(".github/workflows/schedule-domain-validation.yml").write_text('''name: Schedule Domain Validation

on:
  pull_request:
    branches:
      - staging
    paths:
      - "app/(admin)/admin/(academic)/schedules/**"
      - "app/(student)/dashboard/schedule/**"
      - "app/(tutor)/tutor/**"
      - "components/schedule/**"
      - "components/tutor/**"
      - "lib/admin-ops-ai/domain-schedules.ts"
      - "lib/date-utils.ts"
      - "lib/schedule/**"
      - "tests/contracts/schedule-*.test.ts"
      - ".github/workflows/schedule-domain-validation.yml"
  workflow_dispatch:

concurrency:
  group: schedule-domain-validation-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  validate:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      BETTER_AUTH_SECRET: schedule-domain-validation-secret-1234567890
      SKIP_ENV_VALIDATION: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - name: Schedule contracts
        run: >-
          bun test
          tests/contracts/schedule-calendar-date.test.ts
          tests/contracts/tutorial-week-policy.test.ts
          tests/contracts/schedule-dates.test.ts
          tests/contracts/schedule-calendar-regressions.test.ts
          tests/contracts/schedule-review-fixes.test.ts
          tests/contracts/tutor-schedule-actions.test.ts
      - name: Typecheck
        run: bun run typecheck
''')


# 6. Enforce repository punctuation rule in files touched by this schedule repair.
changed_files = [
    "app/(admin)/admin/(academic)/schedules/actions.ts",
    "app/(student)/dashboard/schedule/booking-actions.ts",
    "app/(student)/dashboard/schedule/schedule-client.tsx",
    "app/(tutor)/tutor/page.tsx",
    "app/(tutor)/tutor/schedule/slot-note-actions.ts",
    "components/schedule/collaborative-booking-modal.tsx",
    "components/schedule/schedule-calendar-view.tsx",
    "lib/admin-ops-ai/domain-schedules.ts",
    "lib/date-utils.ts",
    "lib/schedule/calendar-date.ts",
    "lib/schedule/week-policy.ts",
    "tests/contracts/schedule-calendar-regressions.test.ts",
    "tests/contracts/schedule-review-fixes.test.ts",
    "tests/contracts/tutorial-week-policy.test.ts",
]
for file_name in changed_files:
    path = Path(file_name)
    if path.exists():
        path.write_text(path.read_text().replace("–", "-").replace("—", "-"))


# Temporary patch machinery must not survive in the final PR.
for transient in [
    ".github/workflows/pr39-gap-fixes.yml",
    ".github/scripts/pr39_gap_fixes.py",
]:
    path = Path(transient)
    if path.exists():
        path.unlink()
