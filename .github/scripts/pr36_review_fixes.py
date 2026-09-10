from pathlib import Path


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


# 1. Tutor dashboard: query all owned work, not only the current week, and use
# the repository's structured empty-state primitive.
tutor_page = "app/(tutor)/tutor/page.tsx"
replace_once(
    tutor_page,
    'import { Button } from "@/components/ui/button";\n',
    'import { Button } from "@/components/ui/button";\nimport { AdminEmptyState } from "@/components/admin/state-panels";\n',
)
replace_once(
    tutor_page,
    '''  const schedule = await getTutorScheduleReadModel({
    tutorId: session.user.id,
    allowAdmin: false,
    fromDate: week.startIso,
    toDate: week.endIso,
  });''',
    '''  const schedule = await getTutorScheduleReadModel({
    tutorId: session.user.id,
    allowAdmin: false,
  });''',
)
replace_once(
    tutor_page,
    '''          {upcomingSessions.length === 0 ? (
            <div className="px-4 py-8 text-center text-body-sm text-muted-foreground">
              Belum ada sesi mendatang pada rentang yang dimuat.
            </div>
          ) : (''',
    '''          {upcomingSessions.length === 0 ? (
            <AdminEmptyState
              icon={Clock3}
              title="Belum ada sesi mendatang"
              description="Tambahkan slot agar kelompok dapat memilih waktu tutorial berikutnya."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/tutor/schedule">Tambah slot</Link>
                </Button>
              }
              className="px-4 py-8"
            />
          ) : (''',
)
replace_once(
    tutor_page,
    '''          {pendingTickets.length === 0 ? (
            <div className="px-4 py-7 text-body-sm text-muted-foreground">Tidak ada tiket pending.</div>
          ) : (''',
    '''          {pendingTickets.length === 0 ? (
            <AdminEmptyState
              icon={MessageSquareWarning}
              title="Tidak ada tiket pending"
              description="Permintaan reschedule dan pembatalan yang perlu ditinjau akan muncul di sini."
              className="px-4 py-7"
            />
          ) : (''',
)
replace_once(
    tutor_page,
    '''        {schedule.assignedActiveCourses.length === 0 ? (
          <div className="px-4 py-8 text-center text-body-sm text-muted-foreground">Belum ada mata kuliah yang ditugaskan.</div>
        ) : (''',
    '''        {schedule.assignedActiveCourses.length === 0 ? (
          <AdminEmptyState
            icon={BookOpen}
            title="Belum ada mata kuliah"
            description="Penugasan mata kuliah tutor dikelola oleh admin."
            className="px-4 py-8"
          />
        ) : (''',
)

# 2. Ops AI: constrain tutor rows before LIMIT and roll back only the
# availability created by the current compound operation on downstream failure.
ops_path = "lib/admin-ops-ai/domain-schedules.ts"
replace_once(
    ops_path,
    'import { and, desc, eq, gte, lte } from "drizzle-orm";',
    'import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";',
)
replace_once(
    ops_path,
    '''  executeAdminAssignTutorialSession,
  executeAdminCancelTutorialSession,
  executeAdminCreateTutorAvailability,
  executeAdminMoveTutorialSession,''',
    '''  executeAdminAssignTutorialSession,
  executeAdminCancelTutorialSession,
  executeAdminCreateTutorAvailability,
  executeAdminDeleteTutorAvailability,
  executeAdminMoveTutorialSession,''',
)
replace_once(
    ops_path,
    '''  if (input.tutorId) {
    const slotRows = await db
      .select({ id: tutorSlots.id })
      .from(tutorSlots)
      .where(eq(tutorSlots.tutorId, input.tutorId.trim()));
    if (slotRows.length === 0) {
      return { summary: "Tidak ada jadwal untuk tutor tersebut.", data: [] };
    }
  }''',
    '''  if (input.tutorId) {
    const slotRows = await db
      .select({ id: tutorSlots.id })
      .from(tutorSlots)
      .where(eq(tutorSlots.tutorId, input.tutorId.trim()));
    if (slotRows.length === 0) {
      return { summary: "Tidak ada jadwal untuk tutor tersebut.", data: [] };
    }
    conditions.push(inArray(bookings.slotId, slotRows.map((row) => row.id)));
  }''',
)
replace_once(
    ops_path,
    '''  const filteredRows = input.tutorId
    ? rows.filter((booking) => booking.slot?.tutorId === input.tutorId?.trim())
    : rows;

  return {
    summary: `Ditemukan ${filteredRows.length} jadwal sesi meet/tutorial.`,
    data: filteredRows.map((booking) => ({''',
    '''  return {
    summary: `Ditemukan ${rows.length} jadwal sesi meet/tutorial.`,
    data: rows.map((booking) => ({''',
)
replace_once(
    ops_path,
    '''  if (!booking.success || !createdBookingId) {
    throw new Error(booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling.");
  }''',
    '''  if (!booking.success || !createdBookingId) {
    const rollback = await executeAdminDeleteTutorAvailability(
      {
        slotId: availability.slotId,
        reason: `${reason}; rollback setelah assignment gagal`,
      },
      options,
    );
    if (!rollback.success) {
      throw new Error(
        `${booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling."} Rollback slot juga gagal: ${rollback.error || "unknown error"}`,
      );
    }
    throw new Error(booking.error || "Gagal menetapkan sesi tutorial melalui domain scheduling.");
  }''',
)
replace_once(
    ops_path,
    '  let targetSlotId = exactSlots.find((slot) => !slot.booking)?.id || null;\n',
    '  let targetSlotId = exactSlots.find((slot) => !slot.booking)?.id || null;\n  let createdTargetSlotId: string | null = null;\n',
)
replace_once(
    ops_path,
    '''    targetSlotId = availability.slotId;
  }

  const moved = await executeAdminMoveTutorialSession({ bookingId, targetSlotId, reason }, options);
  if (!moved.success) throw new Error(moved.error || "Gagal memindahkan sesi.");''',
    '''    targetSlotId = availability.slotId;
    createdTargetSlotId = availability.slotId;
  }

  const moved = await executeAdminMoveTutorialSession({ bookingId, targetSlotId, reason }, options);
  if (!moved.success) {
    if (createdTargetSlotId) {
      const rollback = await executeAdminDeleteTutorAvailability(
        {
          slotId: createdTargetSlotId,
          reason: `${reason}; rollback setelah reschedule gagal`,
        },
        options,
      );
      if (!rollback.success) {
        throw new Error(
          `${moved.error || "Gagal memindahkan sesi."} Rollback slot juga gagal: ${rollback.error || "unknown error"}`,
        );
      }
    }
    throw new Error(moved.error || "Gagal memindahkan sesi.");
  }''',
)

