import {
 getExamsForCourse,
 getMaterialsForCourse,
 listCourses,
 type ExamFixture,
 type QuestionSpec,
} from "@/lib/student-course-fixtures";

/** Single row in the site-wide command palette index (Fuse + cmdk). */
export type SiteSearchDocument = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  group:
    | "Halaman"
    | "Course"
    | "Materi"
    | "Evaluasi"
    | "Topik & landing"
    | "Course & Modul"
    | "Materi & Artikel"
    | "Kuis & Evaluasi"
    | "Navigasi"
    | "Administrasi"
    | string;
  /** Extra tokens: synonyms, tags, route segments */
  keywords: string;
  /** Long-form text matched deeply (blurbs, article bodies, prompts, options) */
  content: string;
};

export const STATIC_PAGES: Omit<SiteSearchDocument, "id">[] = [
  // Halaman Publik & Umum
  {
    title: "Beranda",
    subtitle: "Landing",
    href: "/",
    group: "Halaman",
    keywords: "home utama zyx academy landing",
    content: "Program tutorial online kalkulus fisika kimia aljabar linear persiapan kuliah",
  },
  {
    title: "Katalog course",
    subtitle: "Courses",
    href: "/courses",
    group: "Halaman",
    keywords: "katalog materi enrolled paket bidang kurikulum silabus",
    content: "Daftar course TPB kalkulus fisika kimia preview enrollment",
  },
  {
    title: "Paket & harga",
    subtitle: "Plans",
    href: "/plans",
    group: "Halaman",
    keywords: "langganan subscription pricing paket belajar biaya",
    content: "Lihat paket harga membership akses course tutorial",
  },
  {
    title: "Tentang kami",
    subtitle: "About",
    href: "/about",
    group: "Halaman",
    keywords: "tim visi misi profil zyx",
    content: "Informasi platform tutorial akademik Zyx Academy",
  },
  {
    title: "Testimoni",
    subtitle: "Social proof",
    href: "/testimonial",
    group: "Halaman",
    keywords: "review pengalaman siswa cerita alumni",
    content: "Cerita pengguna testimoni mahasiswa",
  },
  {
    title: "Artikel & blog",
    subtitle: "Blog",
    href: "/blog",
    group: "Halaman",
    keywords: "artikel tips trik materi wawasan edukasi blog",
    content: "Kumpulan artikel edukasi dan panduan belajar",
  },
  {
    title: "Masuk",
    subtitle: "Akun",
    href: "/sign-in",
    group: "Halaman",
    keywords: "login sign in oauth google autentikasi",
    content: "Autentikasi masuk dashboard Zyx",
  },
  {
    title: "Daftar",
    subtitle: "Akun baru",
    href: "/sign-up",
    group: "Halaman",
    keywords: "register buat akun pendaftaran pengguna",
    content: "Pendaftaran akun pengguna baru Zyx",
  },
  {
    title: "Keluar",
    subtitle: "Sesi",
    href: "/sign-out",
    group: "Halaman",
    keywords: "logout sign out akhiri sesi",
    content: "Keluar dari akun",
  },

  // Student Dashboard & Fitur Murid
  {
    title: "Dashboard",
    subtitle: "Ringkasan belajar",
    href: "/dashboard",
    group: "Halaman",
    keywords: "progres streak materi berikutnya dashboard murid",
    content: "Ringkasan progres belajar aktivitas dan streak harian",
  },
  {
    title: "Jadwal & sesi belajar",
    subtitle: "Jadwal murid",
    href: "/dashboard/schedule",
    group: "Halaman",
    keywords: "jadwal sesi booking tutor kalender kelas pertemuan",
    content: "Jadwal sesi belajar live dan booking dengan tutor",
  },
  {
    title: "Kelompok belajar murid",
    subtitle: "Grup belajar",
    href: "/dashboard/groups",
    group: "Halaman",
    keywords: "kelompok belajar grup group kuota sesi teman",
    content: "Daftar kelompok belajar dan pemakaian kuota sesi",
  },
  {
    title: "Papan peringkat",
    subtitle: "Murid · Leaderboard",
    href: "/leaderboard",
    group: "Halaman",
    keywords: "leaderboard ranking peringkat skor poin trophy juara",
    content: "Papan peringkat nilai dan keaktifan belajar siswa",
  },
  {
    title: "Kalender akademik",
    subtitle: "Kalender",
    href: "/calendar",
    group: "Halaman",
    keywords: "kalender jadwal event deadline timeline perkuliahan",
    content: "Kalender aktivitas akademik dan agenda belajar",
  },
  {
    title: "Refleksi belajar",
    subtitle: "Refleksi",
    href: "/profile/reflections",
    group: "Halaman",
    keywords: "refleksi catatan evaluasi diri evaluasi belajar jurnal",
    content: "Catatan refleksi dan evaluasi diri belajar murid",
  },
  {
    title: "Profil pengguna",
    subtitle: "Akun",
    href: "/profile",
    group: "Halaman",
    keywords: "biodata nama email akun institusi profil",
    content: "Pengaturan profil dan identitas pengguna",
  },
  {
    title: "Pengaturan akun",
    subtitle: "Settings",
    href: "/settings",
    group: "Halaman",
    keywords: "profil preferensi tema notifikasi password pengaturan",
    content: "Setelan akun aplikasi dan preferensi notifikasi",
  },
  {
    title: "Umpan balik",
    subtitle: "Feedback",
    href: "/feedback",
    group: "Halaman",
    keywords: "saran bug laporan masukan kritik umpan balik",
    content: "Kirim umpan balik dan laporan masalah ke tim Zyx",
  },

  // Program Tutorial PKA (Murid)
  {
    title: "Tutorial PKA",
    subtitle: "Program PKA",
    href: "/courses/tutorial-pka",
    group: "Halaman",
    keywords: "tutorial pka pka itb persiapan kuliah",
    content: "Program tutorial intensif Tutorial PKA ITB",
  },
  {
    title: "Pendaftaran PKA",
    subtitle: "PKA",
    href: "/courses/tutorial-pka/daftar",
    group: "Halaman",
    keywords: "daftar pka registrasi tutorial pka",
    content: "Formulir pendaftaran kelas Tutorial PKA",
  },
  {
    title: "Jadwal Tutorial PKA",
    subtitle: "PKA",
    href: "/courses/tutorial-pka/jadwal",
    group: "Halaman",
    keywords: "jadwal pka sesi live tutor",
    content: "Jadwal pelaksanaan sesi tutorial Tutorial PKA",
  },
  {
    title: "Laporan diagnostik PKA",
    subtitle: "PKA",
    href: "/courses/tutorial-pka/laporan",
    group: "Halaman",
    keywords: "laporan diagnostik nilai evaluasi pka",
    content: "Laporan hasil evaluasi dan diagnostik belajar PKA",
  },
  {
    title: "Simulasi ujian PKA",
    subtitle: "PKA",
    href: "/courses/tutorial-pka/simulasi",
    group: "Halaman",
    keywords: "simulasi ujian tryout pka latihan soal",
    content: "Simulasi pengerjaan ujian dan tryout PKA",
  },

  // Tutor Surface
  {
    title: "Dashboard tutor",
    subtitle: "Tutor",
    href: "/tutor",
    group: "Halaman",
    keywords: "dashboard tutor pengajar guru kelas jadwal mengajar",
    content: "Panel kerja tutor untuk monitoring kelas dan penilaian",
  },

  // Admin Panels - Menu Utama & Akademik
  {
    title: "Panel admin",
    subtitle: "Admin",
    href: "/admin",
    group: "Halaman",
    keywords: "dashboard administrator ringkasan admin",
    content: "Ringkasan metrik administrasi pengguna dan sistem",
  },
  {
    title: "Kelola mata kuliah",
    subtitle: "Admin",
    href: "/admin/courses",
    group: "Halaman",
    keywords: "admin courses mata kuliah silabus modul bab edit",
    content: "Manajemen katalog mata kuliah, silabus, dan modul",
  },
  {
    title: "Jadwal & kalender akademik",
    subtitle: "Admin",
    href: "/admin/schedules",
    group: "Halaman",
    keywords: "jadwal kalender uts uas akademik admin events",
    content: "Manajemen jadwal akademik, timeline ujian, dan event",
  },
  {
    title: "Kelompok belajar admin",
    subtitle: "Admin",
    href: "/admin/groups",
    group: "Halaman",
    keywords: "kelompok belajar grup group study group kuota admin",
    content: "Manajemen kelompok belajar siswa, paket, dan alokasi sesi",
  },
  {
    title: "Token aktivasi & voucher",
    subtitle: "Admin",
    href: "/admin/tokens",
    group: "Halaman",
    keywords: "token pendaftaran aktivasi voucher kupon admin",
    content: "Pembuatan dan manajemen token pendaftaran dan aktivasi kelas",
  },
  {
    title: "Bank soal",
    subtitle: "Admin",
    href: "/admin/questions",
    group: "Halaman",
    keywords: "bank soal list filter edit approve kurasi butir soal",
    content: "Kurasi, edit, setujui dan publikasikan bank soal kecerdasan buatan",
  },
  {
    title: "Generasi soal otomatis",
    subtitle: "Admin",
    href: "/admin/jobs",
    group: "Halaman",
    keywords: "generasi soal queue job gemini inngest otomatis ai",
    content: "Pantau antrean job kompilasi dan generasi soal kecerdasan buatan",
  },
  {
    title: "Analitik distraktor",
    subtitle: "Admin",
    href: "/admin/distractors",
    group: "Halaman",
    keywords: "distraktor pilihan ganda opsi jebakan analisis butir",
    content: "Analisis efektivitas opsi pengecoh pada butir soal kuis",
  },

  // Admin Panels - Alat, Komunikasi & Media
  {
    title: "Form studio",
    subtitle: "Admin",
    href: "/admin/forms",
    group: "Halaman",
    keywords: "form studio kustom kuesioner pendaftaran survei pembuat form",
    content: "Pembuatan formulir pendaftaran dinamis dan survei",
  },
  {
    title: "Google Meet manager",
    subtitle: "Admin",
    href: "/admin/meet",
    group: "Halaman",
    keywords: "google meet video call ruang virtual live meeting admin",
    content: "Manajemen ruang pertemuan virtual dan sesi Google Meet",
  },
  {
    title: "Pustaka media",
    subtitle: "Admin",
    href: "/admin/media",
    group: "Halaman",
    keywords: "pustaka media galeri gambar aset upload cloudflare r2",
    content: "Manajemen penyimpanan media dan aset visual platform",
  },
  {
    title: "Tautan publik",
    subtitle: "Admin",
    href: "/admin/tautan",
    group: "Halaman",
    keywords: "tautan publik link tree link sharing daftar link",
    content: "Pengaturan halaman tautan publik Zyx Academy",
  },
  {
    title: "Push notifikasi",
    subtitle: "Admin",
    href: "/admin/notifications",
    group: "Halaman",
    keywords: "push notifikasi broadcast kirim pesan pengumuman",
    content: "Kirim pesan dan pengumuman siaran langsung ke pengguna",
  },
  {
    title: "Kelola blog admin",
    subtitle: "Admin",
    href: "/admin/blog",
    group: "Halaman",
    keywords: "kelola blog tulis artikel publikasi markdown",
    content: "Pembuatan dan penyuntingan artikel blog publik",
  },

  // Admin Panels - Ops, Bundles & Pengaturan Sistem
  {
    title: "Monitor ops & status sistem",
    subtitle: "Admin",
    href: "/admin/ops",
    group: "Halaman",
    keywords: "monitor ops status server healthcheck database antrean",
    content: "Monitoring operasional kesehatan sistem dan infrastruktur",
  },
  {
    title: "Feature flags",
    subtitle: "Admin",
    href: "/admin/ops/flags",
    group: "Halaman",
    keywords: "feature flags sakelar fitur rollout toggle",
    content: "Pengaturan sakelar fitur eksperimental dan rollout pengguna",
  },
  {
    title: "Analitik AI Zyra",
    subtitle: "Admin",
    href: "/admin/ops/analytics",
    group: "Halaman",
    keywords: "analitik zyra ai token usage quota gemini statistik tutor",
    content: "Statistik penggunaan token model kecerdasan buatan Zyra",
  },
  {
    title: "API keys & diagnostics",
    subtitle: "Admin",
    href: "/admin/ops/keys",
    group: "Halaman",
    keywords: "api keys gemini pool rotasi kuota diagnostik",
    content: "Status diagnostik pool kunci API Gemini dan kuota",
  },
  {
    title: "Short links manager",
    subtitle: "Admin",
    href: "/admin/ops/short-links",
    group: "Halaman",
    keywords: "short links pemendek tautan redirect url",
    content: "Manajemen pemendek tautan URL internal",
  },
  {
    title: "Web analytics",
    subtitle: "Admin",
    href: "/admin/ops/web-analytics",
    group: "Halaman",
    keywords: "web analytics pengunjung traffic pageviews statistik situs",
    content: "Statistik kunjungan dan interaksi pengguna website",
  },
  {
    title: "Idea bundles",
    subtitle: "Admin",
    href: "/admin/bundles/idea",
    group: "Halaman",
    keywords: "idea bundles kurasi materi paket ide staging",
    content: "Manajemen paket konsep kurikulum Idea Bundle",
  },
  {
    title: "Product bundles",
    subtitle: "Admin",
    href: "/admin/bundles/product",
    group: "Halaman",
    keywords: "product bundles rilis materi artikel diktat paket produk",
    content: "Manajemen paket materi siap rilis Product Bundle",
  },
  {
    title: "Authoring context pack",
    subtitle: "Admin",
    href: "/admin/authoring-context",
    group: "Halaman",
    keywords: "authoring context pack grounding ide acp export",
    content: "Ekspor konteks authoring terkurasi untuk agen cerdas",
  },
  {
    title: "Pendaftar PKA (Admin)",
    subtitle: "Admin PKA",
    href: "/admin/tutorial-pka/registrations",
    group: "Halaman",
    keywords: "pendaftar pka data siswa registrasi admin",
    content: "Manajemen data pendaftar program Tutorial PKA",
  },
  {
    title: "Pengumuman PKA (Admin)",
    subtitle: "Admin PKA",
    href: "/admin/tutorial-pka/announcements",
    group: "Halaman",
    keywords: "pengumuman pka siaran broadcast jadwal admin",
    content: "Manajemen pengumuman siaran Tutorial PKA",
  },
  {
    title: "Jadwal live PKA (Admin)",
    subtitle: "Admin PKA",
    href: "/admin/tutorial-pka/schedules",
    group: "Halaman",
    keywords: "jadwal live pka sesi kelas zoom meet admin",
    content: "Penjadwalan sesi live interaktif Tutorial PKA",
  },
];

