import "server-only";

import { db } from "@/db";
import {
  courses,
  mataKuliah,
  enrollmentTokens,
  groupMembers,
  aiGenerationJobs,
  aiQuestionBank,
  notifications,
  userPushTokens,
  aiUsageEvents,
  vectorSyncQueue,
  blogArticles,
} from "@/db/schema";
import { sql, eq, gte, ne, and, exists } from "drizzle-orm";
import { getTranslations } from "@/lib/i18n/server";
import {
  ALL_ADMIN_TABS,
  ADMIN_TAB_MESSAGE_KEYS,
  DEFAULT_ARCHIVED,
  ADMIN_GROUP_MESSAGE_KEYS,
} from "@/lib/admin-navigation";
import type { AdminHomeCategory, AdminHomeViewProps } from "./types";

const dashboardTabs = ALL_ADMIN_TABS.filter(tab => tab.id !== "dashboard" && !DEFAULT_ARCHIVED.includes(tab.id));
const dashboardGroups = [...new Set(dashboardTabs.map(tab => tab.group))];

export async function getAdminHomeDashboard(): Promise<AdminHomeViewProps> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    nav,
    schedule,
    t,
    courseCountRes,
    tokenStatsRes,
    jobStatsRes,
    questionStatsRes,
    notificationStatsRes,
    opsStatsRes,
    blogCountRes,
  ] = await Promise.all([
    getTranslations("admin.navigation"),
    getTranslations("tutor.schedule"),
    getTranslations("admin.dashboardStats"),
    db
      .select({ count: sql<number>`count(*)` })
      .from(mataKuliah)
      .where(eq(mataKuliah.status, "active"))
      .then((rows) => (rows[0]?.count > 0 ? rows : db.select({ count: sql<number>`count(*)` }).from(courses))),

    Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(enrollmentTokens),
      db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(groupMembers).where(and(
        gte(groupMembers.joinedAt, todayStart),
        exists(db.select({ one: sql`1` }).from(enrollmentTokens).where(eq(enrollmentTokens.groupId, groupMembers.groupId))),
      )),
    ]),

    db.select({
      running: sql<number>`count(*) filter (where ${aiGenerationJobs.status} in ('pending', 'processing'))`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${aiGenerationJobs.status} = 'failed')`.mapWith(Number),
    }).from(aiGenerationJobs),

    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(aiQuestionBank)
      .where(eq(aiQuestionBank.reviewStatus, "generated")),

    Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(notifications)
        .where(eq(notifications.type, "admin_broadcast")),
      db.select({ count: sql<number>`count(*)` }).from(userPushTokens),
    ]),

    Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(vectorSyncQueue)
        .where(ne(vectorSyncQueue.status, "completed")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(aiUsageEvents)
        .where(gte(aiUsageEvents.createdAt, todayStart)),
    ]),

    db.select({ count: sql<number>`count(*)` }).from(blogArticles),
  ]);

  const totalCourses = courseCountRes[0]?.count ?? 0;
  const [tokensCountRes, redeemedCountRes] = tokenStatsRes;
  const totalTokens = tokensCountRes[0]?.count ?? 0;
  const redeemedTodayCount = redeemedCountRes[0]?.count ?? 0;
  const runningJobs = jobStatsRes[0]?.running ?? 0;
  const failedJobs = jobStatsRes[0]?.failed ?? 0;
  const pendingQuestions = questionStatsRes[0]?.count ?? 0;
  const totalBroadcasts = notificationStatsRes[0][0]?.count ?? 0;
  const totalDevices = notificationStatsRes[1][0]?.count ?? 0;
  const syncQueueDepth = opsStatsRes[0][0]?.count ?? 0;
  const aiRequestsToday = opsStatsRes[1][0]?.count ?? 0;
  const totalArticles = blogCountRes[0]?.count ?? 0;

  const stats: Partial<Record<string, string>> = {
    courses: t("courses", { count: totalCourses }),
    tokens: t("tokens", { total: totalTokens, today: redeemedTodayCount }),
    "bank-soal": t("questions", { count: pendingQuestions }),
    notifications: t("notifications", { total: totalBroadcasts, devices: totalDevices }),
    "ops-monitor": t("ops", { queued: syncQueueDepth, requests: aiRequestsToday }),
    blog: t("blog", { count: totalArticles }),
  };

  const categories: AdminHomeCategory[] = dashboardGroups.map((group) => ({
    name: group !== "utilitas" && group !== "utama" ? nav(ADMIN_GROUP_MESSAGE_KEYS[group]) : "",
    items: dashboardTabs.filter(item => item.group === group).map((item) => ({
      title: item.id === "discussions" ? schedule("discussion") : nav(ADMIN_TAB_MESSAGE_KEYS[item.id]),
      iconKey: item.id,
      iconColor: "text-primary",
      href: item.href,
      stat: stats[item.id] ?? null,
    })),
  }));

  return {
    failedJobs,
    kpis: {
      totalCourses: Number(totalCourses),
      pendingQuestions,
      runningJobs,
      aiRequestsToday: Number(aiRequestsToday),
    },
    categories,
  };
}
