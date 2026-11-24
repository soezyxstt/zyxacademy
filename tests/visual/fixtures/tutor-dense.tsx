import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import "katex/dist/katex.min.css";
import tutor from "@/messages/en/tutor.json";
import ui from "@/messages/en/ui.json";
import core from "@/messages/en/core.json";
import { ApplicationPage } from "@/components/application-page";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import { PageHeader } from "@/components/page-header";
import { AnalyticsClient } from "@/components/tutor/analytics-client";
import { TutorCourseLoading, TutorDashboardLoading } from "@/components/tutor/loading-skeletons";
import { TutorDashboardContent } from "@/features/tutor-dashboard/ui/tutor-dashboard-content";
import type { TutorDashboardViewProps } from "@/features/tutor-dashboard/model/types";
import type { SnapshotPayload, WeakConcept } from "@/lib/cohort-analytics";

const courseTitle = "Matematika dasar untuk sains dan rekayasa berkelanjutan";
const functionConcept = "Menentukan limit fungsi rasional pada titik diskontinuitas $\\lim_{x \\to 1} \\frac{x^2 - 1}{x-1}$ dengan substitusi dan faktorisasi";
const priorities: WeakConcept[] = [
  { conceptName: functionConcept, avgMastery: 28, studentCount: 24, bucketLow: 15, bucketMid: 7, bucketHigh: 2 },
  { conceptName: "Hubungan antara turunan dan arah garis singgung", avgMastery: 43, studentCount: 18, bucketLow: 6, bucketMid: 8, bucketHigh: 4 },
];
const additional = { conceptName: "Kesinambungan pada interval tertutup", avgMastery: 74, studentCount: 21, bucketLow: 2, bucketMid: 4, bucketHigh: 15 };
const emptyAnalytics: SnapshotPayload = {
  courseTitle, enrolledCount: 0, activeCount: 0, weakConcepts: [], allConcepts: [], interventionCounts: [],
  conceptTrends: {}, mostMissed: {}, topMisconceptions: [], watchlist: [], engagement: { quizParticipationPct: 0, flashcardAdherencePct: 0 },
};
const analytics: SnapshotPayload = {
  ...emptyAnalytics, enrolledCount: 42, activeCount: 27,
  weakConcepts: priorities,
  allConcepts: [...priorities, additional],
  engagement: { quizParticipationPct: 64, flashcardAdherencePct: 0 },
  conceptTrends: {
    [functionConcept]: [{ week: "W1", avgMastery: 18 }, { week: "W2", avgMastery: 34 }, { week: "W3", avgMastery: 28 }],
  },
  mostMissed: {
    [functionConcept]: [{ id: "limit", prompt: "Hitung $\\lim_{x \\to 1} \\frac{x^2 - 1}{x-1}$ dengan menyederhanakan pembilang.", correctRate: 0.25, attemptCount: 24 }],
  },
  interventionCounts: [{ conceptName: "Menentukan limit dengan faktorisasi", count: 4 }],
  topMisconceptions: [
    { misconceptionKoId: "zero", label: "Menganggap $0/0$ sebagai nilai akhir limit", conceptName: "Limit fungsi rasional", pctSelected: 54, sampleSize: 24 },
    { misconceptionKoId: "slope", label: "Menukar arah perubahan variabel dengan arah garis singgung", conceptName: "Interpretasi turunan", pctSelected: 36, sampleSize: 18 },
  ],
  watchlist: [
    { studentId: "a", name: "Putu Anggraini Maheswari Suryaningrat", decliningConcepts: ["Limit fungsi rasional", "Interpretasi turunan"], activeInterventionCount: 1, lastActiveAt: null },
    { studentId: "b", name: "Bima Santoso", decliningConcepts: [], activeInterventionCount: 2, lastActiveAt: null },
  ],
};
const emptyDashboard: TutorDashboardViewProps = {
  locale: "en", counts: { courses: 0, activeGroups: 0, pendingTickets: 0, sessionsThisWeek: 0 },
  upcomingSessions: [], pendingTickets: [], courses: [],
};
const dashboard: TutorDashboardViewProps = {
  ...emptyDashboard,
  counts: { courses: 2, activeGroups: 3, pendingTickets: 8, sessionsThisWeek: 4 },
  upcomingSessions: [
    { id: "limits", courseTitle, topic: "Limit fungsi", sessionDate: "2030-01-02", startTime: "09:00", endTime: "10:30", groupName: "Kelompok persiapan ujian akhir", mode: "online" },
    { id: "physics", courseTitle: "Fisika dasar", topic: null, sessionDate: "2030-01-04", startTime: "11:00", endTime: "12:30", groupName: "Kelas reguler", mode: "offline" },
  ],
  pendingTickets: [
    { id: "schedule", type: "reschedule", reason: "Peserta meminta waktu pengganti karena jadwal praktikum mekanika bertabrakan." },
    { id: "cancel", type: "cancellation", reason: "Kelompok perlu membatalkan pertemuan minggu ini." },
  ],
  courses: [
    { courseId: "fixture-math", title: courseTitle, code: "MA1101", groupCount: 2 },
    { courseId: "fixture-physics", title: "Fisika dasar", code: "FI1101", groupCount: 2 },
  ],
};

function TutorFixture() {
  const search = new URLSearchParams(location.search);
  const view = search.get("view");
  const state = search.get("state");
  const isAnalytics = view === "analytics";
  const title = isAnalytics ? courseTitle : "Tutor dashboard";
  return (
    <MobileChromeProvider hasTopNav>
      <MobileTopNavbar title={title} />
      <main id="main-content">
        {state === "loading" ? (isAnalytics ? <TutorCourseLoading /> : <TutorDashboardLoading />) : (
          <ApplicationPage spacing="space-y-(--section-gap)">
            {isAnalytics ? (
              <>
                <PageHeader title={title} backHref="/tutor" backLabel="Teaching" divider={false} />
                <AnalyticsClient courseId="fixture-math" analytics={state === "empty" ? emptyAnalytics : analytics} updatedAt={null} />
              </>
            ) : <TutorDashboardContent {...(state === "empty" ? emptyDashboard : dashboard)} />}
          </ApplicationPage>
        )}
      </main>
    </MobileChromeProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <NextIntlClientProvider locale="en" timeZone="Asia/Jakarta" messages={{ tutor, ui, core }}>
    <TutorFixture />
  </NextIntlClientProvider>,
);
