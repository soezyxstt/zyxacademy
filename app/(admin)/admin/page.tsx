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
  studentQuizAttempts,
} from "@/db/schema";
import { sql, eq, gte, ne, and, exists } from "drizzle-orm";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import { LayoutDashboard } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminHomeContainer } from "@/features/admin-home/ui/admin-home-container";
import type { AdminHomeCategory } from "@/features/admin-home/model/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: pageTitle(t("metadata.homeTitle")), description: t("metadata.homeDescription") };
}

async function AdminHomeContent() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    courseCountRes,
    tokenStatsRes,
    jobStatsRes,
    questionStatsRes,
    notificationStatsRes,
    opsStatsRes,
    blogCountRes,
    attemptCountRes,
  ] = await Promise.all([
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

    db
      .select({ count: sql<number>`count(*)` })
      .from(studentQuizAttempts)
      .where(eq(studentQuizAttempts.status, "completed")),
  ]);

  const totalCourses = courseCountRes[0]?.count ?? 0;
  const courseStat = `${totalCourses} mata kuliah aktif`;

  const [tokensCountRes, redeemedCountRes] = tokenStatsRes;
  const totalTokens = tokensCountRes[0]?.count ?? 0;
  const redeemedTodayCount = redeemedCountRes[0]?.count ?? 0;
  const tokenStat = `${totalTokens} dibuat, ${redeemedTodayCount} diklaim hari ini`;

  const runningJobs = jobStatsRes[0]?.running ?? 0;
  const failedJobs = jobStatsRes[0]?.failed ?? 0;
  const jobStat = `${runningJobs} berjalan, ${failedJobs} gagal`;

  const pendingQuestions = questionStatsRes[0]?.count ?? 0;
  const questionStat = `${pendingQuestions} menunggu tinjauan`;

  const totalAttempts = attemptCountRes[0]?.count ?? 0;
  const leaderboardStat = `${totalAttempts} pengerjaan`;

  const totalBroadcasts = notificationStatsRes[0][0]?.count ?? 0;
  const totalDevices = notificationStatsRes[1][0]?.count ?? 0;
  const notifStat = `${totalBroadcasts} siaran, ${totalDevices} perangkat`;

  const syncQueueDepth = opsStatsRes[0][0]?.count ?? 0;
  const aiRequestsToday = opsStatsRes[1][0]?.count ?? 0;
  const opsStat = `${syncQueueDepth} antrean sinkronisasi, ${aiRequestsToday} permintaan`;

  const totalArticles = blogCountRes[0]?.count ?? 0;
  const blogStat = `${totalArticles} artikel`;

  const categories: AdminHomeCategory[] = [
    {
      name: "Akademik & Konten",
      items: [
        {
          title: "Mata Kuliah",
          iconKey: "graduation-cap",
          iconColor: "text-brand-secondary",
          href: "/admin/courses",
          stat: courseStat,
        },
        {
          title: "Jadwal Umum",
          iconKey: "calendar-days",
          iconColor: "text-brand-primary",
          href: "/admin/schedules",
          stat: null,
        },
        {
          title: "Bank Soal",
          iconKey: "library",
          iconColor: "text-status-success",
          href: "/admin/questions",
          stat: questionStat,
        },
      ],
    },
    {
      name: "Evaluasi & Asesmen",
      items: [
        {
          title: "Papan Peringkat",
          iconKey: "trophy",
          iconColor: "text-brand-secondary",
          href: "/admin/leaderboard",
          stat: leaderboardStat,
        },
        {
          title: "Generasi Soal",
          iconKey: "zap",
          iconColor: "text-status-warning",
          href: "/admin/jobs",
          stat: jobStat,
        },
      ],
    },
    {
      name: "Alat & Komunikasi",
      items: [
        {
          title: "Kalkulator Harga",
          iconKey: "calculator",
          iconColor: "text-status-info",
          href: "/admin/pricing",
          stat: null,
        },
        {
          title: "Kelola Blog",
          iconKey: "newspaper",
          iconColor: "text-brand-primary",
          href: "/admin/blog",
          stat: blogStat,
        },
        {
          title: "Form Studio & Visualizer",
          iconKey: "file-text",
          iconColor: "text-brand-secondary",
          href: "/admin/forms",
          stat: null,
        },
        {
          title: "Meet",
          iconKey: "video",
          iconColor: "text-brand-primary",
          href: "/admin/meet",
          stat: null,
        },
        {
          title: "Pustaka Media",
          iconKey: "image",
          iconColor: "text-tertiary-1",
          href: "/admin/media",
          stat: null,
        },
        {
          title: "Tautan Publik",
          iconKey: "link",
          iconColor: "text-status-success",
          href: "/admin/tautan",
          stat: null,
        },
      ],
    },
    {
      name: "Akses & Keanggotaan",
      items: [
        {
          title: "Token Aktivasi Kelas",
          iconKey: "key-round",
          iconColor: "text-brand-secondary",
          href: "/admin/tokens",
          stat: tokenStat,
        },
        {
          title: "Push Notification",
          iconKey: "bell",
          iconColor: "text-tertiary-3",
          href: "/admin/notifications",
          stat: notifStat,
        },
      ],
    },
    {
      name: "Sistem & Operasional",
      items: [
        {
          title: "Monitor Ops",
          iconKey: "activity",
          iconColor: "text-status-success",
          href: "/admin/ops",
          stat: opsStat,
        },
        {
          title: "Feature Flags",
          iconKey: "flag",
          iconColor: "text-brand-primary",
          href: "/admin/ops/flags",
          stat: null,
        },
        {
          title: "API Keys",
          iconKey: "key-round",
          iconColor: "text-tertiary-1",
          href: "/admin/ops/keys",
          stat: null,
        },
        {
          title: "Short Links",
          iconKey: "link",
          iconColor: "text-brand-secondary",
          href: "/admin/ops/short-links",
          stat: null,
        },
        {
          title: "Web Analytics",
          iconKey: "line-chart",
          iconColor: "text-brand-primary",
          href: "/admin/ops/web-analytics",
          stat: null,
        },
        {
          title: "Penggunaan Fitur",
          iconKey: "mouse-pointer-click",
          iconColor: "text-status-info",
          href: "/admin/ops/feature-usage",
          stat: null,
        },
      ],
    },
  ];

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
