import type { Metadata } from "next";
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

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Admin"),
  description: "Panel admin Zyx Academy.",
};

export default async function AdminHomePage() {
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
  const tokenStat = `${totalTokens} issued, ${redeemedTodayCount} diklaim hari ini`;

  const runningJobs = jobStatsRes.filter(
    (j) => j.status === "pending" || j.status === "processing"
  ).length;
  const failedJobs = jobStatsRes.filter((j) => j.status === "failed").length;
  const jobStat = `${runningJobs} running, ${failedJobs} failed`;

  const pendingQuestions = questionStatsRes.filter(
    (q) => q.reviewStatus === "generated"
  ).length;
  const questionStat = `${pendingQuestions} pending review`;

  const totalAttempts = attemptCountRes[0]?.count ?? 0;
  const leaderboardStat = `${totalAttempts} pengerjaan`;

  const totalBroadcasts = notificationStatsRes[0][0]?.count ?? 0;
  const totalDevices = notificationStatsRes[1][0]?.count ?? 0;
  const notifStat = `${totalBroadcasts} siaran, ${totalDevices} device`;

  const syncQueueDepth = opsStatsRes[0][0]?.count ?? 0;
  const aiRequestsToday = opsStatsRes[1][0]?.count ?? 0;
  const opsStat = `${syncQueueDepth} sync job, ${aiRequestsToday} req`;

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
          label: "Kelola mata kuliah",
          stat: courseStat,
        },
        {
          title: "Jadwal Umum",
          icon: CalendarDays,
          iconColor: "text-brand-primary",
          href: "/admin/schedules",
          label: "Kelola jadwal umum",
          stat: null,
        },
        {
          title: "Bank Soal",
          icon: Library,
          iconColor: "text-status-success",
          href: "/admin/questions",
          label: "Buka bank soal",
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
          label: "Buka papan peringkat",
          stat: leaderboardStat,
        },
        {
          title: "Generasi Soal",
          icon: Zap,
          iconColor: "text-status-warning",
          href: "/admin/jobs",
          label: "Lihat job generasi",
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
          label: "Hitung paket custom",
          stat: null,
        },
        {
          title: "Kelola Blog",
          icon: Newspaper,
          iconColor: "text-brand-primary",
          href: "/admin/blog",
          label: "Buka manajemen blog",
          stat: blogStat,
        },
        {
          title: "Form Studio & Visualizer",
          icon: FileText,
          iconColor: "text-brand-secondary",
          href: "/admin/forms",
          label: "Buka Form Studio",
          stat: null,
        },
        {
          title: "Meet",
          icon: Video,
          iconColor: "text-brand-primary",
          href: "/admin/meet",
          label: "Buka studio temu",
          stat: null,
        },
        {
          title: "Pustaka Media",
          icon: Image,
          iconColor: "text-tertiary-1",
          href: "/admin/media",
          label: "Buka pustaka media",
          stat: null,
        },
        {
          title: "Tautan Publik",
          icon: LinkIcon,
          iconColor: "text-status-success",
          href: "/admin/tautan",
          label: "Buka daftar tautan",
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
          label: "Kelola token",
          stat: tokenStat,
        },
        {
          title: "Push Notification",
          icon: Bell,
          iconColor: "text-tertiary-3",
          href: "/admin/notifications",
          label: "Kelola notifikasi",
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
          label: "Buka monitor ops",
          stat: opsStat,
        },
        {
          title: "Feature Flags",
          icon: Flag,
          iconColor: "text-brand-primary",
          href: "/admin/ops/flags",
          label: "Buka feature flags",
          stat: null,
        },
        {
          title: "API Keys",
          icon: KeyRound,
          iconColor: "text-tertiary-1",
          href: "/admin/ops/keys",
          label: "Lihat API keys",
          stat: null,
        },
        {
          title: "Short Links",
          icon: LinkIcon,
          iconColor: "text-brand-secondary",
          href: "/admin/ops/short-links",
          label: "Buka short links",
          stat: null,
        },
        {
          title: "Web Analytics",
          icon: LineChart,
          iconColor: "text-brand-primary",
          href: "/admin/ops/web-analytics",
          label: "Buka web analytics",
          stat: null,
        },
        {
          title: "Penggunaan Fitur",
          icon: MousePointerClick,
          iconColor: "text-status-info",
          href: "/admin/ops/feature-usage",
          label: "Lihat aktivitas fitur murid",
          stat: null,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Admin Panel"
        actions={<RefreshAnalyticsButton />}
      />

      {failedJobs > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-status-error/20 bg-status-error/5 p-4 text-body-sm text-status-error">
          <Zap className="size-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Perhatian: Generasi Soal Gagal</p>
            <p className="text-muted-foreground mt-0.5">
              Terdapat {failedJobs} pipeline generasi soal yang gagal. Silakan
              tinjau status di menu Generasi Soal.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 items-start">
        {[
          categories.filter((c) => ["Akademik & Konten", "Evaluasi & Asesmen", "Akses & Keanggotaan"].includes(c.name)),
          categories.filter((c) => c.name === "Alat & Komunikasi"),
          categories.filter((c) => c.name === "Sistem & Operasional"),
        ].map((group, colIdx) => (
          <div key={colIdx} className="space-y-8">
            {group.map((category) => (
              <section key={category.name} className="space-y-1">
                <div className="flex items-center justify-between gap-4 border-b border-border/50 pb-2">
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {category.name}
                  </h2>
                  <span className="text-body-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {category.items.length} area
                  </span>
                </div>

                <div className="divide-y divide-border/30">
                  {category.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="group flex items-center justify-between gap-3 px-2 py-2.5 rounded-lg transition-colors hover:bg-muted/50 -mx-1"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-7.5 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-brand-primary/10">
                          <item.icon className={`size-3.5 ${item.iconColor}`} aria-hidden />
                        </div>
                        <div className="min-w-0">
                          <span className="font-heading text-body-sm font-semibold text-foreground group-hover:text-brand-primary transition-colors truncate block">
                            {item.title}
                          </span>
                          <span className="text-body-xs text-muted-foreground truncate block">
                            {item.label}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.stat && (
                          <span className="rounded-md bg-muted/70 px-2 py-0.5 text-body-xs font-medium text-muted-foreground">
                            {item.stat}
                          </span>
                        )}
                        <ChevronRight className="size-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
