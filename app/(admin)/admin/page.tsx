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
  Layers,
  Package,
  ShieldCheck,
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
      name: "Media & Alat",
      items: [
        {
          title: "Meet",
          description:
            "Buat dan akhiri ruang meeting Pro, lihat status live, serta pantau log kehadiran peserta, rekaman, dan transkrip.",
          icon: Video,
          iconColor: "text-brand-primary",
          href: "/admin/meet",
          label: "Buka studio temu",
          stat: null,
        },
        {
          title: "Form Studio & Visualizer",
          description:
            "Rancang survei, kuis, dan pendaftaran mandiri dengan 12 tipe soal, short link, dan visualisasi data real-time.",
          icon: FileText,
          iconColor: "text-brand-secondary",
          href: "/admin/forms",
          label: "Buka Form Studio",
          stat: null,
        },
        {
          title: "Media",
          description:
            "Unggah, rapikan, dan kelola file penting seperti logo dan aset lain di pustaka media bersama, plus browser read-only seluruh storage R2.",
          icon: Image,
          iconColor: "text-tertiary-1",
          href: "/admin/media",
          label: "Buka pustaka media",
          stat: null,
        },
        {
          title: "Tautan",
          description:
            "Simpan dan atur tautan penting yang sering digunakan tim Zyx dalam satu tempat.",
          icon: LinkIcon,
          iconColor: "text-status-success",
          href: "/admin/tautan",
          label: "Buka daftar tautan",
          stat: null,
        },
      ],
    },
    {
      name: "Konten & Publikasi",
      items: [
        {
          title: "Kelola Blog",
          description:
            "Tulis, edit, dan publikasikan artikel, berita, dan tips untuk Zyx Blog.",
          icon: Newspaper,
          iconColor: "text-brand-primary",
          href: "/admin/blog",
          label: "Buka manajemen blog",
          stat: blogStat,
        },
        {
          title: "Mata Kuliah",
          description:
            "Kelola kurikulum, tambah kelas baru, dan edit info mata kuliah Zyx Academy.",
          icon: GraduationCap,
          iconColor: "text-brand-secondary",
          href: "/admin/courses",
          label: "Kelola mata kuliah",
          stat: courseStat,
        },
        {
          title: "Idea Bundle",
          description:
            "Validasi, staging, review, dan publikasi bundle Idea berbasis ZIP dengan audit dan outbox.",
          icon: Layers,
          iconColor: "text-brand-primary",
          href: "/admin/bundles/idea",
          label: "Kelola Idea Bundle",
          stat: null,
        },
        {
          title: "Product Bundle",
          description: "Validasi, preview, review, dan publikasi produk artikel, diktat, soal, solusi, flashcard, dan asesmen.",
          icon: Package,
          iconColor: "text-brand-secondary",
          href: "/admin/bundles/product",
          label: "Kelola Product Bundle",
          stat: null,
        },
        {
          title: "Authoring eksternal",
          description:
            "Siapkan pekerjaan agent dari Source Pack, lalu ekspor konteks Ideas resmi untuk penulisan produk.",
          icon: ShieldCheck,
          iconColor: "text-status-success",
          href: "/admin/authoring-context",
          label: "Siapkan authoring",
          stat: null,
        },
        {
          title: "Materi",
          description:
            "Proses dan segmentasikan dokumen materi kuliah ke dalam basis pengetahuan untuk generasi soal.",
          icon: BookText,
          iconColor: "text-tertiary-1",
          href: "/admin/ai/materials",
          label: "Kelola materi",
          stat: materialStat,
        },
        {
          title: "Kompilasi Diktat",
          description:
            "Gabungkan materi bab dan objek pengetahuan menjadi buku ajar PDF siap unduh.",
          icon: Archive,
          iconColor: "text-brand-primary",
          href: "/admin/ai/diktats",
          label: "Buka kompilator diktat",
          stat: diktatStat,
        },
      ],
    },
    {
      name: "Evaluasi & Asesmen",
      items: [
        {
          title: "Generasi Soal",
          description:
            "Jalankan pipeline generasi soal otomatis berbasis LLM dan pantau status job.",
          icon: Zap,
          iconColor: "text-status-warning",
          href: "/admin/ai/jobs",
          label: "Lihat job generasi",
          stat: jobStat,
        },
        {
          title: "Bank Soal",
          description:
            "Tinjau, edit, setujui, dan publikasikan soal latihan hasil generasi sistem.",
          icon: ListChecks,
          iconColor: "text-status-success",
          href: "/admin/ai/questions",
          label: "Buka bank soal",
          stat: questionStat,
        },
        {
          title: "Template Kuis",
          description:
            "Buat template kuis baru dengan aturan seleksi materi dan tingkat kesulitan.",
          icon: ClipboardList,
          iconColor: "text-brand-primary",
          href: "/admin/ai/quizzes",
          label: "Kelola kuis",
          stat: quizStat,
        },
      ],
    },
    {
      name: "Akses & Keanggotaan",
      items: [
        {
          title: "Token Aktivasi Kelas",
          description:
            "Buat dan distribusikan token pendaftaran semester sekali pakai untuk mahasiswa.",
          icon: KeyRound,
          iconColor: "text-brand-secondary",
          href: "/admin/tokens",
          label: "Kelola token",
          stat: tokenStat,
        },
      ],
    },
    {
      name: "Sistem & Operasional",
      items: [
        {
          title: "Push Notification",
          description:
            "Kirim pesan siaran notifikasi push ke seluruh siswa atau kelas tertentu.",
          icon: Bell,
          iconColor: "text-tertiary-3",
          href: "/admin/notifications",
          label: "Kelola notifikasi",
          stat: notifStat,
        },
        {
          title: "Key Diagnostics",
          description:
            "Lihat status, kuota RPD, dan kesehatan tiap API key secara real-time.",
          icon: KeyRound,
          iconColor: "text-tertiary-1",
          href: "/admin/ops/keys",
          label: "Lihat key diagnostics",
          stat: null,
        },
        {
          title: "Web Analytics",
          description:
            "Pantau wawasan lalu lintas pengunjung Zyx Academy secara live (GA4).",
          icon: LineChart,
          iconColor: "text-brand-primary",
          href: "/admin/ops/web-analytics",
          label: "Buka web analytics",
          stat: null,
        },
        {
          title: "Feature Flags",
          description:
            "Pantau status keaktifan dan konfigurasi seluruh feature flag (FEATURE_*) sistem.",
          icon: Flag,
          iconColor: "text-brand-primary",
          href: "/admin/ops/flags",
          label: "Buka feature flags",
          stat: null,
        },
        {
          title: "Ops",
          description:
            "Pantau penggunaan API harian, kuota KV write, serta performa sistem.",
          icon: Activity,
          iconColor: "text-status-success",
          href: "/admin/ops",
          label: "Buka monitor ops",
          stat: opsStat,
        },
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Admin Panel"
        description="Statistik operasional langsung dan pengaturan situs Zyx Academy."
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
          <section key={category.name} className="space-y-3">
            <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
              <h2 className="font-heading text-h5 font-bold text-foreground">
                {category.name}
              </h2>
              <span className="text-body-xs font-semibold text-muted-foreground">
                {category.items.length} area
              </span>
            </div>
            <div className="divide-y divide-border">
              {category.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group grid gap-4 py-4 transition-colors duration-150 hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background">
                      <item.icon
                        className={`size-5 ${item.iconColor}`}
                        aria-hidden
                      />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading text-h6 font-semibold text-foreground transition-colors group-hover:text-brand-primary">
                          {item.title}
                        </h3>
                        {item.stat && (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-body-xs font-semibold text-muted-foreground">
                            {item.stat}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 max-w-3xl text-body-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex w-fit items-center justify-center rounded-lg border border-border bg-background px-3 py-2 text-body-sm font-semibold text-foreground transition-colors group-hover:border-brand-primary/35 group-hover:text-brand-primary">
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
