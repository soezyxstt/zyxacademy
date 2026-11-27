import { NextResponse } from "next/server";
import { z } from "zod";
import { requireNativePersonalAccount, requireNativeStudent } from "../../_session";
import { isPersonalCommunityOperation } from "@/packages/student-community/account-access";
import { readNativeStudentJson } from "../../_request";
import { getStudentGamificationAccess, requireStudentGamificationAccess } from "@/lib/gamification/access";
import { getGamificationLeaderboard } from "@/lib/gamification/leaderboard";
import * as social from "@/lib/gamification/social";
import { getDiscussionActor, requireDiscussionCourse, resolveDiscussionCourses } from "@/lib/discussions/access";
import { listChannelMetadataPage } from "@/lib/discussions/service";
import { getEquippedZyraAppearance } from "@/lib/gamification/queries";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { EXPO_STAGING_SCHEME, normalizeCalendarLinkScheme } from "@/lib/native/expo-auth-config";
import { studentCalendarPath } from "@/packages/student-community/calendar-link";
import { saveUserLocalePreference } from "@/lib/i18n/preferences";
import { changeReward } from "@/app/(student)/achievements/actions";
import { submitStudentFeedbackAction } from "@/app/(student)/feedback/actions";
import { joinGroupWithToken } from "@/app/(student)/dashboard/groups/actions";
import { getGroupRenameStatus, renameStudentGroup } from "@/app/(student)/dashboard/groups/rename-actions";
import { updateStudentProfileAction } from "@/app/(student)/profile/actions";
import {
  updateActivityNotificationPreferenceAction, updateNotificationPreferencesAction, updateTutorialEmailScheduleAction,
} from "@/app/(student)/settings/notifications/actions";
import { connectGoogleCalendar, requestGoogleCalendarSync } from "@/app/actions/google-calendar";
import {
  activityPreferenceKeys, emailPreferenceKeys, feedbackCategories,
} from "@/packages/native-parity/student/community/contracts";
import {
  getNativeAcademicRanking, getNativeAchievements, getNativeCalendar, getNativeCalendarStatus, getNativeCourseRanking, getNativeGroups,
  getNativeNotificationPreferences, getNativePet, getNativeProfile, getNativeReflections, getNativeSchedule,
} from "@/lib/student/native-community/read";
import { runNativeScheduleAction } from "@/lib/student/native-community/schedule";
import { runNativeDiscussionAction } from "@/lib/student/native-community/discussions";

