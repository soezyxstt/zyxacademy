import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import {
  courses,
  enrollmentTokens,
  groupMembers,
  aiMaterialInstances,
  aiMaterialInstanceChunks,
  diktats,
  aiGenerationJobs,
  aiQuestionBank,
  quizTemplates,
  notifications,
  userPushTokens,
  aiUsageEvents,
  vectorSyncQueue,
  blogArticles,
} from "@/db/schema";
import { sql, eq, gte, ne } from "drizzle-orm";
import { pageTitle } from "@/lib/site";
import {
  KeyRound,
  BookText,
  Zap,
  ListChecks,
  ClipboardList,
  Archive,
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
} from "lucide-react";

import { RefreshAnalyticsButton } from "@/components/admin/refresh-analytics-button";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LayoutDashboard } from "lucide-react";

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
    materialStatsRes,
    diktatCountRes,
    jobStatsRes,
    questionStatsRes,
    quizCountRes,
    notificationStatsRes,
    opsStatsRes,
    blogCountRes,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(courses),

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

    Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(aiMaterialInstances),
      db.select({ count: sql<number>`count(*)` }).from(aiMaterialInstanceChunks),
    ]),

    db.select({ count: sql<number>`count(*)` }).from(diktats),

    db.select({ status: aiGenerationJobs.status }).from(aiGenerationJobs),

    db.select({ reviewStatus: aiQuestionBank.reviewStatus }).from(aiQuestionBank),

    db.select({ count: sql<number>`count(*)` }).from(quizTemplates),

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
  const courseStat = `${totalCourses} mata kuliah aktif`;

  const [tokensCountRes, tokensList, membersList] = tokenStatsRes;
  const totalTokens = tokensCountRes[0]?.count ?? 0;
  const tokenGroupIds = new Set(tokensList.map((t) => t.groupId));
  const tokenMembers = membersList.filter((m) => tokenGroupIds.has(m.groupId));
  const redeemedTodayCount = tokenMembers.filter(
    (m) => new Date(m.joinedAt).getTime() >= todayStartMs
  ).length;
  const tokenStat = `${totalTokens} issued, ${redeemedTodayCount} diklaim hari ini`;

  const totalMaterials = materialStatsRes[0][0]?.count ?? 0;
  const totalChunks = materialStatsRes[1][0]?.count ?? 0;
  const materialStat = `${totalMaterials} dokumen (${totalChunks} segmen)`;

  const totalDiktats = diktatCountRes[0]?.count ?? 0;
  const diktatStat = `${totalDiktats} diktat terbit`;

  const runningJobs = jobStatsRes.filter(
    (j) => j.status === "pending" || j.status === "processing"
  ).length;
  const failedJobs = jobStatsRes.filter((j) => j.status === "failed").length;
  const jobStat = `${runningJobs} running, ${failedJobs} failed`;

  const pendingQuestions = questionStatsRes.filter(
    (q) => q.reviewStatus === "generated"
  ).length;
  const questionStat = `${pendingQuestions} pending review`;

  const totalQuizzes = quizCountRes[0]?.count ?? 0;
  const quizStat = `${totalQuizzes} template aktif`;

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
          title: "Materi & Dokumen",
          icon: BookText,
          iconColor: "text-tertiary-1",
          href: "/admin/materials",
          label: "Kelola materi",
          stat: materialStat,
        },
        {
          title: "Kompilasi Diktat",
          icon: Archive,
          iconColor: "text-brand-primary",
          href: "/admin/diktats",
          label: "Buka kompilator diktat",
          stat: diktatStat,
        },
        {
          title: "Kelola Blog",
          icon: Newspaper,
          iconColor: "text-brand-primary",
          href: "/admin/blog",
          label: "Buka manajemen blog",
          stat: blogStat,
        },
      ],
    },
    {
      name: "Evaluasi & Asesmen",
      items: [
        {
          title: "Bank Soal",
          icon: ListChecks,
          iconColor: "text-status-success",
          href: "/admin/questions",
          label: "Buka bank soal",
          stat: questionStat,
        },
        {
          title: "Template Kuis",
          icon: ClipboardList,
          iconColor: "text-brand-primary",
          href: "/admin/quizzes",
          label: "Kelola kuis",
          stat: quizStat,
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

      <div className="space-y-8">
        {categories.map((category) => (
          <section key={category.name} className="space-y-4">
            <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
              <h2 className="font-heading text-h5 font-bold text-foreground">
                {category.name}
              </h2>
              <span className="text-body-xs font-semibold text-muted-foreground">
                {category.items.length} area
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm transition-all duration-200 hover:border-brand-primary/40 hover:shadow-md hover:bg-card/90"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-brand-primary/10">
                        <item.icon
                          className={`size-5 ${item.iconColor}`}
                          aria-hidden
                        />
                      </div>
                      {item.stat && (
                        <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                          {item.stat}
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <h3 className="font-heading text-body-base font-semibold text-foreground transition-colors group-hover:text-brand-primary">
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-body-xs font-semibold text-foreground group-hover:text-brand-primary transition-colors">
                    <span>{item.label}</span>
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
