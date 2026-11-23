"use client";

import { GoogleCalendarControl } from "@/components/schedule/google-calendar-control";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CalendarDays } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { getScheduleData } from "./actions";
import { scopeStudentSchedule } from "@/lib/schedule/student-schedule-scope";
import { ViewportSwitch } from "@/components/navigation";
import { StudentScheduleDesktop } from "@/features/student-schedule/ui/desktop/student-schedule-desktop";
import { StudentScheduleMobile } from "@/features/student-schedule/ui/mobile/student-schedule-mobile";
import { CollaborativeBookingModal } from "@/components/schedule/collaborative-booking-modal";
import {
  AcademicScheduleDetailDialog,
  type AcademicScheduleDetail,
} from "@/components/schedule/academic-schedule-detail-dialog";
import {
  SessionDetailDrawer,
  type PendingSessionResource,
} from "@/components/schedule/session-detail-drawer";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

import { useDemoCommunity } from "@/components/demo/use-demo-community";
import { demoCommunitySchedule } from "@/lib/demo/community-schedule";
import { useStudentExperience } from "@/components/student-experience-provider";
import { daysFrom, getJakartaNow, getWeekScheduleDays } from "@/lib/date-utils";

export function ScheduleCalendarSkeleton() {
  return (
    <div data-testid="schedule-calendar-skeleton" className="space-y-(--related-gap)">
      {/* Calendar toolbar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-(--compact-gap) rounded-xl border border-border/70 bg-card p-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-28 rounded-lg" />
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </div>

      {/* Weekly calendar grid skeleton */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="grid grid-cols-7 divide-x divide-border/60 border-b border-border/60 bg-muted/20">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => (
            <div key={day} className="p-2.5 text-center space-y-1">
              <Skeleton className="mx-auto h-3 w-8" />
              <Skeleton className="mx-auto h-5 w-6 rounded-md" />
            </div>
          ))}
        </div>
        <div className="divide-y divide-border/40">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="grid grid-cols-7 divide-x divide-border/40 h-20">
              {[1, 2, 3, 4, 5, 6, 7].map((col) => (
                <div key={col} className="p-1.5">
                  {(row + col) % 5 === 0 && (
                    <Skeleton className="h-full w-full rounded-md" />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getCourseFilterOptions(data: any, fallbackTitle: string) {
  const byId = new Map<string, { id: string; title: string }>();
  for (const enrollment of data.enrollments || []) {
    const course = enrollment?.course;
    if (course?.id) byId.set(course.id, { id: course.id, title: course.title || course.name || fallbackTitle });
  }
  for (const group of data.groups || []) {
    for (const entry of group?.courses || []) {
      const course = entry?.course || entry;
      if (course?.id) byId.set(course.id, { id: course.id, title: course.title || course.name || fallbackTitle });
    }
  }
  return Array.from(byId.values()).sort((left, right) => left.title.localeCompare(right.title, "id"));
}

function getTutorFilterOptions(data: any, fallbackName: string) {
  const byId = new Map<string, { id: string; name: string }>();
  for (const slot of data.availableSlots || []) {
    const tutor = slot?.tutor;
    const id = tutor?.id || slot?.tutorId;
    if (id) byId.set(id, { id, name: tutor?.name || fallbackName });
  }
  return Array.from(byId.values()).sort((left, right) => left.name.localeCompare(right.name, "id"));
}

type ScheduleProps = {
  initialData?: Awaited<ReturnType<typeof getScheduleData>> | null;
  fetchedAt?: number;
  selectedCourse?: { id: string; title: string; compatibleCourseIds?: string[] };
};

export function StudentScheduleClient({ selectedCourse, initialData = null, fetchedAt = 0 }: ScheduleProps = {}) {
  const experience = useStudentExperience();
  const community = useDemoCommunity();
  const loadSchedule = useCallback(async (offset: number) => {
    if (experience.mode !== "demo") return getScheduleData(offset, selectedCourse?.id);
    const weekInfo = getWeekScheduleDays(daysFrom(offset * 7, getJakartaNow()));
    const calendar = demoCommunitySchedule(experience.baseline, experience.courses ?? [], weekInfo.startOfWeekIso, key => localStorage.getItem(key));
    return {
      role: "student", user: { id: "fictional-demo-student", ...experience.account },
      weekInfo, isWeekLocked: false, ...calendar,
      enrollments: (experience.courses ?? []).map((course) => ({ course })),
      academicSchedules: [],
    };
  }, [experience, selectedCourse?.id]);
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [data, setData] = useState<any>(initialData);
  const [dataWeekOffset, setDataWeekOffset] = useState<number | null>(initialData ? 0 : null);
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookingSlotData, setBookingSlotData] = useState<{ slot: any; dateIso: string } | null>(null);
  const [activeSessionBookingId, setActiveSessionBookingId] = useState<string | null>(null);
  const [selectedAcademicSchedule, setSelectedAcademicSchedule] = useState<AcademicScheduleDetail | null>(null);
  const [pendingSessionResources, setPendingSessionResources] = useState<PendingSessionResource[]>([]);
  const [reminderSyncVersion, setReminderSyncVersion] = useState(0);
  const searchParams = useSearchParams();
  const [weekCache] = useState(() => new Map<number, { data: Awaited<ReturnType<typeof loadSchedule>>; fetchedAt: number }>(
    initialData ? [[0, { data: initialData, fetchedAt }]] : [],
  ));
  const activeRequest = useRef(0);
  const cacheVersion = useRef(0);
  const snapshotTime = useRef(fetchedAt);
  const lastMutation = useRef(0);
  const invalidateScheduleCache = () => {
    lastMutation.current = Date.now();
    cacheVersion.current++;
    weekCache.clear();
    setReminderSyncVersion((version) => version + 1);
  };

  const fetchData = useCallback(async (offset: number, force = false) => {
    const requestId = ++activeRequest.current;
    const version = cacheVersion.current;
    const cached = !force && experience.mode !== "demo" ? weekCache.get(offset) : null;
    if (cached) {
      setData(cached.data);
      setDataWeekOffset(offset);
      setLoadError(false);
      setLoading(false);
      if (Date.now() - cached.fetchedAt < 60_000) return cached.data;
    }

    try {
      setLoading(!cached);
      setLoadError(false);
      const nextData = await loadSchedule(offset);
      if (version === cacheVersion.current && requestId === activeRequest.current) {
        weekCache.delete(offset);
        weekCache.set(offset, { data: nextData, fetchedAt: Date.now() });
        if (weekCache.size > 5) weekCache.delete(weekCache.keys().next().value!);
      }
      if (requestId === activeRequest.current) {
        setData(nextData);
        setDataWeekOffset(offset);
        setLoadError(false);
      }
      return nextData;
    } catch (error) {
      console.error("Gagal mengambil data jadwal:", error);
      if (requestId === activeRequest.current) {
        setLoadError(true);
        toast.error(tRef.current("schedule.loadFailedToast"));
      }
      return null;
    } finally {
      if (requestId === activeRequest.current) {
        setLoading(false);
      }
    }
  }, [loadSchedule, experience.mode, weekCache]);

  useEffect(() => {
    if (snapshotTime.current !== fetchedAt) {
      snapshotTime.current = fetchedAt;
      if (fetchedAt >= lastMutation.current) {
        const currentWeek = weekCache.get(0);
        weekCache.clear();
        if (currentWeek && currentWeek.fetchedAt > fetchedAt) weekCache.set(0, currentWeek);
        else if (initialData) weekCache.set(0, { data: initialData, fetchedAt });
      }
    }
    void fetchData(weekOffset);
  }, [fetchData, weekOffset, community.state, initialData, fetchedAt, weekCache]);

  const courseParam = searchParams.get("course");
  const courseIds = useMemo(() => selectedCourse?.compatibleCourseIds ?? (courseParam ? [courseParam] : []), [selectedCourse, courseParam]);
  const activeData = useMemo(() => dataWeekOffset === weekOffset && data ? scopeStudentSchedule(data, courseIds) : null, [data, dataWeekOffset, weekOffset, courseIds]);

  // Keep local tutor session reminders in sync with the complete unscoped upcoming sessions list
  // on initial load and after booking/reschedule/cancellation mutations (not on weekOffset browsing).
  const studentUserId = experience.mode !== "demo" && data?.user?.id ? String(data.user.id) : null;
  useEffect(() => {
    if (!studentUserId) return;
    let cancelled = false;
    void import("@/lib/native/local-reminders")
      .then(({ refreshUpcomingTutorSessionReminders }) => {
        if (cancelled) return;
        return refreshUpcomingTutorSessionReminders(studentUserId, { locale });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [studentUserId, locale, reminderSyncVersion]);
  if (!activeData) {
    if (loadError) {
      return (
        <ApplicationPage spacing="space-y-(--related-gap)">
          <PageHeader icon={CalendarDays} title={t("schedule.title")} />
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-(--compact-gap)">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-(--compact-gap)">
                <div>
                  <h2 className="font-heading text-body-base font-semibold text-foreground">{t("schedule.loadFailedTitle")}</h2>
                  <p className="mt-1 text-body-sm text-muted-foreground">{t("schedule.loadFailedDescription")}</p>
                </div>
                <Button type="button" size="sm" onClick={() => void fetchData(weekOffset, true)} disabled={loading}>
                  {loading ? t("schedule.loading") : t("schedule.retry")}
                </Button>
              </div>
            </div>
          </div>
        </ApplicationPage>
      );
    }
    return (
      <ApplicationPage spacing="space-y-(--related-gap)">
        <PageHeader icon={CalendarDays} title={t("schedule.title")} />
        <ScheduleCalendarSkeleton />
      </ApplicationPage>
    );
  }

  const userObj = activeData.user || {};
  const coursesList = selectedCourse ? [{ id: selectedCourse.id, title: selectedCourse.title }] : getCourseFilterOptions(activeData, t("schedule.courseFallback"));
  const tutorsList = getTutorFilterOptions(activeData, t("schedule.tutorFallback"));
  const initialCourseFilter = "all";
  const activeSessionBooking = activeSessionBookingId
    ? (activeData.groupBookings || []).find((booking: any) => booking.id === activeSessionBookingId) || null
    : null;

  const scheduleViewProps = {
    loading,
    allowPastBooking: experience.mode === "demo",
    currentUserId: userObj.id,
    weekInfo: activeData.weekInfo,
    isWeekLocked: activeData.isWeekLocked,
    weekOffset,
    onWeekChange: setWeekOffset,
    coursesList,
    tutorsList,
    groupsList: activeData.groups || [],
    initialCourseFilter,
    compatibleCourseIds: courseIds,
    slots: activeData.availableSlots || [],
    bookings: activeData.groupBookings || [],
    academicSchedules: activeData.academicSchedules || [],
    toolbarControls:
      experience.mode !== "demo" && ["student", "teacher"].includes(userObj.role) ? (
        <GoogleCalendarControl />
      ) : undefined,
    onSelectSlotToBook: (slot: any, dateIso: string) => setBookingSlotData({ slot, dateIso }),
    onOpenSessionDetail: (booking: any) => setActiveSessionBookingId(booking.id),
    onEditSchedule: (schedule: any) => setSelectedAcademicSchedule(schedule),
  };

  return (
    <ApplicationPage spacing="space-y-(--related-gap)">
      <PageHeader icon={CalendarDays} title={t("schedule.title")} />

      <ViewportSwitch
        desktop={() => (
          <StudentScheduleDesktop
            {...scheduleViewProps}
            weekInfo={activeData.weekInfo}
            isWeekLocked={activeData.isWeekLocked}
          />
        )}
        mobile={() => <StudentScheduleMobile {...scheduleViewProps} />}
        fallback={<StudentScheduleDesktop {...scheduleViewProps} />}
      />

      {experience.mode === "demo" && community.error ? <p role="alert" className="text-body-xs text-destructive">{community.error}</p> : null}
      <CollaborativeBookingModal
        localOperations={experience.mode === "demo" ? community.operations : undefined}
        open={Boolean(bookingSlotData)}
        onOpenChange={(open) => {
          if (!open) setBookingSlotData(null);
        }}
        slot={bookingSlotData?.slot || null}
        dateIso={bookingSlotData?.dateIso || ""}
        courses={coursesList}
        groups={experience.mode === "demo" && bookingSlotData ? (activeData.groups || []).filter((group: any) => group.courses.some((entry: any) => entry.course?.id === bookingSlotData.slot.courseId)) : activeData.groups || []}
        onSuccess={async ({ bookingId, pendingResources }) => {
          setPendingSessionResources(pendingResources);
          invalidateScheduleCache();
          await fetchData(weekOffset, true);
          setActiveSessionBookingId(bookingId);
        }}
        onSlotTaken={async () => {
          invalidateScheduleCache();
          await fetchData(weekOffset, true);
        }}
      />
      <SessionDetailDrawer
        localOperations={experience.mode === "demo" ? community.operations : undefined}
        open={Boolean(activeSessionBooking)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveSessionBookingId(null);
            setPendingSessionResources([]);
          }
        }}
        booking={activeSessionBooking}
        role="student"
        currentUserId={userObj.id}
        availableSlots={activeData.availableSlots || []}
        pendingResources={pendingSessionResources}
        onPendingResourcesChange={setPendingSessionResources}
        onSuccess={async () => {
          invalidateScheduleCache();
          await fetchData(weekOffset, true);
        }}
      />
      <AcademicScheduleDetailDialog
        schedule={selectedAcademicSchedule}
        open={Boolean(selectedAcademicSchedule)}
        onOpenChange={(open) => {
          if (!open) setSelectedAcademicSchedule(null);
        }}
      />
    </ApplicationPage>
  );
}