# 3. Add a guarded admin availability delete primitive for compound-operation
# rollback, keeping raw tutor_slots mutation inside the admin scheduling boundary.
admin_actions = "app/(admin)/admin/(academic)/schedules/actions.ts"
marker = "export type AdminAssignTutorialSessionInput = {"
delete_primitive = '''export type AdminDeleteTutorAvailabilityInput = {
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

      await tx.delete(tutorSlots).where(eq(tutorSlots.id, slotId));
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
    return { success: true };
  } catch (error) {
    const code = error instanceof Error ? error.message : "DATABASE_ERROR";
    if (code === "SLOT_NOT_FOUND") {
      return { success: false, error: "Slot tidak ditemukan.", reason: code };
    }
    if (code === "SLOT_ALREADY_BOOKED") {
      return { success: false, error: "Slot sudah terisi dan tidak dapat dihapus.", reason: code };
    }
    console.error("Admin tutor availability delete override error:", error);
    return { success: false, error: "Gagal menghapus availability tutor.", reason: "DATABASE_ERROR" };
  }
}

'''
replace_once(admin_actions, marker, delete_primitive + marker)

# 4. Preserve date-only academic schedules as all-day events and render them in
# a dedicated row outside the 07:00-24:00 timed grid.
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

# 5. Move date-only implementation into lib/date-utils.ts. Keep a compatibility
# re-export so current callers do not churn, but the implementation has one owner.
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

# 6. Clean prohibited en/em dashes from files in this PR.
changed_files = [
    ".github/workflows/schedule-domain-validation.yml",
    "app/(student)/dashboard/schedule/booking-actions.ts",
    "app/(tutor)/tutor/page.tsx",
    "app/(tutor)/tutor/schedule/slot-note-actions.ts",
    "components/application-shell.tsx",
    "components/dashboard/plan-preview.tsx",
    "components/landing/landing-pricing-preview.tsx",
    "components/mobile-sidebar-controller.tsx",
    "components/pricing/plan-preview-grid.tsx",
    "components/schedule/collaborative-booking-modal.tsx",
    "components/schedule/schedule-calendar-view.tsx",
    "components/tutor/tutor-schedule-view.tsx",
    "components/tutor/tutor-sidebar.tsx",
    "lib/admin-ops-ai/domain-schedules.ts",
    "lib/date-utils.ts",
    "lib/plan-tiers.ts",
    "lib/schedule/calendar-date.ts",
    "lib/schedule/week-policy.ts",
    "scripts/staging/check-schedule-schema.ts",
    "tests/contracts/mobile-sidebar-controller.test.ts",
    "tests/contracts/pricing-preview-parity.test.ts",
    "tests/contracts/schedule-calendar-date.test.ts",
    "tests/contracts/schedule-calendar-regressions.test.ts",
    "tests/contracts/schedule-dates.test.ts",
    "app/(admin)/admin/(academic)/schedules/actions.ts",
]
for file_name in changed_files:
    path = Path(file_name)
    if path.exists():
        text = path.read_text()
        path.write_text(text.replace("–", "-").replace("—", "-"))

# 7. Add focused regression contracts for the bot findings.
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

  test("Ops AI filters tutor rows before limit and cleans up compound-operation slots", () => {
    const source = read("lib/admin-ops-ai/domain-schedules.ts");
    expect(source).toContain("conditions.push(inArray(bookings.slotId");
    expect(source).not.toContain("rows.filter((booking) => booking.slot?.tutorId");
    expect(source).toContain("executeAdminDeleteTutorAvailability");
    const actions = read("app/(admin)/admin/(academic)/schedules/actions.ts");
    expect(actions).toContain("export async function executeAdminDeleteTutorAvailability");
    expect(actions).toContain("SLOT_ALREADY_BOOKED");
  });

  test("date-only primitives are implemented only in lib/date-utils.ts", () => {
    const dateUtils = read("lib/date-utils.ts");
    const shim = read("lib/schedule/calendar-date.ts");
    expect(dateUtils).toContain("export function getCalendarWeekRange");
    expect(dateUtils).toContain("export function calendarDateToJakartaInstant");
    expect(shim).toContain('from "@/lib/date-utils"');
    expect(shim).not.toContain("CALENDAR_DATE_PATTERN");
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

# 8. Make schedule-domain validation a persistent PR gate.
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

# Temporary trigger/workflow/script must not remain in the final PR.
for transient in [
    ".github/workflows/pr36-review-fixes.yml",
    ".github/scripts/pr36_review_fixes.py",
    ".github/pr36-review-trigger.txt",
]:
    path = Path(transient)
    if path.exists():
        path.unlink()
