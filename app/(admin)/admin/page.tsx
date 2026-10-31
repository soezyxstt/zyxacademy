import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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
  studentQuizAttempts,
} from "@/db/schema";
import { sql, eq, gte, ne } from "drizzle-orm";
import { pageTitle } from "@/lib/site";
import { getTranslations } from "@/lib/i18n/server";
import {
  KeyRound,
  Zap,
  Bell,
  Activity,
  GraduationCap,
  LineChart,
  Newspaper,
  Flag,
  Video,
  FileText,
  Image,
  Link as LinkIcon,
  Trophy,
  MousePointerClick,
  CalendarDays,
  Library,
  Calculator,
  ChevronRight,
  LayoutDashboard,
} from "lucide-react";

import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: pageTitle(t("metadata.homeTitle")), description: t("metadata.homeDescription") };
}

async function AdminHomeContent() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

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
      db.select({ groupId: enrollmentTokens.groupId }).from(enrollmentTokens),
      db
        .select({
          groupId: groupMembers.groupId,
          joinedAt: groupMembers.joinedAt,
        })
        .from(groupMembers),
    ]),

    db.select({ status: aiGenerationJobs.status }).from(aiGenerationJobs),

    db.select({ reviewStatus: aiQuestionBank.reviewStatus }).from(aiQuestionBank),

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

  const [tokensCountRes, tokensList, membersList] = tokenStatsRes;
  const totalTokens = tokensCountRes[0]?.count ?? 0;
  const tokenGroupIds = new Set(tokensList.map((t) => t.groupId));
  const tokenMembers = membersList.filter((m) => tokenGroupIds.has(m.groupId));
  const redeemedTodayCount = tokenMembers.filter(
    (m) => new Date(m.joinedAt).getTime() >= todayStartMs
  ).length;
  const tokenStat = `${totalTokens} dibuat, ${redeemedTodayCount} diklaim hari ini`;

  const runningJobs = jobStatsRes.filter(
    (j) => j.status === "pending" || j.status === "processing"
  ).length;
  const failedJobs = jobStatsRes.filter((j) => j.status === "failed").length;
  const jobStat = `${runningJobs} berjalan, ${failedJobs} gagal`;

  const pendingQuestions = questionStatsRes.filter(
    (q) => q.reviewStatus === "generated"
  ).length;
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

  const categories = [
    {
      name: "Akademik & Konten",
      items: [
        {
          title: "Mata Kuliah",
          icon: GraduationCap,
          iconColor: "text-brand-secondary",
          href: "/admin/courses",

          stat: courseStat,
        },
        {
          title: "Jadwal Umum",
          icon: CalendarDays,
          iconColor: "text-brand-primary",
          href: "/admin/schedules",

          stat: null,
        },
        {
          title: "Bank Soal",
          icon: Library,
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
          icon: Trophy,
          iconColor: "text-brand-secondary",
          href: "/admin/leaderboard",

          stat: leaderboardStat,
        },
        {
          title: "Generasi Soal",
          icon: Zap,
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
          icon: Calculator,
          iconColor: "text-status-info",
          href: "/admin/pricing",

          stat: null,
        },
        {
          title: "Kelola Blog",
          icon: Newspaper,
          iconColor: "text-brand-primary",
          href: "/admin/blog",

          stat: blogStat,
        },
        {
          title: "Form Studio & Visualizer",
          icon: FileText,
          iconColor: "text-brand-secondary",
          href: "/admin/forms",

          stat: null,
        },
        {
          title: "Meet",
          icon: Video,
          iconColor: "text-brand-primary",
          href: "/admin/meet",

          stat: null,
        },
        {
          title: "Pustaka Media",
          icon: Image,
          iconColor: "text-tertiary-1",
          href: "/admin/media",

          stat: null,
        },
        {
          title: "Tautan Publik",
          icon: LinkIcon,
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
          icon: KeyRound,
          iconColor: "text-brand-secondary",
          href: "/admin/tokens",

          stat: tokenStat,
        },
        {
          title: "Push Notification",
          icon: Bell,
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
          icon: Activity,
          iconColor: "text-status-success",
          href: "/admin/ops",

          stat: opsStat,
        },
        {
          title: "Feature Flags",
          icon: Flag,
          iconColor: "text-brand-primary",
          href: "/admin/ops/flags",

          stat: null,
        },
        {
          title: "API Keys",
          icon: KeyRound,
          iconColor: "text-tertiary-1",
          href: "/admin/ops/keys",

          stat: null,
        },
        {
          title: "Short Links",
          icon: LinkIcon,
          iconColor: "text-brand-secondary",
          href: "/admin/ops/short-links",

          stat: null,
        },
        {
          title: "Web Analytics",
          icon: LineChart,
          iconColor: "text-brand-primary",
          href: "/admin/ops/web-analytics",

          stat: null,
        },
        {
          title: "Penggunaan Fitur",
          icon: MousePointerClick,
          iconColor: "text-status-info",
          href: "/admin/ops/feature-usage",

          stat: null,
        },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Admin"
        actions={<RefreshAnalyticsButton />}
      />

      {failedJobs > 0 && (
        <Alert variant="destructive">
          <Zap className="size-4" aria-hidden />
          <AlertTitle>{failedJobs} generasi soal gagal</AlertTitle>
          <AlertDescription>
            <Link href="/admin/jobs" className="underline underline-offset-4">Tinjau generasi</Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="columns-1 gap-4 lg:columns-2 xl:columns-3">
        {categories.map((category) => (
          <Card key={category.name} variant="solid" className="mb-4 inline-block w-full overflow-hidden align-top shadow-none">
            <CardHeader className="border-b border-border/60 px-5 py-4">
              <CardTitle>{category.name}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border/60 px-0 pb-0">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex min-w-0 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                    <item.icon className={`size-4 ${item.iconColor}`} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-body-sm font-semibold text-foreground group-hover:text-primary">
                      {item.title}
                    </span>
                    {item.stat && <span className="mt-0.5 block text-body-xs text-muted-foreground">{item.stat}</span>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AdminHomeLoading() {
  return (
    <div role="status" aria-label="Memuat" className="space-y-5">
      <AdminPageHeader icon={LayoutDashboard} title="Admin" actions={<Skeleton className="h-9 w-32" />} />
      <div className="columns-1 gap-4 lg:columns-2 xl:columns-3">
        {[3, 2, 6, 2, 6].map((rows, section) => (
          <div key={section} className="mb-4 inline-block w-full overflow-hidden rounded-xl border border-border bg-card align-top">
            <div className="border-b border-border/60 px-5 py-4"><Skeleton className="h-5 w-40" /></div>
            <div className="divide-y divide-border/60">
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-3 px-5 py-3">
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
