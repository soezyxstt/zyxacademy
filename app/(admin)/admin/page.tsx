import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { LayoutDashboard } from "lucide-react";

import {
  ALL_ADMIN_TABS,
  ADMIN_TAB_MESSAGE_KEYS,
  DEFAULT_ARCHIVED,
  ADMIN_GROUP_MESSAGE_KEYS,
} from "@/lib/admin-navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminHomeContainer } from "@/features/admin-home/ui/admin-home-container";
import type { AdminHomeCategory } from "@/features/admin-home/model/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const metadataText = await getTranslations("admin");
  return { title: pageTitle(metadataText("metadata.homeTitle")), description: metadataText("metadata.homeDescription") };
}

const dashboardTabs = ALL_ADMIN_TABS.filter(tab => tab.id !== "dashboard" && !DEFAULT_ARCHIVED.includes(tab.id));
const dashboardGroups = [...new Set(dashboardTabs.map(tab => tab.group))];

async function AdminHomeContent() {
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

  return (
    <AdminHomeContainer
      failedJobs={failedJobs}
      kpis={{
        totalCourses,
        pendingQuestions,
        runningJobs,
        aiRequestsToday,
      }}
      categories={categories}
    />
  );
}

function AdminHomeLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-5">
      <AdminPageHeader icon={LayoutDashboard} title="Admin" actions={<Skeleton className="size-9" />} />
      <div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
        {[3, 2, 6, 2, 6].map((rows, section) => (
          <div key={section} className="mb-5 inline-block w-full align-top">
            <div className="border-b border-border pb-2"><Skeleton className="h-5 w-40" /></div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-3 py-2.5">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-4 w-36 max-w-full" /><Skeleton className="h-3 w-24" /></div>
                  <Skeleton className="size-4 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminHomePage() {
  return <Suspense fallback={<AdminHomeLoading />}><AdminHomeContent /></Suspense>;
}
