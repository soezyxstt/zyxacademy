"use client";

import { useEffect, useRef, useState } from "react";
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { UsersDashboard } from "@/components/admin/users-dashboard";
import TutorQuizPaginationFixture from "@/app/visual-fixtures/tutor-quiz-pagination/page";
import dynamic from "next/dynamic";

const WatchlistTable = dynamic(
  () =>
    import("@/components/tutor/watchlist-table").then(
      (module) => module.WatchlistTable,
    ),
  { ssr: false },
);
import { StudentScheduleMobile } from "@/features/student-schedule/ui/mobile/student-schedule-mobile";
import {
  dataCalendarPeriods,
  dataCases,
} from "@/packages/native-parity/shared-ui/data-cases";

// The grid and pagination use their real callers. The calendar selected-detail
// case retains the real day view but the parent-owned detail is represented
// by a local status element.
export const dataReferenceCases = dataCases;
export const dataReferenceActions: Record<string, string[]> = {
  "shared-ui-grid-narrow": [
    "Tampilan grid is clicked on mount; capture the documents grid",
  ],
  "shared-ui-grid-wide": [
    "Tampilan grid is clicked on mount; capture the documents grid",
  ],
  "shared-ui-grid-long": [
    "Tampilan grid is clicked on mount; capture the documents grid",
  ],
  "shared-ui-pagination-first": [
    "Click Soal tab, then capture nav[aria-label='Halaman bank soal']",
  ],
  "shared-ui-pagination-middle": [
    "Click Soal tab, then Berikutnya, then capture nav[aria-label='Halaman bank soal']",
  ],
  "shared-ui-pagination-pending": [
    "Hold the dashboard request with preparePendingPagination, then click Berikutnya",
  ],
  "shared-ui-calendar-available": ["March 4 tab is clicked on mount"],
  "shared-ui-calendar-selected": [
    "March 4 tab is clicked on mount; detail is locally represented",
  ],
};

function CalendarReference({
  hasEvent,
  selected,
}: {
  hasEvent: boolean;
  selected: boolean;
}) {
  const [detail, setDetail] = useState(selected);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasEvent) return;
    const timer = window.setTimeout(
      () =>
        container.current
          ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2]
          ?.click(),
      100,
    );
    return () => window.clearTimeout(timer);
  }, [hasEvent]);
  const [offset, setOffset] = useState(0);
  const days = dataCalendarPeriods[Math.max(0, Math.min(offset, 1))].days;
  const weekInfo = {
    startOfWeekIso: days[0].id,
    endOfWeekIso: days[6].id,
    mondayDate: new Date(`${days[0].id}T00:00:00Z`),
    days: days.map((day, index) => ({
      dateIso: day.id,
      dayName: day.weekday,
      dayOfMonth: Number(day.day),
      monthName: "Mar",
      isToday: offset === 0 && index === 0,
      isPast: false,
    })),
  };
  const academicSchedules = hasEvent
    ? [
        {
          id: "momentum",
          title: "Tutorial momentum",
          startDate: "2026-03-04T02:00:00Z",
          endDate: "2026-03-04T03:00:00Z",
          description: "Tinjau hukum kekekalan momentum dan contoh tumbukan.",
          type: "general",
          location: "Daring",
        },
      ]
    : [];
  return (
    <div ref={container}>
      <StudentScheduleMobile
        loading={false}
        allowPastBooking
        currentUserId="fixture"
        weekInfo={weekInfo}
        isWeekLocked={false}
        weekOffset={offset}
        onWeekChange={setOffset}
        coursesList={[]}
        tutorsList={[]}
        groupsList={[]}
        initialCourseFilter="all"
        compatibleCourseIds={[]}
        slots={[]}
        bookings={[]}
        academicSchedules={academicSchedules}
        onSelectSlotToBook={() => {}}
        onOpenSessionDetail={() => {}}
        onEditSchedule={() => setDetail(true)}
      />
      {detail && (
        <p role="status">
          Tinjau hukum kekekalan momentum dan contoh tumbukan.
        </p>
      )}
    </div>
  );
}

export function DataReferences({ id }: { id: string }) {
  const fixture = dataCases.find((c) => c.id === id);
  if (!fixture) return <p role="alert">Unknown data reference: {id}</p>;
  if (fixture.component === "calendar")
    return (
      <CalendarReference
        hasEvent={fixture.events.length > 0}
        selected={Boolean(fixture.selectedEventId)}
      />
    );
  if (fixture.component === "grid")
    return <DocumentGridReference cards={fixture.cards} />;
  if (fixture.component === "pagination") {
    if (fixture.pending) return <UsersDashboard currentUserId="fixture" initialTotal={150} initialUsers={[]} initialStats={{ totalUsers: 150, adminCount: 0, tutorCount: 0, muridCount: 150, activeCount: 150, suspendedCount: 0 }} />;
    return <TutorQuizPaginationFixture />;
  }
  if (fixture.component === "table") {
    const students = fixture.rows.map((row) => ({
      studentId: row.id,
      name: row.name,
      decliningConcepts: row.concepts.split(", "),
      activeInterventionCount: 0,
      lastActiveAt: new Date(
        Date.now() - (row.id === "sinta" ? 1.5 : row.id === "maya" ? 7.5 : 0.5) * 86400000,
      ).toISOString(),
    }));
    return <WatchlistTable students={students} />;
  }
  return null;
}

function DocumentGridReference({
  cards,
}: {
  cards: readonly { id: string; title: string; caption: string }[];
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current
      ?.querySelector<HTMLButtonElement>('button[aria-label="Tampilan grid"]')
      ?.click();
  }, []);
  return (
    <div ref={container}>
      <DocumentListClient
        courseId="fixture"
        materials={cards.map((card) => ({
          id: card.id,
          courseId: "fixture",
          title: card.title,
          kind: "article" as const,
          docCategory: "materi" as const,
          fileSize: card.caption,
          completed: false,
        }))}
        chapters={[]}
      />
    </div>
  );
}
