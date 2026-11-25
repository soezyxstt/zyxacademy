import { fixture, fixtureCourse, fixtureSession } from "./config";

const courses = fixture.hasCourse ? [fixtureCourse] : [];
const activity = [true, true, false, true, false, false, false];
export const useSession = () => ({ data: fixtureSession, isPending: false, error: null, refetch: async () => {} });
export const signOut = async () => ({ error: null });
export const useQueryAccountId = () => fixture.userId;
export const useSyncQueryAccount = () => {};
export const useQueryAccountCurrent = () => true;
export const useStudentSidebarData = ({ activeCourseId }: { activeCourseId?: string }) => ({
  courses,
  activeCourse: activeCourseId === fixture.courseId ? fixtureCourse : undefined,
  streak: 3,
  weeklyActivity: activity,
});
export const saveLocaleSelection = async () => ({ success: true });
export const mirrorResolvedAccountLocaleCookie = async () => ({ success: true });
export const getStudentSearchDocuments = async () => [
  { id: "course", title: fixtureCourse.title, subtitle: "MA1101", href: `/courses/${fixture.courseId}`, group: "Course" },
  { id: "schedule", title: fixture.locale === "en" ? "Schedule" : "Jadwal", subtitle: "", href: "/dashboard/schedule", group: "Halaman" },
];
export const getMarketingSearchDocuments = getStudentSearchDocuments;
export const searchVisibleStudentsAction = async () => [];
export const getPublicStudentProfileAction = async () => null;
export const getStudentFollowListAction = async () => ({ entries: [], nextCursor: null });
export const followStudentAction = async () => {};
export const unfollowStudentAction = async () => {};
export const removeFollowerAction = async () => {};
export const getMyZyraAppearance = async () => ({ skinId: null, avatarId: null, petAccess: true });
export const getGoogleCalendarStatus = async () => ({ connected: false, pending: false, error: null, lastSyncedAt: null });
export const requestGoogleCalendarSync = async () => ({ ok: true });
export const connectGoogleCalendar = async () => ({ url: null });

export const loadTutorHistoryAction = async () => ({ sessionId: null, sessionTitle: null, messages: [] });
export const listTutorSessionsAction = async () => [];
export const getTutorCourseContextAction = async () => fixtureCourse.title;
export const saveTutorMessagesAction = async () => ({ success: true });
export const clearTutorHistoryAction = async () => ({ success: true });
export const explainConceptAction = async () => { throw new Error("The visual fixture never invokes AI"); };
export const analyzeMistakeAction = explainConceptAction;
export const buildStudyPlanAction = explainConceptAction;

export class AccountSwitchError extends Error { code = "FIXTURE"; }
export const MAX_SAVED_ACCOUNTS = 5;
export const listSavedAccounts = async () => [{ user: fixtureSession.user, current: true }];
export const removeSavedAccount = async () => {};
export const switchSavedAccount = async () => {};
export const startWebAccountSignIn = async () => {};
export class NativeGoogleSignInError extends Error {}
export const startNativeGoogleSignIn = async () => false;
export const getNativeAuthScheme = () => null;
export const isNativeSystemBrowserSupported = () => false;
export const openNativeSystemBrowser = async () => false;

export const HAPTICS_STORAGE_KEY = "fixture-haptics";
export const DEFAULT_HAPTICS_ENABLED = false;
export const parseHapticsPreference = () => false;
export const getHapticsEnabled = () => false;
export const setHapticsEnabled = () => {};
export const resetHapticsPreferenceCache = () => {};
export const subscribeHapticsPreference = () => () => {};
export const isHapticsSupported = () => false;
export const triggerHapticImpact = async () => false;
export const triggerHapticNotification = triggerHapticImpact;
export const triggerHapticSelection = triggerHapticImpact;
export const hapticLight = triggerHapticImpact;
export const hapticMedium = triggerHapticImpact;
export const hapticHeavy = triggerHapticImpact;
export const hapticSuccess = triggerHapticImpact;
export const hapticWarning = triggerHapticImpact;
export const hapticError = triggerHapticImpact;
export const hapticSelection = triggerHapticImpact;
