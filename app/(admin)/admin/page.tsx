import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
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
import { ChevronRight, LayoutDashboard, Zap } from "lucide-react";
import { ALL_ADMIN_TABS, ADMIN_TAB_MESSAGE_KEYS, DEFAULT_ARCHIVED, ADMIN_GROUP_MESSAGE_KEYS } from "@/lib/admin-navigation";

import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const metadataText = await getTranslations("admin");
  return { title: pageTitle(metadataText("metadata.homeTitle")), description: metadataText("metadata.homeDescription") };
}

const dashboardTabs = ALL_ADMIN_TABS.filter(tab => tab.id !== "dashboard" && !DEFAULT_ARCHIVED.includes(tab.id));
const dashboardGroups = [...new Set(dashboardTabs.map(tab => tab.group))];

export default async function AdminHomePage() {
  const [nav, schedule, t] = await Promise.all([
    getTranslations("admin.navigation"),
    getTranslations("tutor.schedule"),
    getTranslations("admin.dashboardStats"),
  ]);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const courseStat = db
    .select({ count: sql<number>`count(*)` })
    .from(mataKuliah)
    .where(eq(mataKuliah.status, "active"))
    .then((rows) => (rows[0]?.count > 0 ? rows : db.select({ count: sql<number>`count(*)` }).from(courses)))
    .then(rows => t("courses", { count: rows[0]?.count ?? 0 }));

  const tokenStat = Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(enrollmentTokens),
    db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(groupMembers).where(and(
      gte(groupMembers.joinedAt, todayStart),
      exists(db.select({ one: sql`1` }).from(enrollmentTokens).where(eq(enrollmentTokens.groupId, groupMembers.groupId))),
    )),
  ]).then(([tokens, redeemed]) => t("tokens", { total: tokens[0]?.count ?? 0, today: redeemed[0]?.count ?? 0 }));

  const failedJobs = db.select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(aiGenerationJobs)
    .where(eq(aiGenerationJobs.status, "failed"))
    .then(rows => rows[0]?.count ?? 0);

  const questionStat = db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(aiQuestionBank)
    .where(eq(aiQuestionBank.reviewStatus, "generated")).then(rows => t("questions", { count: rows[0]?.count ?? 0 }));

  const notifStat = Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(eq(notifications.type, "admin_broadcast")),
    db.select({ count: sql<number>`count(*)` }).from(userPushTokens),
  ]).then(([broadcasts, devices]) => t("notifications", { total: broadcasts[0]?.count ?? 0, devices: devices[0]?.count ?? 0 }));

  const opsStat = Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(vectorSyncQueue)
      .where(ne(vectorSyncQueue.status, "completed")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(aiUsageEvents)
      .where(gte(aiUsageEvents.createdAt, todayStart)),
  ]).then(([queue, requests]) => t("ops", { queued: queue[0]?.count ?? 0, requests: requests[0]?.count ?? 0 }));

  const blogStat = db.select({ count: sql<number>`count(*)` }).from(blogArticles).then(rows => t("blog", { count: rows[0]?.count ?? 0 }));

  const stats: Partial<Record<string, Promise<string>>> = {
    courses: courseStat,
    tokens: tokenStat,
    "bank-soal": questionStat,
    notifications: notifStat,
    "ops-monitor": opsStat,
    blog: blogStat,
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Admin"
        actions={<RefreshAnalyticsButton />}
      />

      <Suspense fallback={null}><FailedJobs count={failedJobs} /></Suspense>

      <div className="columns-1 gap-6 lg:columns-2 xl:columns-3">
        {dashboardGroups.map(group => (
          <section key={group} className="mb-5 inline-block w-full align-top">
            {group !== "utilitas" && group !== "utama" && <h2 className="border-b border-border pb-2 font-heading text-body-base font-bold">
              {nav(ADMIN_GROUP_MESSAGE_KEYS[group])}
            </h2>}
            <div className="divide-y divide-border/60">
              {dashboardTabs.filter(item => item.group === group).map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-w-0 items-center gap-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                    <item.icon className="size-4 text-primary" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-body-sm font-semibold text-foreground group-hover:text-primary">
                      {item.id === "discussions" ? schedule("discussion") : nav(ADMIN_TAB_MESSAGE_KEYS[item.id])}
                    </span>
                    {stats[item.id] && (
                      <span className="mt-0.5 block text-body-xs text-muted-foreground">
                        <Suspense fallback={<span aria-hidden className="inline-block h-3 w-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />}>
                          {stats[item.id]}
                        </Suspense>
                      </span>
                    )}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

async function FailedJobs({ count }: { count: Promise<number> }) {
  const [failedJobs, t] = await Promise.all([count, getTranslations("admin.dashboardStats")]);
  return failedJobs > 0 ? (
    <Alert variant="destructive">
      <Zap className="size-4" aria-hidden />
      <AlertTitle>{t("failed", { count: failedJobs })}</AlertTitle>
      <AlertDescription>
        <Link href="/admin/jobs" className="underline underline-offset-4">{t("review")}</Link>
      </AlertDescription>
    </Alert>
  ) : null;
}
