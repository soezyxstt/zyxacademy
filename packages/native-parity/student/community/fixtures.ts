import type { DiscussionChannelMetadata, DiscussionMessage, DiscussionThread } from "../../../../lib/discussions/contracts";
import type {
  AchievementData, AgendaData, Group, LeaderboardPage, NotificationPreferences, Profile,
  PublicStudentProfile, Reflection, Schedule, StudentIdentity,
} from "./contracts";

export type CommunityFixtureScenario = "loaded" | "empty" | "unavailable";
const origin = "https://student.fixture.invalid";
const endpoint = "/api/native/student/community/";
const subject = { id: "matematika-1", title: "Matematika I" };
const identity = {
  publicId: "nara-putri", displayName: "Nara Putri", avatarUrl: null, rankKey: "kades", equippedFrameId: null, equippedThemeId: null,
} satisfies StudentIdentity;
const summary = { baseXpMicro: 165_000_000, bonusXpMicro: 6_000_000, courseCreditsMicro: 1_000_000, lpBalance: 875, rankKey: "kades" } as const;
const badges: AchievementData["badges"] = [
  { family: "warrior_reader", tier: 1, count: 7, nextThreshold: 12 },
  { family: "practice_knight", tier: 0, count: 3, nextThreshold: 5 },
];
const mission: AchievementData["missions"][number] = {
  id: "quest-week", kind: "material", target: 5, progress: 3, rewardLp: 50, endsAt: "2026-11-29T17:00:00.000Z", completedAt: null,
};
const initialRewards: AchievementData["rewards"] = [
  { id: "zyra-avatar-studio-cat", name: "Zyra", slot: "zyra_avatar", priceLp: 0, owned: true, equipped: true },
  { id: "zyra-avatar-studio-tiger", name: "Harimau", slot: "zyra_avatar", priceLp: 750, owned: false, equipped: false },
  { id: "pet-suit-zyx-shirt", name: "Kaus Zyx", slot: "pet_suit", priceLp: 400, owned: true, equipped: false },
  { id: "pet-action-jump", name: "Melompat", slot: "pet_action", priceLp: 200, owned: true, equipped: true },
  { id: "frame-classic", name: "Bingkai klasik", slot: "frame", priceLp: 200, owned: true, equipped: true },
];
const ranking = { rank: 1, name: identity.displayName, average: 94.5, attempts: 4, identity, isSelf: false };
const rankedStudent = { ...identity, position: 1, baseXpMicro: 165_000_000, avatarMode: "photo", avatarBadgeId: null, badgeTier: null } as const;
const initialPublic: PublicStudentProfile = {
  ...identity, avatarBadgeId: null, avatarMode: "photo", baseXpMicro: null, avatarBadgeTier: null,
  earnedBadges: [{ family: "warrior_reader", tier: 1 }], featuredBadgeIds: ["warrior_reader"], equippedTitleId: null,
  equippedZyraAvatarId: "zyra-avatar-studio-cat", major: null, faculty: "FMIPA", followerCount: 2, followingCount: 1,
  canFollow: true, isFollowing: false,
};
const initialProfile: Profile = {
  account: { name: "Aruni Rasyid", email: "aruni@example.invalid", image: null, faculty: "FMIPA", major: "Matematika", entryYear: 2025 },
  customization: {
    settings: { publicId: "aruni-rasyid", displayName: "Aruni Rasyid", visibility: "members", showMajor: true, showFaculty: true,
      allowFollows: true, leaderboardOptIn: true, avatarBadgeId: null, avatarMode: "photo", badgeTier: null, featuredBadgeIds: [] },
    rewards: initialRewards, badges,
  },
  summary, courses: [subject], stats: { completedMaterials: 7, completedExams: 3, averageScore: 88 },
};
const initialPreferences: NotificationPreferences = {
  email: { emailEnabled: true, courseUpdates: true, eventsAndSchedules: true, learningReminders: true, newsAndOffers: false },
  activity: { discussionsEnabled: true, flashcardsEnabled: false, tutorAvailabilityEnabled: false, tutorialSessionEmailEnabled: true,
    tutorialEmailSchedule: { mode: "once", leadMinutes: 60, intervalMinutes: 30 } },
  canUseTutorialAvailability: false,
};
const initialGroup: Group = {
  id: "group-limit", name: "Kelompok turunan", status: "active", packageName: "Dua sesi per minggu", remainingQuota: 11, weeklyRemainingQuota: 2,
  courses: [subject], members: [{ id: "member", name: initialProfile.account.name, role: "member", isMe: true, identity: null },
    { id: "member-peer", name: identity.displayName, role: "leader", isMe: false, identity }],
  token: { value: "Zyx-DEMO0001-4-1", capacity: 4, expiresAt: null },
};
const schedule: Schedule = {
  week: { startIso: "2026-11-23", endIso: "2026-11-29" }, locked: false, courses: [subject],
  groups: [{ id: initialGroup.id, name: initialGroup.name, courseIds: [subject.id] }],
  slots: [{ id: "slot-integral", date: "2026-11-28", startTime: "10:00", endTime: "11:00", tutor: "Raisa Dewi", courseIds: [subject.id], occupied: false, bookable: true }],
  bookings: [], academic: [{ id: "evt-limit", title: "Kuis limit", date: "2026-11-27T05:00:00.000Z", startTime: "2026-11-27T05:00:00.000Z", endTime: "" }],
};
const events: AgendaData["events"] = [
  { id: "quiz-limit", title: "Kuis limit", category: "quiz", categoryLabel: "quiz", timeKind: "deadline", dateValue: "2026-11-27T05:00:00.000Z",
    courseTitle: subject.title, status: "upcoming", actionUrl: "/courses/matematika-1/quiz/latihan-fungsi" },
  { id: "tutorial-limit", title: "", category: "tutorial", categoryLabel: "tutorialGroup", timeKind: "range", dateValue: "2026-11-25T03:00:00.000Z",
    scheduledRange: "10:00–11:00 WIB", tutorName: "Raisa Dewi", tutorialTopic: "Fungsi komposisi", courseTitle: subject.title, status: "past",
    actionUrl: "/dashboard/schedule" },
];
const reflections: Reflection[] = [{
  id: "week-1", weekStart: "2026-11-23", payload: {
    completed: { quizzes: 2, flashcards: 12, modules: 3 }, masteryGrowth: 12, mostImproved: "Turunan",
    streak: { currentStreak: 3, longestStreak: 5 },
  },
}];
const channels: DiscussionChannelMetadata[] = [
  { id: "channel-general", title: "Umum", kind: "global", muted: false, courseId: null },
  { id: "channel-math", title: subject.title, courseTitle: subject.title, kind: "course", muted: false, courseId: subject.id },
];
const sampleThread: DiscussionThread = {
  id: "thread-limit", channelId: channels[1].id, title: "Limit kiri dan kanan pada fungsi potongan",
  status: "open", labels: [], helpKind: null, createdAt: "2026-11-22T12:24:00.000Z", lastActivityAt: "2026-11-22T12:24:00.000Z",
  answerCount: 0, unreadCount: 1, canReply: true, canResolve: true,
};
const sampleMessage: DiscussionMessage = {
  id: "message-limit", threadId: sampleThread.id, seq: 1, author: { id: "peer", name: identity.displayName, role: "student" },
  kind: "human", messageType: "question", body: "Bagaimana cara menentukan limit kiri dan kanan jika nilai fungsi pada titik sambung berbeda?",
  createdAt: sampleThread.createdAt, editedAt: null, revision: 0, replyTo: null, forwardedFrom: null, skinId: null,
  attachments: [], reactions: [], canEdit: false, canDelete: false, canReport: true, canReply: true, canForward: true, canReact: true,
};
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
}