type Context = { params: Promise<{ operation: string }> };
const identifier = z.string().min(1).max(160).refine(value => value.trim() === value && !value.includes("\0"));
const cursor = z.string().min(1).max(512);
const achievementTab = z.enum(["overview", "badges", "missions", "rewards"]);
const cosmeticSlot = z.enum(["frame", "theme", "title", "zyra_skin", "zyra_avatar", "pet_action", "pet_suit"]);
const socialOperation = z.enum(["follow", "unfollow", "block", "unblock", "remove", "report"]);
const reportReason = z.enum(["harassment", "impersonation", "inappropriate", "other"]);
const workPaths = z.enum(["/calendar", "/dashboard/schedule"]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function failure(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (error instanceof z.ZodError || error instanceof SyntaxError || ["Invalid cursor", "Invalid settings", "Invalid display name",
    "Invalid visibility", "Invalid badge", "Invalid avatar mode", "Invalid badge tier", "Invalid avatar badge", "Invalid badges",
    "INVALID_BADGE", "INVALID_REASON", "DISCUSSION_INVALID"].includes(code)) return json({ code: "invalid" }, 400);
  if (code === "Unauthorized") return json({ code: "unauthenticated" }, 401);
  if (code === "Forbidden") return json({ code: "forbidden" }, 403);
  if (["UNAVAILABLE", "DISCUSSION_UNAVAILABLE", "COURSE_NOT_FOUND"].includes(code)) return json({ code: "unavailable" }, 404);
  if (["REPORT_COOLDOWN", "RATE_LIMITED", "DISCUSSION_RATE_LIMITED"].includes(code)) return json({ code: "rate_limited" }, 429);
  if (code === "DISCUSSION_CONFLICT") return json({ code: "conflict" }, 409);
  return json({ code: "unavailable" }, 503);
}

async function requireLearnerDiscussionActor(userId: string) {
  const actor = await getDiscussionActor(userId);
  if (actor.role !== "student") throw new Error("Forbidden");
  return actor;
}

async function readDiscussionScope(userId: string, id?: string) {
  const actor = await requireLearnerDiscussionActor(userId);
  let courseId: string | undefined;
  if (id) {
    const scope = (await resolveDiscussionCourses(actor, [id])).get(id);
    if (!scope?.hasFullContentAccess || scope.reason) throw new Error("Forbidden");
    await requireDiscussionCourse(actor, scope.canonicalCourseId, scope.legacyCourseId);
    courseId = scope.canonicalCourseId ?? scope.legacyCourseId ?? undefined;
    if (!courseId) throw new Error("DISCUSSION_UNAVAILABLE");
  }
  const [catalog, appearance] = await Promise.all([
    listChannelMetadataPage(userId, { limit: 20, courseId, kind: courseId ? "course" : undefined }),
    getEquippedZyraAppearance(userId).catch(() => ({ skinId: null })),
  ]);
  return { catalog, courseId: courseId ?? null, skinId: appearance.skinId };
}

export async function GET(request: Request, { params }: Context) {
  const { operation } = await params;
  const authorize = isPersonalCommunityOperation("GET", operation) ? requireNativePersonalAccount : requireNativeStudent;
  const actor = await authorize(request);
  if (actor instanceof Response) return actor;
  const { searchParams: query } = new URL(request.url);
  const { userId } = actor;
  const id = () => identifier.parse(query.get("id"));
  try {
    switch (operation) {
      case "academic-ranking": return json(await getNativeAcademicRanking(userId, identifier.optional().parse(query.get("course") ?? undefined)));
      case "course-ranking": {
        const ranking = await getNativeCourseRanking(userId, id(), query.get("type") === "simulation" ? "simulation" : "quiz");
        return ranking ? json(ranking) : json({ code: "unavailable" }, 404);
      }
      case "participation-ranking": {
        await requireStudentGamificationAccess();
        const period = z.enum(["all", "week", "month"]).parse(query.get("period") ?? "all");
        const scope = z.enum(["global", "following"]).parse(query.get("scope") ?? "global");
        return json(await getGamificationLeaderboard(userId, { period, scope, cursor: cursor.optional().parse(query.get("cursor") ?? undefined) }));
      }
      case "achievements":
        await requireStudentGamificationAccess();
        return json(await getNativeAchievements(userId, achievementTab.parse(query.get("tab") ?? "overview")));
      case "pet":
        await requireStudentGamificationAccess();
        return json(await getNativePet(userId));
      case "calendar": return json(await getNativeCalendar(userId));
      case "calendar-status": return json(await getNativeCalendarStatus(userId));
      case "groups": return json(await getNativeGroups());
      case "group-rename": return json(await getGroupRenameStatus(id()));
      case "schedule": {
        const offset = z.coerce.number().int().min(-104).max(104).parse(query.get("offset") ?? 0);
        return json(await getNativeSchedule(userId, offset, identifier.optional().parse(query.get("course") ?? undefined)));
      }
      case "profile": {
        const profile = await getNativeProfile(userId, Boolean(await getStudentGamificationAccess()), query.get("view") !== "edit");
        return profile ? json(profile) : json({ code: "unavailable" }, 404);
      }
      case "public-profile": {
        await requireStudentGamificationAccess();
        const profile = await social.getPublicStudentProfile(userId, id());
        return profile ? json(profile) : json({ code: "unavailable" }, 404);
      }
      case "reflections": return json(await getNativeReflections(userId, z.iso.date().optional().parse(query.get("before") ?? undefined)));
      case "notifications": return json(await getNativeNotificationPreferences(userId));
      case "discussion-scope": return json(await readDiscussionScope(userId, identifier.optional().parse(query.get("course") ?? undefined)));
      case "people":
        await requireStudentGamificationAccess();
        return json(await social.searchVisibleStudents(userId, z.string().trim().min(2).max(80).parse(query.get("search"))));
      case "following":
        await requireStudentGamificationAccess();
        return json(await social.getStudentFollowList(userId, z.enum(["followers", "following"]).parse(query.get("direction")),
          z.string().min(1).max(100).optional().parse(query.get("cursor") ?? undefined)));
      default: return json({ code: "unavailable" }, 404);
    }
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const { operation } = await params;
  const authorize = isPersonalCommunityOperation("POST", operation) ? requireNativePersonalAccount : requireNativeStudent;
  const actor = await authorize(request);
  if (actor instanceof Response) return actor;
  const { userId } = actor;
  try {
    const body = await readNativeStudentJson(request);
    switch (operation) {
      case "feedback": {
        const input = z.strictObject({ category: z.enum(feedbackCategories), rating: z.number().int().min(1).max(5),
          message: z.string().trim().min(5).max(5000), email: z.string().email().max(254).optional() }).parse(body);
        return json(await submitStudentFeedbackAction(input));
      }
      case "groups": {
        const { token } = z.strictObject({ token: z.string().trim().min(1).max(160) }).parse(body);
        return json(await joinGroupWithToken(token));
      }
      case "group-rename": {
        const { id, name } = z.strictObject({ id: identifier, name: z.string().trim().min(1).max(80) }).parse(body);
        return json(await renameStudentGroup(id, name));
      }
      case "schedule": return json(await runNativeScheduleAction(body));
      case "discussion":
        await requireLearnerDiscussionActor(userId);
        return json(await runNativeDiscussionAction(body));
      case "calendar-sync": {
        z.strictObject({}).parse(body);
        return json(await requestGoogleCalendarSync());
      }
      case "calendar-connect": {
        const { path, scheme, linkState } = z.strictObject({
          path: workPaths, scheme: z.string().max(80), linkState: z.uuidv4().optional(),
        }).parse(body);
        const nativeScheme = normalizeCalendarLinkScheme(scheme, linkState, new URL(resolveAuthBaseUrl()).origin);
        if (!nativeScheme || (nativeScheme === EXPO_STAGING_SCHEME && !studentCalendarPath(path))) {
          return json({ code: "invalid" }, 400);
        }
        return json(await connectGoogleCalendar(path, { nativeScheme, linkState }));
      }
      case "reward": {
        await requireStudentGamificationAccess();
        const { id, operation, slot } = z.strictObject({ id: identifier.max(128), operation: z.enum(["buy", "equip", "remove"]), slot: cosmeticSlot }).parse(body);
        return json(await changeReward(id, operation, slot));
      }
      case "profile": {
        const input = z.strictObject({ faculty: z.string().max(100), major: z.string().max(100), entryYear: z.string().regex(/^\d{4}$/) }).parse(body);
        const form = new FormData();
        for (const key of Object.keys(input) as (keyof typeof input)[]) form.set(key, input[key]);
        return json(await updateStudentProfileAction({ success: false, message: "", submittedAt: 0 }, form));
      }
      case "social-settings": {
        await requireStudentGamificationAccess();
        const { parseSocialSettings } = await import("@/lib/gamification/social-contracts");
        await social.updateStudentSocialSettings(userId, parseSocialSettings(body));
        return json({ success: true });
      }
      case "social": {
        await requireStudentGamificationAccess();
        const input = z.strictObject({ id: identifier, action: socialOperation, reason: reportReason.optional() }).parse(body);
        const { id, action } = input;
        if (action === "report") {
          await social.reportStudent(userId, id, reportReason.parse(input.reason));
        } else {
          const run = { follow: social.followStudent, unfollow: social.unfollowStudent, block: social.blockStudent,
            unblock: social.unblockStudent, remove: social.removeFollower }[action];
          await run(userId, id);
        }
        return json({ success: true });
      }
      case "notification-email": {
        const input = z.strictObject({ emailEnabled: z.boolean(), courseUpdates: z.boolean(), eventsAndSchedules: z.boolean(),
          learningReminders: z.boolean(), newsAndOffers: z.boolean() }).parse(body);
        const form = new FormData();
        for (const key of emailPreferenceKeys) form.set(key, String(input[key]));
        return json(await updateNotificationPreferencesAction({ success: false, message: "", submittedAt: 0 }, form));
      }
      case "notification-activity": {
        const { key, enabled } = z.strictObject({ key: z.enum(activityPreferenceKeys), enabled: z.boolean() }).parse(body);
        return json(await updateActivityNotificationPreferenceAction(key, enabled));
      }
      case "notification-timing": return json(await updateTutorialEmailScheduleAction(body));
      case "locale": {
        const { locale } = z.strictObject({ locale: z.enum(["id", "en"]) }).parse(body);
        await saveUserLocalePreference(userId, locale);
        return json({ success: true });
      }
      default: return json({ code: "unavailable" }, 404);
    }
  } catch (error) {
    return failure(error);
  }
}
