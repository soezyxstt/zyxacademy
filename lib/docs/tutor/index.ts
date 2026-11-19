import { resolveDocs, searchDocs } from "../search";
import type { BilingualDocEntry, DocEntry, DocLocale } from "../types";

export const tutorBilingualDocs: BilingualDocEntry[] = [
  {
    slug: "ruang-kerja-tutor",
    id: {
      category: "Mulai mengajar",
      title: "Mengenal ruang kerja tutor",
      summary: "Pahami alur kerja harian tutor mulai dari dashboard, jadwal mengajar, diskusi kelas, hingga ruang mata kuliah.",
      keywords: ["tutor", "dashboard", "navigasi", "pengajaran", "kelas", "mulai"],
      quickLinks: [
        { label: "Dashboard pengajar", href: "/tutor", description: "Ringkasan sesi pekan ini, tiket menunggu, dan kelas Anda." },
        { label: "Jadwal mengajar", href: "/tutor/schedule", description: "Buka slot 90 menit dan kelola sesi tutorial." },
        { label: "Diskusi", href: "/tutor/discussions", description: "Jawab pertanyaan murid dari seluruh kelas." },
      ],
      sections: [
        {
          title: "Peta alur kerja pengajar",
          diagram: "tutor-workspace-map",
          paragraphs: [
            "Panel pengajar Zyx membagi pekerjaan Anda menjadi dua tingkat: **operasional lintas kelas** (Dashboard, Jadwal, dan Diskusi) serta **workspace mata kuliah** (Dokumen, Video, Peserta, Kuis, Penilaian Esai, dan Kuis Langsung).",
            "Daftar mata kuliah di menu **Pengajaran** mengikuti penugasan yang diatur oleh admin. Jika ada mata kuliah yang belum muncul, hubungi admin agar menambahkan mata kuliah tersebut pada tab Tutor.",
          ],
          steps: [
            {
              title: "Mulai hari dari Dashboard pengajar",
              body: "Buka [Dashboard pengajar](/tutor) untuk melihat sesi tutorial terdekat dan tiket perubahan jadwal yang menunggu persetujuan Anda.",
            },
            {
              title: "Buka slot mengajar di awal pekan",
              body: "Masuk ke [Jadwal mengajar](/tutor/schedule) agar kelompok belajar dapat memilih jadwal tutorial 90 menit sesuai kuota mingguan mereka.",
            },
            {
              title: "Pilih kelas di menu Pengajaran",
              body: "Klik mata kuliah pada sidebar kiri untuk mengakses dokumen, video, daftar kelompok, kuis, dan antrean penilaian esai khusus kelas tersebut.",
            },
          ],
        },
        {
          title: "Batas peran tutor dan admin",
          table: {
            caption: "Perbandingan tindakan yang tersedia di panel tutor",
            headers: ["Area", "Dapat dilakukan tutor", "Dikelola admin"],
            rows: [
              ["**Jadwal tutorial**", "Membuka slot 90 menit, menyalin jadwal pekan lalu, menyetujui/menolak tiket, mengunggah catatan sesi.", "Pengecualian manual jadwal, penugasan mata kuliah tutor."],
              ["**Materi & video**", "Membaca dokumen dan mengelola playlist video pada mata kuliah yang ditugaskan.", "Mengelola dokumen, membuat mata kuliah, mengubah ID, dan mengatur urutan silabus."],
              ["**Kuis & penilaian**", "Membuat kuis, menilai jawaban esai kuis dan tryout, memandu kuis langsung.", "Penerbitan Idea/Product Bundle MCP dan konfigurasi sistem."],
            ],
          },
        },
      ],
    },
    en: {
      category: "Getting started",
      title: "Understanding the tutor workspace",
      summary: "Learn your daily workflow across the tutor dashboard, teaching schedule, discussions, and per-course tools.",
      keywords: ["tutor", "dashboard", "navigation", "teaching", "course", "getting started"],
      quickLinks: [
        { label: "Tutor dashboard", href: "/tutor", description: "See weekly sessions, pending tickets, and assigned courses." },
        { label: "Teaching schedule", href: "/tutor/schedule", description: "Open 90-minute slots and manage tutorial bookings." },
        { label: "Discussions", href: "/tutor/discussions", description: "Answer student questions across your courses." },
      ],
      sections: [
        {
          title: "Tutor workflow overview",
          diagram: "tutor-workspace-map",
          paragraphs: [
            "The Zyx tutor panel organizes your work into two levels: **cross-course operations** (Dashboard, Schedule, and Discussions) and **per-course workspaces** (Documents, Videos, Participants, Quizzes, Essay Grading, and Live Quiz).",
            "Courses listed under **Teaching** in the left sidebar come from your admin assignment. If a course is missing, ask an admin to assign it from the shared schedule Tutor tab.",
          ],
          steps: [
            {
              title: "Start from the Tutor dashboard",
              body: "Open [Tutor dashboard](/tutor) to check upcoming tutorial sessions and any reschedule or cancellation tickets waiting for approval.",
            },
            {
              title: "Open teaching slots early in the week",
              body: "Use [Teaching schedule](/tutor/schedule) so study groups can book 90-minute sessions within their weekly allowance.",
            },
            {
              title: "Open a course under Teaching",
              body: "Select a course in the left sidebar to open its documents, videos, participant groups, quizzes, and essay grading queues.",
            },
          ],
        },
        {
          title: "Tutor vs admin scope",
          table: {
            caption: "What tutors manage directly vs admin-only tasks",
            headers: ["Area", "Handled by tutors", "Handled by admins"],
            rows: [
              ["**Tutorial schedule**", "Open 90-min slots, copy previous week, approve/reject tickets, upload session notes.", "Manual schedule overrides and tutor course assignments."],
              ["**Materials & videos**", "Read documents and manage video playlists in assigned courses.", "Manage documents, create courses, edit course IDs, and set syllabus order."],
              ["**Quizzes & grading**", "Create quizzes, grade quiz and tryout essays, host live quizzes.", "MCP Idea/Product Bundle publishing and system settings."],
            ],
          },
        },
      ],
    },
  },
  {
    slug: "jadwal-dan-slot",
    id: {
      category: "Jadwal dan sesi tutorial",
      title: "Mengelola jadwal, slot 90 menit, dan tiket",
      summary: "Buka ketersediaan bertanggal, salin pola pekan lalu, tangani tiket perubahan jadwal, dan unggah catatan sesi.",
      keywords: ["jadwal", "slot", "90 menit", "tiket", "reschedule", "meet", "catatan sesi"],
      quickLinks: [
        { label: "Jadwal mengajar", href: "/tutor/schedule", description: "Tambah slot, salin pekan lalu, dan tinjau tiket." },
      ],
      sections: [
        {
          title: "Membuka slot ketersediaan",
          diagram: "tutorial-schedule-lifecycle",
          paragraphs: [
            "Setiap slot tutorial berdurasi **90 menit** dan wajib memiliki tanggal pasti (mengikuti zona waktu `Asia/Jakarta`). Kelompok belajar hanya dapat memesan slot yang bertanggal dan berada dalam cakupan mata kuliah Anda.",
          ],
          steps: [
            {
              title: "Tambahkan slot baru atau salin pekan lalu",
              body: "Buka [Jadwal mengajar](/tutor/schedule), klik **Tambah slot** untuk membuat jadwal satuan, atau gunakan **Salin pekan lalu** bila pola mengajar Anda berulang setiap pekan.",
            },
            {
              title: "Pantau status slot yang terisi",
              body: "Saat kelompok memesan sesi daring, sistem otomatis menyiapkan tautan Google Meet. Untuk sesi tatap muka, pastikan lokasi pertemuan tercantum jelas.",
            },
            {
              title: "Unggah bahan persiapan dan ringkasan sesi",
              body: "Buka detail sesi untuk melampirkan bahan persiapan atau catatan akhir (`PDF`, `PNG`, `JPG`, atau `WebP`, maksimal **10 MB**) serta ringkasan pembahasan agar murid dapat mengulang materi.",
            },
          ],
        },
        {
          title: "Menangani tiket penjadwalan ulang dan pembatalan",
          paragraphs: [
            "Tiket muncul di [Dashboard pengajar](/tutor) dan [Jadwal mengajar](/tutor/schedule) ketika kelompok mengajukan perubahan jadwal atau pembatalan. Tutor yang ditugaskan berwenang menyetujui atau menolak tiket tersebut.",
          ],
          callouts: [
            {
              variant: "info",
              title: "Dampak persetujuan tiket pada tautan Meet dan kuota",
              body: "Saat Anda menyetujui tiket pindah jadwal untuk sesi daring, sistem otomatis memperbarui ruang Google Meet. Pembatalan melalui tiket setelah penguncian jadwal tidak mengembalikan kuota minggu tersebut kepada kelompok.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Schedule and tutorial sessions",
      title: "Managing schedules, 90-minute slots, and tickets",
      summary: "Open dated availability slots, copy last week's pattern, handle reschedule tickets, and attach session notes.",
      keywords: ["schedule", "slot", "90 minutes", "ticket", "reschedule", "meet", "session notes"],
      quickLinks: [
        { label: "Teaching schedule", href: "/tutor/schedule", description: "Add slots, copy last week, and review pending tickets." },
      ],
      sections: [
        {
          title: "Opening availability slots",
          diagram: "tutorial-schedule-lifecycle",
          paragraphs: [
            "Each tutorial slot lasts **90 minutes** and requires an explicit calendar date in `Asia/Jakarta` time. Study groups can only book dated slots for courses you are assigned to teach.",
          ],
          steps: [
            {
              title: "Add slots or copy the previous week",
              body: "Open [Teaching schedule](/tutor/schedule), click **Add a slot** for individual slots, or use **Copy previous week** if your teaching hours repeat weekly.",
            },
            {
              title: "Check booked session details",
              body: "Online bookings automatically receive a Google Meet link. For in-person sessions, confirm the room or location is clearly filled in.",
            },
            {
              title: "Attach prep materials and post-session notes",
              body: "Open the booking detail view to upload prep files or follow-up notes (`PDF`, `PNG`, `JPG`, or `WebP`, up to **10 MB**) and record a brief session summary.",
            },
          ],
        },
        {
          title: "Handling reschedule and cancellation tickets",
          paragraphs: [
            "Pending tickets appear on [Tutor dashboard](/tutor) and [Teaching schedule](/tutor/schedule) whenever a group requests a reschedule or cancellation. As the assigned tutor, you can approve or decline them directly.",
          ],
          callouts: [
            {
              variant: "info",
              title: "How ticket approvals affect Meet links and quotas",
              body: "Approving an online reschedule automatically generates a fresh Google Meet link. Ticket-based cancellations after schedule lock do not refund that week's session quota.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "diskusi-dan-peserta",
    id: {
      category: "Jadwal dan sesi tutorial",
      title: "Menjawab diskusi dan memantau peserta",
      summary: "Tangani pertanyaan murid lintas kelas dengan cepat dan pantau keaktifan kelompok belajar di setiap mata kuliah.",
      keywords: ["diskusi", "pertanyaan", "peserta", "kelompok", "jawaban", "gambar"],
      quickLinks: [
        { label: "Diskusi lintas kelas", href: "/tutor/discussions", description: "Lihat seluruh pertanyaan murid yang belum terjawab." },
        { label: "Dashboard pengajar", href: "/tutor", description: "Buka ringkasan mata kuliah untuk cek peserta." },
      ],
      sections: [
        {
          title: "Mengelola kotak masuk diskusi",
          steps: [
            {
              title: "Gunakan filter saluran dan pencarian",
              body: "Buka [Diskusi](/tutor/discussions) untuk melihat pertanyaan dari semua kelas Anda, atau buka menu **Diskusi** di dalam mata kuliah tertentu agar fokus pada satu topik.",
            },
            {
              title: "Prioritaskan utas yang masih terbuka",
              body: "Utas yang belum terjawab tampil dengan penekanan normal, sedangkan utas yang sudah dijawab tampil lebih tenang dan utas selesai masuk ke bagian yang dapat dilipat.",
            },
            {
              title: "Gunakan rumus matematika dan lampiran gambar bila perlu",
              body: "Editor diskusi mendukung format teks langsung, notasi matematika, serta hingga 4 lampiran gambar untuk memperjelas coretan solusi.",
            },
          ],
        },
        {
          title: "Memantau peserta dan kelompok belajar",
          paragraphs: [
            "Di dalam setiap mata kuliah pada sidebar **Pengajaran**, buka menu **Peserta dan kelompok** untuk melihat murid terdaftar, susunan kelompok belajar aktif, serta partisipasi mereka sebelum sesi tutorial berlangsung.",
          ],
        },
      ],
    },
    en: {
      category: "Schedule and tutorial sessions",
      title: "Answering discussions and tracking participants",
      summary: "Respond quickly to student questions across courses and inspect active study groups before sessions.",
      keywords: ["discussion", "questions", "participants", "groups", "answers", "attachments"],
      quickLinks: [
        { label: "All discussions", href: "/tutor/discussions", description: "Review open student questions across your courses." },
        { label: "Tutor dashboard", href: "/tutor", description: "Jump into an assigned course to view participants." },
      ],
      sections: [
        {
          title: "Working through the discussions inbox",
          steps: [
            {
              title: "Filter by course or search directly",
              body: "Open [Discussions](/tutor/discussions) for a unified inbox across all your courses, or open **Discussion** inside a single course workspace.",
            },
            {
              title: "Prioritize open threads first",
              body: "Open threads appear with normal emphasis, answered threads appear muted, and resolved threads collapse into their own section.",
            },
            {
              title: "Use live math formatting and image attachments",
              body: "The composer supports live math rendering and up to 4 image attachments so you can share worked steps clearly.",
            },
          ],
        },
        {
          title: "Reviewing participants and groups",
          paragraphs: [
            "Inside any assigned course under **Teaching**, open **Participants and groups** to see enrolled students, active study groups, and recent engagement before your tutorial session.",
          ],
        },
      ],
    },
  },
  {
    slug: "materi-dan-video-kelas",
    id: {
      category: "Materi dan penilaian",
      title: "Melihat dokumen dan mengelola video kelas",
      summary: "Lihat dokumen mata kuliah dan susun video pembelajaran dalam playlist.",
      keywords: ["dokumen", "pdf", "video", "playlist", "youtube", "materi", "unggah"],
      quickLinks: [
        { label: "Dashboard pengajar", href: "/tutor", description: "Pilih mata kuliah lalu buka menu Dokumen atau Video." },
      ],
      sections: [
        {
          title: "Melihat dokumen",
          paragraphs: [
            "Dari sidebar **Pengajaran**, pilih mata kuliah lalu buka **Dokumen** untuk melihat materi yang tersedia. Hubungi admin jika dokumen perlu ditambah atau diperbarui.",
          ],
        },
        {
          title: "Menyusun playlist dan video",
          paragraphs: [
            "Buka menu **Video** pada mata kuliah untuk membuat playlist per topik lalu menambahkan video dari YouTube atau unggahan langsung. Pastikan video dapat diakses murid dan judulnya spesifik.",
          ],
          table: {
            caption: "Format dan batas unggahan video",
            headers: ["Jenis berkas", "Format didukung", "Batas ukuran"],
            rows: [
              ["**Video unggah langsung**", "`MP4`, `WebM`, `MOV`", "**100 MB**"],
              ["**Thumbnail video**", "`JPG`, `PNG`, `WebP`", "**5 MB**"],
            ],
          },
        },
      ],
    },
    en: {
      category: "Materials and assessment",
      title: "Viewing course documents and managing videos",
      summary: "View course documents and organize videos into topic playlists.",
      keywords: ["documents", "pdf", "video", "playlist", "youtube", "materials", "upload"],
      quickLinks: [
        { label: "Tutor dashboard", href: "/tutor", description: "Open an assigned course, then select Documents or Videos." },
      ],
      sections: [
        {
          title: "Viewing documents",
          paragraphs: [
            "Select an assigned course under **Teaching** and open **Documents** to view the available materials. Contact an admin to add or update a document.",
          ],
        },
        {
          title: "Organizing video playlists",
          paragraphs: [
            "Open **Videos** inside your course to group lessons into topic playlists and add YouTube links or direct uploads. Confirm videos are accessible to students and clearly titled.",
          ],
          table: {
            caption: "Video upload formats and limits",
            headers: ["File type", "Supported formats", "Maximum size"],
            rows: [
              ["**Direct video upload**", "`MP4`, `WebM`, `MOV`", "**100 MB**"],
              ["**Video thumbnail**", "`JPG`, `PNG`, `WebP`", "**5 MB**"],
            ],
          },
        },
      ],
    },
  },
  {
    slug: "kuis-dan-penilaian-esai",
    id: {
      category: "Materi dan penilaian",
      title: "Membuat kuis dan menilai jawaban esai",
      summary: "Susun kuis per bab, pahami perbedaan kuis dan tryout, serta selesaikan antrean penilaian esai murid.",
      keywords: ["kuis", "tryout", "esai", "penilaian", "grading", "nilai", "waktu"],
      quickLinks: [
        { label: "Dashboard pengajar", href: "/tutor", description: "Pilih kelas lalu buka Kuis, Penilaian kuis, atau Penilaian tryout." },
      ],
      sections: [
        {
          title: "Menyusun kuis kelas",
          diagram: "tutor-grading-flow",
          paragraphs: [
            "Pada workspace mata kuliah, buka menu **Kuis** untuk membuat kuis baru atau menyunting kuis yang sudah ada. Setiap kuis mencakup **tepat satu bab**, sedangkan tryout dapat mencakup beberapa bab.",
            "Jika Anda mengaktifkan batas waktu total sekaligus timer per soal, pastikan jumlah seluruh timer per soal sama dengan batas waktu total.",
          ],
        },
        {
          title: "Menilai esai kuis dan tryout",
          steps: [
            {
              title: "Buka antrean penilaian yang sesuai",
              body: "Gunakan menu **Penilaian kuis** untuk esai kuis bab, atau **Penilaian tryout** untuk esai tryout di mata kuliah terkait.",
            },
            {
              title: "Periksa jawaban dan beri skor beserta umpan balik",
              body: "Berikan skor sesuai rubrik dan catatan singkat yang membantu murid memahami letak kesalahan konsepnya.",
            },
            {
              title: "Simpan agar nilai akhir terbuka untuk murid",
              body: "Soal objektif dinilai otomatis, tetapi nilai akhir dan analitik percobaan murid baru ditampilkan setelah seluruh soal esai selesai dinilai.",
            },
          ],
          callouts: [
            {
              variant: "tip",
              title: "Prioritaskan percobaan yang menunggu penilaian",
              body: "Selama masih ada satu soal esai yang belum dinilai pada sebuah percobaan, murid belum dapat melihat skor final maupun analitik percobaan tersebut.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Materials and assessment",
      title: "Creating quizzes and grading essays",
      summary: "Build chapter quizzes, understand quiz vs tryout rules, and clear pending student essay queues.",
      keywords: ["quiz", "tryout", "essay", "grading", "score", "timer"],
      quickLinks: [
        { label: "Tutor dashboard", href: "/tutor", description: "Open a course, then go to Quizzes, Quiz grading, or Tryout grading." },
      ],
      sections: [
        {
          title: "Building a chapter quiz",
          diagram: "tutor-grading-flow",
          paragraphs: [
            "Inside your course workspace, open **Quizzes** to create or edit a quiz. Each quiz covers **exactly one chapter**, while tryouts can span multiple chapters.",
            "When both a total time limit and per-question timers are enabled, ensure the sum of per-question timers equals the total time limit.",
          ],
        },
        {
          title: "Grading quiz and tryout essays",
          steps: [
            {
              title: "Open the right grading queue",
              body: "Use **Quiz grading** for chapter quiz essays, or **Tryout grading** for tryout essay submissions inside the course.",
            },
            {
              title: "Score answers and leave concise feedback",
              body: "Assign points according to the rubric and add short feedback highlighting where the student's reasoning succeeded or drifted.",
            },
            {
              title: "Submit to release final scores",
              body: "Objective items are graded automatically, but final scores and analytics stay hidden from the student until every essay item is graded.",
            },
          ],
          callouts: [
            {
              variant: "tip",
              title: "Clear pending queues promptly",
              body: "Even a single ungraded essay holds back the student's final score and analytics for that attempt.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "kuis-langsung",
    id: {
      category: "Materi dan penilaian",
      title: "Memandu kuis langsung (Live Quiz)",
      summary: "Siapkan sesi kuis langsung interaktif, undang peserta kelas, dan kendalikan tempo tiap soal secara real-time.",
      keywords: ["live quiz", "kuis langsung", "sesi", "real-time", "host"],
      quickLinks: [
        { label: "Dashboard pengajar", href: "/tutor", description: "Pilih mata kuliah lalu buka menu Kuis langsung." },
      ],
      sections: [
        {
          title: "Alur menjalankan sesi Kuis langsung",
          diagram: "tutor-live-quiz-flow",
          steps: [
            {
              title: "Buka konsol Kuis langsung pada kelas",
              body: "Pilih mata kuliah di menu **Pengajaran** lalu buka **Kuis langsung**.",
            },
            {
              title: "Pilih paket soal dan buka ruang tunggu",
              body: "Pilih kuis yang siap dipakai lalu buka ruang tunggu agar murid di kelas tersebut dapat bergabung.",
            },
            {
              title: "Mulai sesi dan kendalikan perpindahan soal",
              body: "Pantau jumlah jawaban masuk untuk tiap soal, bahas poin penting setelah waktu habis, lalu lanjutkan ke soal berikutnya hingga papan hasil akhir tampil.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Pastikan murid sudah terdaftar di mata kuliah",
              body: "Hanya peserta yang memiliki akses ke mata kuliah terkait yang dapat bergabung ke sesi Kuis langsung kelas tersebut.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Materials and assessment",
      title: "Hosting live quizzes",
      summary: "Launch interactive live quiz sessions, gather enrolled students in the lobby, and pace questions in real time.",
      keywords: ["live quiz", "session", "real-time", "host", "classroom"],
      quickLinks: [
        { label: "Tutor dashboard", href: "/tutor", description: "Open an assigned course, then select Live quiz." },
      ],
      sections: [
        {
          title: "Running a Live Quiz session",
          diagram: "tutor-live-quiz-flow",
          steps: [
            {
              title: "Open the Live Quiz console",
              body: "Choose your course under **Teaching** and open **Live quiz**.",
            },
            {
              title: "Select a quiz and open the lobby",
              body: "Pick a prepared quiz and open the lobby so enrolled students can join before you start.",
            },
            {
              title: "Pace questions and review answers",
              body: "Track incoming responses per question, briefly discuss common mistakes after each timer ends, and advance through the final leaderboard.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Verify course enrollment",
              body: "Only students enrolled in the course can join that course's Live Quiz room.",
            },
          ],
        },
      ],
    },
  },
];

export function getTutorDocs(locale: DocLocale = "id"): DocEntry[] {
  return resolveDocs(tutorBilingualDocs, locale);
}

export function getTutorDocBySlug(slug: string, locale: DocLocale = "id"): DocEntry | undefined {
  return getTutorDocs(locale).find((doc) => doc.slug === slug);
}

export function searchTutorDocs(query: string, locale: DocLocale = "id"): DocEntry[] {
  return searchDocs(getTutorDocs(locale), query, locale);
}
