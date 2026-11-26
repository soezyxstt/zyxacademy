"use client";

import { useEffect, useState } from "react";
import { CalendarAgendaClient, type CalendarEventItem } from "@/app/(student)/calendar/calendar-agenda-client";
import { FeedbackForm } from "@/app/(student)/feedback/feedback-form";
import { SettingsClient } from "@/app/(student)/settings/settings-client";
import { NotificationPreferencesForm } from "@/app/(student)/settings/notifications/notification-preferences-form";
import { ApplicationPage } from "@/components/application-page";
import { QuizPlayer } from "@/components/course/quiz-player";
import { StudentApplicationShell } from "@/components/student-application-shell";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { StudentGroupsCompactClient } from "@/components/dashboard/student-groups-compact-client";
import { AchievementTabs } from "@/components/gamification/achievement-tabs";
import { BadgeList } from "@/components/gamification/badge-list";
import { LeaderboardResults } from "@/components/gamification/leaderboard-results";
import { StudentReflectionsView } from "@/components/student-reflections-view";
import { DEFAULT_EMAIL_NOTIFICATION_PREFERENCES } from "@/lib/email-preferences/contracts";

const calendar: CalendarEventItem[] = [
  {
    id: "limits", title: "Latihan limit fungsi", courseTitle: "Matematika I", category: "quiz", categoryLabel: "quiz",
    dateValue: "2030-01-02T00:00:00Z", timeKind: "deadline", actionUrl: "/courses/fixture/quiz/limits", status: "today",
  },
  {
    id: "derivatives", title: "Simulasi turunan untuk sains dan rekayasa", courseTitle: "Matematika Lanjut", category: "tryout", categoryLabel: "tryout",
    dateValue: "2030-01-02T06:30:00Z", timeKind: "opens", actionUrl: "/courses/fixture/tryout/derivatives", status: "today",
  },
  {
    id: "tutorial", title: "", courseTitle: "Matematika I", category: "tutorial", categoryLabel: "tutorialGroup",
    dateValue: "2030-01-03T06:00:00Z", timeKind: "range", scheduledRange: "13:00 - 14:30", tutorialTopic: "Limit dan kontinuitas",
    actionUrl: "/dashboard/schedule", meetUrl: "https://meet.google.com/fixture", status: "upcoming",
  },
  {
    id: "functions", title: "Kuis fungsi dasar", courseTitle: "Matematika I", category: "quiz", categoryLabel: "quiz",
    dateValue: "2030-01-01T04:00:00Z", timeKind: "deadline", actionUrl: "/courses/fixture/quiz/functions", status: "past",
  },
];
const paths: Record<string, string> = {
  quiz: "/courses/fixture/quiz/limits", settings: "/settings", "settings-account": "/settings", "calendar-empty": "/calendar", notifications: "/settings/notifications",
  feedback: "/feedback", calendar: "/calendar", groups: "/dashboard/groups", leaderboard: "/leaderboard",
  reflections: "/profile/reflections", achievements: "/achievements",
};

export function StudentPolishFixture({ view }: { view: string }) {
  const [ready, setReady] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => setReady(true), []);
  const experience: StudentExperienceAdapter = {
    mode: "demo",
    pathname: paths[view] ?? paths.quiz,
    courseHref: (id) => `/courses/${id}`,
    route: (key) => `/${key}`,
    courses: [{ id: "fixture", title: "Matematika I", category: "TPB" }],
    baseline: [], selectedCourseId: null, overlay: null, ready: true,
  };

  return (
    <StudentExperienceProvider value={experience}>
      <span hidden data-student-fixture-ready={ready ? "" : undefined} />
      <StudentApplicationShell showLive={false} personalizeTypographyAndSpacing>
        {view === "settings" || view === "settings-account" ? (
          <StudentExperienceProvider value={view === "settings-account" ? { ...experience, mode: "student" } : experience}>
            <SettingsClient email={<NotificationPreferencesForm
              accountEmail="aly@example.test"
              initialPreferences={DEFAULT_EMAIL_NOTIFICATION_PREFERENCES}
            />} />
          </StudentExperienceProvider>
        ) : view === "reflections" ? (
          <StudentReflectionsView reflections={[{ id: "week", weekStart: "2030-01-01", payload: {
            completed: { quizzes: 2, flashcards: 12, modules: 4 },
            streak: { currentStreak: 3, longestStreak: 3 }, masteryGrowth: 2,
          } }]} />
        ) : (
          <ApplicationPage>
            {view === "quiz" && <QuizPlayer courseId="fixture" attemptId="fixture-student-polish" transport={{
              submit: async () => { setSubmitted(true); },
            }} exam={{
              id: "limits", title: "Latihan limit fungsi",
              settings: {
                timeLimitSeconds: 180, perQuestionTimerEnabled: true, defaultQuestionTimerSeconds: 60,
                canGoBack: true, shuffleOptions: false, shuffleQuestions: false,
              },
              questions: [
                { id: "one", order: 1, type: "multiple_choice", prompt: "Pilih nilai limit dari $2x + 1$ saat $x$ mendekati $2$.", options: ["Tiga", "Empat", "Lima", "Enam"] },
                { id: "two", order: 2, type: "essay", prompt: "Jelaskan cara menentukan nilai limit tersebut.", options: [] },
              ],
            }} />}
            {submitted && <p role="status">Fixture answer submitted</p>}
            {view === "notifications" && <NotificationPreferencesForm accountEmail="aly@example.test" initialPreferences={DEFAULT_EMAIL_NOTIFICATION_PREFERENCES} />}
            {view === "feedback" && <FeedbackForm initialEmail="aly@example.test" />}
            {view === "calendar" && <CalendarAgendaClient events={calendar} />}
            {view === "calendar-empty" && <CalendarAgendaClient events={calendar.filter(event => event.category !== "tutorial")} />}
            {view === "groups" && <StudentGroupsCompactClient initialGroups={[]} />}
            {view === "leaderboard" && <LeaderboardResults page={{ entries: [], nextCursor: null, ownEntry: null }} period="week" scope="global" locale="en" basePath="/leaderboard" />}
            {view === "achievements" && <><AchievementTabs active="badges" labels={{ overview: "Overview", badges: "Badges", missions: "Missions", rewards: "Rewards" }} /><BadgeList badges={[]} locale="en" labels={{ family: String, tier: String, progress: "Progress", complete: "Complete", reward: (lp) => `${lp} LP`, locked: "Locked", earned: "Earned" }} /></>}
          </ApplicationPage>
        )}
      </StudentApplicationShell>
    </StudentExperienceProvider>
  );
}