/** Mirrors landing bidang studi ; searchable even before opening /courses. */
export const LANDING_SUBJECTS: Omit<SiteSearchDocument, "id">[] = [
 {
 title: "Kalkulus & metode numerik",
 subtitle: "Bidang studi - TPB",
 href: "/courses",
 group: "Topik & landing",
 keywords: "kalkulus numerik TPB limit turunan integral deret",
 content:
 "Limit turunan integral aplikasi model Limit kontinuitas Turunan aplikasi Integral tentu Deret pendekatan numerik",
 },
 {
 title: "Fisika dasar",
 subtitle: "Bidang studi - TPB",
 href: "/courses",
 group: "Topik & landing",
 keywords: "mekanika gelombang termodinamika kinematik dinamika fluida",
 content:
 "Mekanika gelombang termodinamika pengantar Kinematika dinamika Energi momentum Fluida gelombang Termodinamika pengantar",
 },
 {
 title: "Kimia dasar",
 subtitle: "Bidang studi - TPB",
 href: "/courses",
 group: "Topik & landing",
 keywords: "stoikiometri ikatan larutan elektrokimia atom",
 content: "Stoikiometri ikatan struktur larutan kesetimbangan elektrokimia pengantar laboratorium",
 },
 {
 title: "Aljabar linear",
 subtitle: "Bidang studi - Jurusan",
 href: "/courses",
 group: "Topik & landing",
 keywords: "vektor matriks determinan eigen ruang vektor",
 content: "Sistem linear Matriks determinan Ruang vektor Nilai eigen pengantar",
 },
];

