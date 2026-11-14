"use client";

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
import { ScheduleCalendarView } from "@/components/schedule/schedule-calendar-view";
import calendarStyles from "@/components/schedule/schedule-calendar-readability.module.css";
import { CollaborativeBookingModal } from "@/components/schedule/collaborative-booking-modal";
import {
  AcademicScheduleDetailDialog,
  type AcademicScheduleDetail,
} from "@/components/schedule/academic-schedule-detail-dialog";
import {
  SessionDetailDrawer,
  type PendingSessionResource,
} from "@/components/schedule/session-detail-drawer";
import { useTranslations } from "@/lib/i18n/client";

import { useDemoCommunity } from "@/components/demo/use-demo-community";
import { communityKey, demoWeek, parseCommunity } from "@/lib/demo/community-state";
import { useStudentExperience } from "@/components/student-experience-provider";
import { daysFrom, getJakartaNow, getWeekScheduleDays } from "@/lib/date-utils";

export function ScheduleCalendarSkeleton() {
  return (
    <div data-testid="schedule-calendar-skeleton" className="space-y-4">
      {/* Calendar toolbar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card p-3">
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

export function StudentScheduleClient({ selectedCourse }: { selectedCourse?: { id: string; title: string; compatibleCourseIds?: string[] } } = {}) {
  const experience = useStudentExperience();
  const community = useDemoCommunity();
  const loadSchedule = useCallback(async (offset: number) => {
    if (experience.mode !== "demo") return getScheduleData(offset, selectedCourse?.id);
    const weekInfo = getWeekScheduleDays(daysFrom(offset * 7, getJakartaNow()));
    const scope = { courseId: community.scope.courseId, revision: community.scope.revision };
    const localState = parseCommunity(localStorage.getItem(communityKey(scope)));
    const week = demoWeek(scope, weekInfo.startOfWeekIso, localState);
    const course = experience.courses?.find(row => row.id === community.scope.courseId);
    const group = { id: "demo-group", ...localState.group, totalQuotaSessions: 9999, usedQuotaSessions: 0, courses: [{ course }] };
    return {
      role: "student", user: { id: "fictional-demo-student", ...experience.account },
      weekInfo, isWeekLocked: false, groups: [group],
      enrollments: (experience.courses ?? []).map((course) => ({ course })),
      availableSlots: week.slots.map(slot => ({ ...slot, tutor: { ...slot.tutor, tutorCourses: [{ courseId: community.scope.courseId }] } })),
      groupBookings: week.bookings.map(row => ({ ...row, course, group, mode: "online", slot: { tutor: { name: "Kak Nara" } } })), academicSchedules: [],
    };
  }, [experience, community.scope.courseId, community.scope.revision, selectedCourse?.id]);
  const t = useTranslations("student");
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [data, setData] = useState<any>(null);
  const [dataWeekOffset, setDataWeekOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [bookingSlotData, setBookingSlotData] = useState<{ slot: any; dateIso: string } | null>(null);
  const [activeSessionBookingId, setActiveSessionBookingId] = useState<string | null>(null);
  const [selectedAcademicSchedule, setSelectedAcademicSchedule] = useState<AcademicScheduleDetail | null>(null);
  const [pendingSessionResources, setPendingSessionResources] = useState<PendingSessionResource[]>([]);
  const searchParams = useSearchParams();
  const weekCache = useRef(new Map<number, any>());
  const activeRequest = useRef(0);
  const cacheVersion = useRef(0);
  const invalidateScheduleCache = () => {
    cacheVersion.current++;
    weekCache.current.clear();
  };

  const fetchData = useCallback(async (offset: number, force = false) => {
    const requestId = ++activeRequest.current;
    const version = cacheVersion.current;
    const cached = !force && experience.mode !== "demo" ? weekCache.current.get(offset) : null;
    if (cached) {
      setData(cached);
      setDataWeekOffset(offset);
      setLoadError(false);
      setLoading(false);
      return cached;
    }

    try {
      setLoading(true);
      setLoadError(false);
      const nextData = await loadSchedule(offset);
      if (version === cacheVersion.current) {
        weekCache.current.delete(offset);
        weekCache.current.set(offset, nextData);
        if (weekCache.current.size > 5) weekCache.current.delete(weekCache.current.keys().next().value!);
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
  }, [loadSchedule, experience.mode]);

  useEffect(() => {
    void fetchData(weekOffset);
  }, [fetchData, weekOffset, community.state]);

  const courseParam = searchParams.get("course");
  const courseIds = useMemo(() => selectedCourse?.compatibleCourseIds ?? (courseParam ? [courseParam] : []), [selectedCourse, courseParam]);
  const activeData = useMemo(() => dataWeekOffset === weekOffset && data ? scopeStudentSchedule(data, courseIds) : null, [data, dataWeekOffset, weekOffset, courseIds]);
  if (!activeData) {
    if (loadError) {
      return (
        <ApplicationPage spacing="space-y-4">
          <PageHeader icon={CalendarDays} title={t("schedule.title")} />
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <div className="min-w-0 space-y-3">
                <div>
                  <h2 className="font-heading text-body-base font-semibold text-foreground">{t("schedule.loadFailedTitle")}</h2>
                  <p className="mt-1 text-body-sm text-muted-foreground">{t("schedule.loadFailedDescription")}</p>
                </div>
                <Button type="button" size="sm" onClick={() => void fetchData(weekOffset, true)} disabled={loading}>
                  {loading ? t("schedule.loading") : t("schedule.retry")}
                </Button>
                <span className="sr-only">Coba Lagi</span>
              </div>
            </div>
          </div>
        </ApplicationPage>
      );
    }
    return (
      <ApplicationPage spacing="space-y-4">
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

  return (
    <ApplicationPage spacing="space-y-4">
      <PageHeader icon={CalendarDays} title={t("schedule.title")} />

      <div className={calendarStyles.root} aria-busy={loading}>
        <ScheduleCalendarView
          role="student"
          allowPastBooking={experience.mode === "demo"}
          currentUserId={userObj.id}
          weekInfo={activeData.weekInfo}
          isWeekLocked={activeData.isWeekLocked}
          weekOffset={weekOffset}
          onWeekChange={setWeekOffset}
          coursesList={coursesList}
          tutorsList={tutorsList}
          groupsList={activeData.groups || []}
          initialCourseFilter={initialCourseFilter}
          compatibleCourseIds={courseIds}
          slots={activeData.availableSlots || []}
          bookings={activeData.groupBookings || []}
          academicSchedules={activeData.academicSchedules || []}
          onSelectSlotToBook={(slot, dateIso) => setBookingSlotData({ slot, dateIso })}
          onOpenSessionDetail={(booking) => setActiveSessionBookingId(booking.id)}
          onEditSchedule={(schedule) => setSelectedAcademicSchedule(schedule)}
        />
      </div>

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
        groups={activeData.groups || []}
        onSuccess={async ({ bookingId, pendingResources }) => {
          setPendingSessionResources(pendingResources);
          invalidateScheduleCache();
          await fetchData(weekOffset, true);
          setActiveSessionBookingId(bookingId);
        }}
        onSlotTaken={() => {
          invalidateScheduleCache();
          return fetchData(weekOffset, true);
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
        onSuccess={() => {
          invalidateScheduleCache();
          return fetchData(weekOffset, true);
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