/** State is private to each fixture transport. No operation falls through to a live origin. */
export function createCommunityFixtureRequest(scenario: CommunityFixtureScenario = "loaded") {
  const populated = scenario !== "empty";
  let firstFailure = scenario === "unavailable";
  let member = populated;
  let group = clone(initialGroup);
  let preferences = clone(initialPreferences);
  let profile = clone(initialProfile);
  let publicProfile = clone(initialPublic);
  let blocked = false;
  let rewards = clone(initialRewards);
  let balance = summary.lpBalance as number;
  let synced = false;
  let quietHours = { enabled: false, startMinute: 1320, endMinute: 420, timeZone: "Asia/Jakarta" };
  let booked = false;
  const threads = populated ? [clone(sampleThread)] : [];
  const messages = populated ? [clone(sampleMessage)] : [];
  const sendReplays = new Map<string, { threadId: string; messageId: string }>();
  let readThroughSeq = 0;
  return async function request(path: string, init?: RequestInit): Promise<Response> {
    const url = new URL(path, origin);
    const query = url.searchParams;
    if (url.origin !== origin || !isCommunityFixturePath(url.pathname)) return response({ code: "unavailable" }, 404);
    if (init?.signal?.aborted) throw new Error("ABORTED");
    if (firstFailure) {
      firstFailure = false;
      throw new TypeError("Network request failed");
    }
    if (url.pathname === "/api/notifications/quiet-hours") {
      if (init?.method === "PUT") quietHours = JSON.parse(String(init.body ?? "{}"));
      return response(quietHours);
    }
    if (url.pathname === "/api/discussions/workspace") {
      const view = query.get("view");
      const channel = query.get("channelId");
      if (view === "catalog") return response({ items: channels.filter(item => !query.has("courseId") || item.courseId === query.get("courseId")), nextCursor: null });
      if (view === "channels") return response(channels.filter(item => query.getAll("channelId").includes(item.id)));
      if (view === "threads") return response({
        items: threads.filter(item => (!channel || item.channelId === channel) && (!query.has("status") || item.status === query.get("status"))
          && item.title.toLowerCase().includes((query.get("search") ?? "").toLowerCase())),
        nextCursor: null,
      });
      const thread = threads.find(item => item.id === query.get("threadId"));
      return thread ? response({ thread, readThroughSeq, aiStatuses: [],
        messages: { items: messages.filter(item => item.threadId === thread.id), nextCursor: null, observationReceipt: "fixture-observation" } }) : response({ code: "unavailable" }, 404);
    }
    const operation = url.pathname.slice(endpoint.length);
    if (init?.method === "POST") {
      const input = JSON.parse(String(init.body ?? "{}"));
      switch (operation) {
        case "reward": {
          const reward = rewards.find(item => item.id === input.id && item.slot === input.slot);
          if (!reward) return response({ ok: false });
          if (input.operation === "buy") {
            if (reward.owned || balance < reward.priceLp) return response({ ok: false });
            balance -= reward.priceLp;
            rewards = rewards.map(item => item.id === reward.id ? { ...item, owned: true } : item);
          } else if (input.operation === "equip" && reward.owned) {
            rewards = rewards.map(item => item.slot === reward.slot ? { ...item, equipped: item.id === reward.id } : item);
          } else if (input.operation === "remove" && reward.equipped && ["pet_action", "pet_suit"].includes(reward.slot)) {
            rewards = rewards.map(item => item.id === reward.id ? { ...item, equipped: false } : item);
          } else return response({ ok: false });
          return response({ ok: true });
        }
        case "calendar-sync": synced = true; return response({ ok: true });
        case "groups":
          if (input.token !== "Zyx-DEMO0001-4-1") return response({ success: false, error: "Token tidak valid." });
          member = true;
          break;
        case "group-rename": group = { ...group, name: input.name }; break;
        case "schedule":
          if (input.action === "book") booked = true;
          if (input.action === "cancel") booked = false;
          break;
        case "profile": profile = { ...profile, account: { ...profile.account, faculty: input.faculty, major: input.major, entryYear: Number(input.entryYear) } }; break;
        case "social-settings": if (profile.customization) profile = { ...profile, customization: { ...profile.customization,
          settings: { ...input, publicId: profile.customization.settings.publicId } } }; break;
        case "social":
          if (input.action === "block") blocked = true;
          if (input.action === "unblock") blocked = false;
          if (input.action === "follow") publicProfile = { ...publicProfile, isFollowing: true };
          if (input.action === "unfollow") publicProfile = { ...publicProfile, isFollowing: false };
          break;
        case "notification-email": preferences = { ...preferences, email: input }; break;
        case "notification-activity": preferences = { ...preferences, activity: { ...preferences.activity, [input.key]: input.enabled } }; break;
        case "notification-timing": preferences = { ...preferences, activity: { ...preferences.activity, tutorialEmailSchedule: input } }; break;
        case "discussion": {
          const draft = input.input;
          if (draft?.requestId || input.action === "forward") {
            const id = draft?.requestId ?? input.requestId;
            const replay = sendReplays.get(id);
            if (replay) return response({ ok: true, value: replay });
            const target = { threadId: draft?.threadId ?? input.threadId ?? `discussion-${threads.length + 1}`, messageId: `message-${messages.length + 1}` };
            if (input.action === "create") threads.unshift({
              ...sampleThread, id: target.threadId, channelId: draft.channelId,
              title: draft.title || draft.body.split("\n")[0].slice(0, 160), unreadCount: 0,
            });
            messages.push({ ...sampleMessage, id: target.messageId, threadId: target.threadId, body: draft?.body ?? sampleMessage.body,
              seq: messages.filter(item => item.threadId === target.threadId).length + 1,
              author: { id: "aruni", name: profile.account.name, role: "student" }, canEdit: true, canDelete: true, canReport: false });
            sendReplays.set(id, target);
            return response({ ok: true, value: target });
          }
          const thread = threads.find(item => item.id === input.threadId);
          const message = messages.find(item => item.id === input.messageId);
          if (thread && input.action === "resolve") {
            thread.status = input.resolved ? "resolved" : "open";
            thread.canReply = !input.resolved;
          }
          if (thread && input.action === "read") { readThroughSeq = input.throughSeq; thread.unreadCount = 0; }
          if (message && input.action === "edit") { message.body = input.body; message.revision += 1; }
          if (message && input.action === "delete") { message.body = ""; message.bodyKind = "deleted"; }
          if (message && input.action === "reaction") message.reactions = input.selected ? [{ emoji: input.emoji, selected: true, count: 1 }] : [];
          if (input.action === "mentions" || input.action === "channel-mentions") return response([{ id: "peer", name: identity.displayName, role: "student" }]);
          if (input.action === "author") return response({ kind: "student", name: identity.displayName, role: "student", profile: publicProfile });
          break;
        }
        case "locale":
        case "feedback": break;
        default: return response({ code: "unavailable" }, 404);
      }
      return response({ success: true });
    }
    const currentSummary = { ...summary, lpBalance: balance };
    switch (operation) {
      case "achievements": return response({ summary: currentSummary, badges: populated ? badges : [], missions: populated ? [mission] : [], rewards: populated ? rewards : [] });
      case "pet": return response({ summary: currentSummary, items: populated ? rewards.filter(item => item.slot.startsWith("pet_") || item.slot === "zyra_avatar") : [] });
      case "academic-ranking": return response({ courses: member ? [subject] : [], courseId: query.get("course") === subject.id && member ? subject.id : null,
        boards: member ? [{ course: subject, rows: populated ? [ranking] : [] }] : [] });
      case "course-ranking": return query.get("id") !== subject.id ? response({ code: "unavailable" }, 404)
        : member ? response({ course: subject, rows: populated ? [ranking] : [], assessment: query.get("type") === "simulation" ? "simulation" : "quiz" })
          : response({ code: "forbidden" }, 403);
      case "participation-ranking": return response({ entries: populated ? [rankedStudent] : [], ownEntry: null, nextCursor: null } satisfies LeaderboardPage);
      case "groups": return response(member ? [group] : []);
      case "group-rename": return response({ success: member, canRename: member, nextRenameAt: null });
      case "calendar-status":
      case "calendar": {
        const sync = { connected: true, pending: synced, lastSyncedAt: null, error: null };
        return response(operation === "calendar" ? { events: populated ? events : [], sync } : sync);
      }
      case "schedule": return response(populated ? { ...schedule, groups: [{ ...schedule.groups[0], name: group.name }],
        slots: schedule.slots.map(slot => ({ ...slot, occupied: booked })), bookings: booked ? [{
          id: "booking-limit", courseId: subject.id, course: subject.title, group: group.name, tutor: "Raisa Dewi",
          date: schedule.slots[0].date, startTime: schedule.slots[0].startTime, endTime: schedule.slots[0].endTime,
          topic: "Teknik integrasi", notes: null, status: "scheduled", meetUrl: null, tickets: [], resources: [],
        }] : [],
      } : { ...schedule, groups: [], slots: [], academic: [], courses: [] });
      case "profile": return response({ ...profile, customization: profile.customization && { ...profile.customization, rewards, badges: populated ? badges : [] },
        summary: currentSummary, courses: member ? [subject] : [] });
      case "public-profile": return populated && !blocked && query.get("id") === identity.publicId ? response(publicProfile) : response({ code: "unavailable" }, 404);
      case "people": return response(populated && !blocked ? [identity] : []);
      case "following": return response({ entries: populated && !blocked ? [identity] : [], nextCursor: null });
      case "reflections": return response({ entries: populated ? reflections : [], nextCursor: null });
      case "notifications": return response(preferences);
      case "discussion-scope": return response({ catalog: {
        items: query.has("course") ? channels.filter(channel => channel.courseId === query.get("course")) : channels, nextCursor: null,
      }, courseId: query.get("course"), skinId: null });
      default: return response({ code: "unavailable" }, 404);
    }
  };
}

export function isCommunityFixturePath(path: string) {
  return path.startsWith(endpoint) || path === "/api/notifications/quiet-hours" ||
    path === "/api/discussions/workspace" || path.startsWith("/api/discussions/workspace?");
}
