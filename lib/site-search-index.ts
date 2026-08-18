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
 group: "Halaman" | "Course" | "Materi" | "Evaluasi" | "Topik & landing";
 /** Extra tokens: synonyms, tags, route segments */
 keywords: string;
 /** Long-form text matched deeply (blurbs, article bodies, prompts, options) */
 content: string;
};

const STATIC_PAGES: Omit<SiteSearchDocument, "id">[] = [
 {
 title: "Beranda",
 subtitle: "Landing",
 href: "/",
 group: "Halaman",
 keywords: "home utama zyx academy",
 content: "Program bimbingan online kalkulus fisika kimia aljabar linear persiapan kuliah",
 },
 {
 title: "Katalog course",
 subtitle: "Courses",
 href: "/courses",
 group: "Halaman",
 keywords: "katalog materi enrolled paket bidang",
 content: "Daftar course TPB kalkulus fisika kimia preview enrollment",
 },
 {
 title: "Paket & harga",
 subtitle: "Plans",
 href: "/plans",
 group: "Halaman",
 keywords: "langganan subscription pricing paket belajar",
 content: "Lihat paket harga membership akses course",
 },
 {
 title: "Tentang kami",
 subtitle: "About",
 href: "/about",
 group: "Halaman",
 keywords: "tim visi misi zyx",
 content: "Informasi platform bimbingan",
 },
 {
 title: "Testimoni",
 subtitle: "Social proof",
 href: "/testimonial",
 group: "Halaman",
 keywords: "review pengalaman siswa",
 content: "Cerita pengguna testimoni",
 },
 {
 title: "Masuk",
 subtitle: "Akun",
 href: "/sign-in",
 group: "Halaman",
 keywords: "login sign in oauth google",
 content: "Autentikasi masuk dashboard",
 },
 {
 title: "Daftar",
 subtitle: "Akun baru",
 href: "/sign-up",
 group: "Halaman",
 keywords: "register buat akun",
 content: "Pendaftaran pengguna baru",
 },
 {
 title: "Dashboard",
 subtitle: "Ringkasan belajar",
 href: "/dashboard",
 group: "Halaman",
 keywords: "progres streak materi berikutnya",
 content: "Ringkasan progres belajar aktivitas",
 },
 {
 title: "Kalender",
 subtitle: "Jadwal",
 href: "/calendar",
 group: "Halaman",
 keywords: "jadwal event deadline",
 content: "Kalender aktivitas akademik",
 },
 {
 title: "Pengaturan",
 subtitle: "Akun",
 href: "/settings",
 group: "Halaman",
 keywords: "profil preferensi tema notifikasi",
 content: "Setelan akun aplikasi",
 },
 {
 title: "Profil",
 subtitle: "Akun",
 href: "/profile",
 group: "Halaman",
 keywords: "biodata nama email",
 content: "Profil pengguna",
 },
 {
 title: "Umpan balik",
 subtitle: "Kontak",
 href: "/feedback",
 group: "Halaman",
 keywords: "saran bug laporan masukan",
 content: "Kirim umpan balik ke tim produk",
 },
 {
 title: "Keluar",
 subtitle: "Sesi",
 href: "/sign-out",
 group: "Halaman",
 keywords: "logout sign out akhiri sesi",
 content: "Keluar dari akun",
 },
 {
 title: "Panel admin",
 subtitle: "Admin",
 href: "/admin",
 group: "Halaman",
 keywords: "dashboard administrator",
 content: "Ringkasan administrasi pengguna konten",
 },
  {
  title: "Token aktivasi",
 subtitle: "Admin",
 href: "/admin/tokens",
 group: "Halaman",
 keywords: "token pendaftaran aktivasi voucher",
 content: "Pembuatan dan manajemen token pendaftaran dan aktivasi kelas",
 },
 {
 title: "Materi",
 subtitle: "Admin",
 href: "/admin/materials",
 group: "Halaman",
 keywords: "materi bahan ajar ai ingestion knowledge base",
 content: "Segmentasi dan pengunggahan materi kurikulum ke basis pengetahuan untuk generasi soal",
 },
 {
 title: "Kompilasi Diktat",
 subtitle: "Admin",
 href: "/admin/diktats",
 group: "Halaman",
 keywords: "diktat pdf compile buku cetak",
 content: "Gabungkan bab materi menjadi buku diktat belajar PDF siap cetak",
 },
 {
 title: "Generasi Soal",
 subtitle: "Admin",
 href: "/admin/jobs",
 group: "Halaman",
 keywords: "generasi soal queue job gemini",
 content: "Pantau status job kompilasi dan generasi soal kecerdasan buatan",
 },
 {
 title: "Bank Soal",
 subtitle: "Admin",
 href: "/admin/questions",
 group: "Halaman",
 keywords: "bank soal list filter edit approve",
 content: "Kurasi, edit, setujui dan publikasikan bank soal kecerdasan buatan",
 },
  {
    title: "Kuis",
    subtitle: "Admin",
    href: "/admin/quizzes",
    group: "Halaman",
    keywords: "quiz kuis rule seleksi jadwal bank soal",
    content: "Manajemen kuis, jadwal, aturan pengerjaan, dan butir soal",
  },
];

/** Mirrors landing bidang studi ; searchable even before opening /courses. */
const LANDING_SUBJECTS: Omit<SiteSearchDocument, "id">[] = [
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