function questionText(q: QuestionSpec): string {
 if (q.type === "multiple_choice" || q.type === "multiple_choices") {
 return [q.prompt, ...q.options].join(" ");
 }
 return q.prompt;
}

function examDeepContent(exam: ExamFixture): string {
 const parts = [exam.title, exam.type === "quiz" ? "kuis quiz" : "tryout ujian"];
 if (exam.settings?.timeLimitMinutes) parts.push(`batas waktu ${exam.settings.timeLimitMinutes} menit`);
 if (exam.settings?.maxAttempts != null) parts.push(`maks percobaan ${exam.settings.maxAttempts}`);
 for (const q of exam.questions) parts.push(questionText(q));
 return parts.join("\n");
}

function materialKindLabel(kind: string): string {
 switch (kind) {
 case "article":
 return "artikel";
 case "pdf":
 return "PDF";
 case "image":
 return "gambar";
 case "video":
 return "video";
 case "link":
 return "tautan";
 default:
 return kind;
 }
}

let cached: SiteSearchDocument[] | null = null;

export function getSiteSearchDocuments(): SiteSearchDocument[] {
 if (cached) return cached;

 const docs: SiteSearchDocument[] = [];

 STATIC_PAGES.forEach((p, i) => {
 docs.push({ ...p, id: `page:${i}:${p.href}` });
 });

 LANDING_SUBJECTS.forEach((s, i) => {
 docs.push({ ...s, id: `landing:${i}:${s.title}` });
 });

 for (const course of listCourses()) {
 docs.push({
 id: `course:${course.id}`,
 title: course.title,
 subtitle: `${course.category} · Course`,
 href: `/courses/${course.id}`,
 group: "Course",
 keywords: `${course.id} ${course.category} course`,
 content: `${course.title}. ${course.description}`,
 });

 for (const m of getMaterialsForCourse(course.id)) {
 const kind = materialKindLabel(m.kind);
 const body = m.body?.replace(/\n+/g, " ").trim() ?? "";
 docs.push({
 id: `material:${course.id}:${m.id}`,
 title: m.title,
 subtitle: `${course.title} · ${kind}`,
 href: `/courses/${course.id}/material/${m.id}`,
 group: "Materi",
 keywords: `${m.kind} ${course.title} ${kind}`,
 content: [m.title, body, m.url].filter(Boolean).join(" "),
 });
 }

 for (const type of ["quiz", "tryout"] as const) {
 for (const exam of getExamsForCourse(course.id, type)) {
 docs.push({
 id: `exam:${course.id}:${exam.id}`,
 title: exam.title,
 subtitle: `${course.title} · ${type === "quiz" ? "Kuis" : "Tryout"}`,
 href: `/courses/${course.id}/${type === "quiz" ? "quiz" : "tryout"}/${exam.id}`,
 group: "Evaluasi",
 keywords: `${type} ${course.title} ujian latihan soal`,
 content: examDeepContent(exam),
 });
 }
 }
 }

 cached = docs;
 return docs;
}

/** Shown when the query is empty (quick picks). */
export function getSiteSearchShortcutIds(): string[] {
 return [
 "page:0:/",
 "page:1:/courses",
 "page:2:/plans",
 "page:5:/sign-in",
 "page:7:/dashboard",
 ];
}
