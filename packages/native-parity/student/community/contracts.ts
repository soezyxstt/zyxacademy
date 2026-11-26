import type {
  AchievementBadge, CosmeticSlot, GamificationMission, GamificationReward, GamificationSummary,
} from "../../../../lib/gamification/contracts";
import type {
  LeaderboardPage, PublicStudentProfile, StudentIdentity, StudentSocialSettings,
} from "../../../../lib/gamification/social-contracts";
import type { CalendarEventItem } from "../../../../lib/student/agenda-contract";
import type { TutorialEmailSchedule } from "../../../../lib/notifications/tutorial-email-schedule";

type Serialized<T> = T extends Date ? string : T extends object ? { [K in keyof T]: Serialized<T[K]> } : T;
export type Badge = Serialized<AchievementBadge>;
export type Mission = Serialized<GamificationMission>;
export type { CalendarEventItem, CosmeticSlot, GamificationReward, GamificationSummary, LeaderboardPage, PublicStudentProfile, StudentIdentity, StudentSocialSettings, TutorialEmailSchedule };

export const communityRoutes = [
  "/achievements", "/calendar", "/courses/[id]/discussions", "/courses/[id]/leaderboard",
  "/dashboard/discussions", "/dashboard/groups", "/dashboard/schedule", "/discussions",
  "/feedback", "/leaderboard", "/leaderboard/academic", "/pet", "/profile", "/profile/edit",
  "/profile/reflections", "/settings", "/settings/notifications", "/settings/notifications/browser",
  "/students/[publicId]",
] as const;

export type AchievementTab = "overview" | "badges" | "missions" | "rewards";
export type AchievementData = { summary: GamificationSummary | null; badges: Badge[]; missions: Mission[]; rewards: GamificationReward[] };
export type PetData = { summary: GamificationSummary; items: GamificationReward[] };
export type AgendaData = { events: CalendarEventItem[]; sync: { connected: boolean; pending: boolean; lastSyncedAt: string | null; error: string | null } | null };
export type CourseChoice = { id: string; title: string };
export type RankingRow = { rank: number; name: string; average: number; attempts: number; identity: StudentIdentity | null; isSelf: boolean };
export type AcademicRanking = {
  courses: CourseChoice[];
  courseId: string | null;
  boards: { course: CourseChoice; rows: RankingRow[] }[];
};
export type CourseRanking = { course: CourseChoice; assessment: "quiz" | "simulation"; rows: RankingRow[] };
export type Group = {
  id: string; name: string; status: string; packageName: string | null;
  remainingQuota: number; weeklyRemainingQuota: number;
  courses: CourseChoice[];
  members: { id: string; name: string; role: string; isMe: boolean; identity: StudentIdentity | null }[];
  token: { value: string; capacity: number; expiresAt: string | null } | null;
};
export type Slot = { id: string; date: string; startTime: string; endTime: string; tutor: string; courseIds: string[]; occupied: boolean; bookable: boolean };
export type Booking = {
  id: string; courseId: string; course: string; group: string | null; tutor: string; date: string; startTime: string; endTime: string;
  topic: string | null; notes: string | null; status: string; meetUrl: string | null;
  resources: { id: string; title: string; url: string; canDelete: boolean }[];
  tickets: { id: string; status: string; reason: string | null; messages: { id: string; body: string; sender: string }[] }[];
};
export type Schedule = {
  week: { startIso: string; endIso: string }; locked: boolean;
  courses: CourseChoice[]; groups: { id: string; name: string; courseIds: string[] }[];
  slots: Slot[]; bookings: Booking[];
  academic: { id: string; title: string; date: string; startTime: string; endTime: string }[];
};
export type Profile = {
  account: { name: string; email: string; image: string | null; faculty: string | null; major: string | null; entryYear: number | null };
  customization: { settings: StudentSocialSettings; badges: Badge[]; rewards: GamificationReward[] } | null;
  summary: GamificationSummary | null;
  courses: CourseChoice[];
  stats: { completedMaterials: number; completedExams: number; averageScore: number | null } | null;
};
export type Reflection = {
  id: string; weekStart: string;
  payload: {
    completed: { quizzes: number; flashcards: number; modules: number };
    masteryGrowth: number; mostImproved: string | null;
    streak: { currentStreak: number; longestStreak: number };
  };
};
export const emailPreferenceKeys = ["emailEnabled", "courseUpdates", "eventsAndSchedules", "learningReminders", "newsAndOffers"] as const;
export const activityPreferenceKeys = ["discussionsEnabled", "flashcardsEnabled", "tutorAvailabilityEnabled", "tutorialSessionEmailEnabled"] as const;
export type EmailPreferenceKey = typeof emailPreferenceKeys[number];
export type ActivityPreferenceKey = typeof activityPreferenceKeys[number];
export type NotificationPreferences = {
  email: Record<EmailPreferenceKey, boolean>;
  activity: Record<ActivityPreferenceKey, boolean> & { tutorialEmailSchedule: TutorialEmailSchedule };
  canUseTutorialAvailability: boolean;
};
export const feedbackCategories = ["materi", "kuis", "tutor", "fitur", "lainnya"] as const;
export type FeedbackCategory = typeof feedbackCategories[number];
export type NativeOperationResult = { success: boolean; message?: string; error?: string; reason?: string; errorCode?: string };
