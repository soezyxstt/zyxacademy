import type { BilingualDocEntry } from "../types";

export const adminOperationsDocs: BilingualDocEntry[] = [
  {
    slug: "token-aktivasi",
    id: {
      category: "Akses dan pengguna",
      title: "Token aktivasi dan akses kelompok",
      summary: "Buat token aktivasi sesuai mata kuliah, kapasitas kelompok, dan masa akses semester yang disepakati.",
      keywords: ["token", "aktivasi", "kapasitas", "kedaluwarsa", "akses", "kelompok"],
      quickLinks: [
        { label: "Token aktivasi", href: "/admin/tokens", description: "Buat, pantau status, dan cabut token aktivasi." },
        { label: "Kelompok belajar", href: "/admin/groups", description: "Periksa anggota dan kuota kelompok terkait." },
      ],
      sections: [
        {
          title: "Sebelum membuat token",
          diagram: "token-group-flow",
          paragraphs: [
            "Token aktivasi menghubungkan murid ke kelompok belajar dan paket mata kuliah yang dipilih. Sebelum membuat token, pastikan daftar mata kuliah, kapasitas anggota, kuota pertemuan, dan masa berlaku semester sudah sesuai kesepakatan.",
            "Kapasitas harus berupa bilangan bulat antara `1` sampai `1000`. Isi kapasitas sesuai kebutuhan kelompok, bukan otomatis menggunakan batas maksimum.",
          ],
          codeBlocks: [
            {
              label: "Format token yang dihasilkan sistem",
              code: "Zyx-XXXXXXXX-{kapasitas}-{jumlah-mata-kuliah}",
            },
          ],
          steps: [
            {
              title: "Buka halaman Token aktivasi",
              body: "Masuk ke [Token aktivasi](/admin/tokens) lalu pilih tombol pembuatan token baru.",
            },
            {
              title: "Tentukan mata kuliah, kapasitas, dan paket",
              body: "Pilih mata kuliah tujuan, kapasitas kelompok, serta paket atau kuota pertemuan. Periksa kembali ringkasannya sebelum menyimpan.",
            },
            {
              title: "Bagikan secara privat dan pantau aktivasi",
              body: "Salin token kepada pihak yang berhak. Setelah murid mengaktifkan token, periksa anggota dan statusnya di [Kelompok belajar](/admin/groups).",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Bagian acak dan tanggal kedaluwarsa otomatis",
              body: "Kode acak `XXXXXXXX` dibuat oleh sistem, bukan diisi manual. Tanggal kedaluwarsa dihitung otomatis mengikuti akhir semester saat token diterbitkan.",
            },
          ],
        },
        {
          title: "Memeriksa kendala dan mencabut token",
          paragraphs: [
            "Jika murid gagal mengaktifkan token, periksa status token, tanggal kedaluwarsa, sisa kapasitas, cakupan mata kuliah, dan akun yang dipakai sebelum menerbitkan token pengganti.",
          ],
          callouts: [
            {
              variant: "danger",
              title: "Menghapus token juga menghapus kelompok terhubung",
              body: "Menghapus token dari halaman [Token aktivasi](/admin/tokens) akan ikut menghapus kelompok yang terhubung dengannya. Periksa anggota dan dampaknya lebih dulu, dan jangan pernah membagikan token di dokumen atau kanal publik.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Access and users",
      title: "Activation tokens and group access",
      summary: "Issue activation tokens with the agreed courses, group capacity, and semester validity.",
      keywords: ["token", "activation", "capacity", "expiration", "access", "group"],
      quickLinks: [
        { label: "Activation tokens", href: "/admin/tokens", description: "Create, inspect, and revoke activation tokens." },
        { label: "Study groups", href: "/admin/groups", description: "Inspect linked members and session quotas." },
      ],
      sections: [
        {
          title: "Before creating a token",
          diagram: "token-group-flow",
          paragraphs: [
            "An activation token connects students to a study group and its enrolled courses. Before issuing one, confirm the course list, member capacity, session quota, and semester validity match the agreement.",
            "Capacity must be an integer between `1` and `1000`. Set the actual group size rather than defaulting to the maximum.",
          ],
          codeBlocks: [
            {
              label: "System-generated token format",
              code: "Zyx-XXXXXXXX-{capacity}-{course-count}",
            },
          ],
          steps: [
            {
              title: "Open Activation tokens",
              body: "Navigate to [Activation tokens](/admin/tokens) and start creating a new token.",
            },
            {
              title: "Configure courses, capacity, and package",
              body: "Select target courses, capacity, and session package or quota. Review every field before saving.",
            },
            {
              title: "Share privately and verify redemption",
              body: "Send the token only to authorized recipients. After redemption, verify members and token status in [Study groups](/admin/groups).",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Random code and semester expiry",
              body: "The random `XXXXXXXX` segment is generated by the system. Expiration is calculated automatically from the end of the active semester.",
            },
          ],
        },
        {
          title: "Troubleshooting and revoking tokens",
          paragraphs: [
            "When redemption fails, inspect token status, expiration date, remaining capacity, assigned courses, and the student account before issuing a replacement.",
          ],
          callouts: [
            {
              variant: "danger",
              title: "Deleting a token deletes its linked group",
              body: "Deleting a token on [Activation tokens](/admin/tokens) also deletes the linked study group. Check active members and impact first, and never post tokens in public channels or docs.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "pengguna-dan-kelompok",
    id: {
      category: "Akses dan pengguna",
      title: "Pengguna dan kelompok belajar",
      summary: "Kelola peran akun, keanggotaan kelompok, pemimpin kelompok, paket kuota, dan mata kuliah terkait.",
      keywords: ["pengguna", "peran", "admin", "tutor", "murid", "kelompok", "anggota", "paket"],
      quickLinks: [
        { label: "Pengguna", href: "/admin/users", description: "Cari akun dan ubah peran pengguna." },
        { label: "Kelompok belajar", href: "/admin/groups", description: "Kelola anggota, pemimpin, dan kuota kelompok." },
      ],
      sections: [
        {
          title: "Mengubah peran pengguna",
          steps: [
            {
              title: "Temukan akun yang tepat",
              body: "Buka [Pengguna](/admin/users) lalu cari akun berdasarkan nama atau email yang terverifikasi.",
            },
            {
              title: "Perbarui peran dan simpan",
              body: "Pilih peran yang diperlukan (`student`, `tutor`, atau `admin`), simpan perubahan, lalu periksa kembali daftar peran akun tersebut.",
            },
          ],
          paragraphs: [
            "Setiap pengguna wajib memiliki minimal satu peran. Admin tidak dapat mencabut peran `admin` dari akunnya sendiri. Berikan hak akses sesuai kebutuhan tugas, terutama untuk akses admin.",
          ],
        },
        {
          title: "Mengelola kelompok dan paket kuota",
          steps: [
            {
              title: "Periksa paket dan periode semester",
              body: "Buka [Kelompok belajar](/admin/groups). Saat membuat atau menyunting kelompok, pastikan paket, tanggal semester, dan mata kuliah terkait sudah benar.",
            },
            {
              title: "Tinjau detail kelompok",
              body: "Buka halaman detail kelompok untuk melihat daftar anggota, pemimpin, token terkait, pemakaian kuota mingguan, dan riwayat sesi.",
            },
            {
              title: "Atur anggota dan pemimpin",
              body: "Tambahkan atau keluarkan anggota serta tetapkan pemimpin kelompok sesuai kebutuhan. Periksa kembali nama kelompok dan akun sebelum menyimpan.",
            },
          ],
          table: {
            caption: "Ringkasan kuota paket kelompok belajar",
            headers: ["Paket", "Total sesi per semester", "Jatah sesi mingguan"],
            rows: [
              ["**Reguler**", "15 sesi", "1 sesi / minggu"],
              ["**Intensif**", "30 sesi", "2 sesi / minggu"],
              ["**Super Intensif**", "45 sesi", "3 sesi / minggu"],
              ["**Kustom**", "Ditentukan admin", "Ditentukan admin"],
            ],
          },
          callouts: [
            {
              variant: "warning",
              title: "Periksa jadwal dan token sebelum menghapus anggota",
              body: "Mengeluarkan anggota atau menghapus kelompok akan memengaruhi hubungan keanggotaan dan akses sesi. Periksa token aktif serta jadwal tutorial terkait sebelum melanjutkan.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Access and users",
      title: "Users and study groups",
      summary: "Manage account roles, study group membership, group leaders, session packages, and course assignments.",
      keywords: ["user", "role", "admin", "tutor", "student", "group", "member", "package"],
      quickLinks: [
        { label: "Users", href: "/admin/users", description: "Search accounts and assign roles." },
        { label: "Study groups", href: "/admin/groups", description: "Manage members, leaders, and session quotas." },
      ],
      sections: [
        {
          title: "Updating user roles",
          steps: [
            {
              title: "Locate the account",
              body: "Open [Users](/admin/users) and find the target account by verified name or email.",
            },
            {
              title: "Assign roles and verify",
              body: "Select the required roles (`student`, `tutor`, or `admin`), save changes, and confirm the updated role badges.",
            },
          ],
          paragraphs: [
            "Every user must hold at least one role. Admins cannot revoke the `admin` role from their own account. Grant least-privilege access, especially for admin permissions.",
          ],
        },
        {
          title: "Managing study groups and quotas",
          steps: [
            {
              title: "Configure package and semester dates",
              body: "Open [Study groups](/admin/groups). When creating or editing a group, verify its package, semester dates, and linked courses.",
            },
            {
              title: "Inspect group details",
              body: "Open the group detail view to inspect members, leader, linked token, weekly quota usage, and session history.",
            },
            {
              title: "Update members and leader",
              body: "Add or remove members and assign the group leader as needed. Double-check group and account identities before saving.",
            },
          ],
          table: {
            caption: "Study group package quotas",
            headers: ["Package", "Total sessions per semester", "Weekly session allowance"],
            rows: [
              ["**Reguler**", "15 sessions", "1 session / week"],
              ["**Intensif**", "30 sessions", "2 sessions / week"],
              ["**Super Intensif**", "45 sessions", "3 sessions / week"],
              ["**Custom**", "Set by admin", "Set by admin"],
            ],
          },
          callouts: [
            {
              variant: "warning",
              title: "Check schedules and tokens before removing members",
              body: "Removing a member or deleting a group changes membership access. Review linked tokens and upcoming tutorial bookings before taking action.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "kelola-kuis",
    id: {
      category: "Penilaian",
      title: "Membuat dan memeriksa kuis",
      summary: "Atur cakupan bab, daftar soal, pengaturan waktu, dan penilaian esai sebelum kuis dipublikasikan ke murid.",
      keywords: ["kuis", "tryout", "soal", "penilaian", "esai", "waktu", "publikasi"],
      quickLinks: [
        { label: "Daftar mata kuliah", href: "/admin/courses", description: "Pilih mata kuliah lalu buka Kuis, Tryout, atau Hasil." },
      ],
      sections: [
        {
          title: "Siapkan kuis dan pengaturan waktu",
          diagram: "quiz-vs-tryout",
          steps: [
            {
              title: "Buka menu Kuis pada mata kuliah",
              body: "Masuk ke [Mata kuliah](/admin/courses), pilih mata kuliah terkait, lalu buka tab **Kuis** (atau **Tryout** untuk cakupan multibab).",
            },
            {
              title: "Pilih cakupan bab, soal, dan timer",
              body: "Buat atau edit kuis, tentukan bab dan soalnya, lalu periksa judul, instruksi, serta pengaturan batas waktu.",
            },
            {
              title: "Tinjau kunci jawaban sebelum terbit",
              body: "Periksa kembali seluruh butir soal dan kunci jawaban sebelum memublikasikan kuis agar murid tidak menerima notifikasi atau soal yang keliru.",
            },
          ],
          paragraphs: [
            "**Kuis** selalu mencakup tepat satu bab, sedangkan **Tryout** dapat mencakup satu atau beberapa bab.",
            "Batas waktu total menentukan akhir sesi dan otomatis mengirim jawaban saat habis. Timer per soal membantu menjaga tempo dan berpindah ke soal berikutnya tanpa mengakhiri kuis selama waktu total masih tersisa. Jika keduanya aktif bersamaan, jumlah seluruh timer per soal harus sama dengan batas waktu total.",
          ],
        },
        {
          title: "Memeriksa hasil dan jawaban esai",
          paragraphs: [
            "Soal objektif yang memenuhi syarat langsung dinilai otomatis oleh sistem. Jika percobaan murid memuat soal esai, statusnya menunggu penilaian sehingga nilai akhir dan analitik belum tampil ke murid sampai seluruh esai selesai dinilai.",
            "Gunakan menu **Hasil** dan **Analitik** pada workspace mata kuliah yang sama untuk memeriksa percobaan murid secara akurat.",
          ],
        },
      ],
    },
    en: {
      category: "Assessment",
      title: "Creating and reviewing quizzes",
      summary: "Configure chapter scope, questions, timers, and essay grading before publishing a quiz to students.",
      keywords: ["quiz", "tryout", "question", "grading", "essay", "timer", "publish"],
      quickLinks: [
        { label: "Courses", href: "/admin/courses", description: "Open a course to manage Quizzes, Tryouts, or Results." },
      ],
      sections: [
        {
          title: "Set up the quiz and timers",
          diagram: "quiz-vs-tryout",
          steps: [
            {
              title: "Open Quizzes inside the course",
              body: "Go to [Courses](/admin/courses), choose the target course, and open **Quizzes** (or **Tryouts** for multi-chapter exams).",
            },
            {
              title: "Configure chapter scope, items, and timing",
              body: "Create or edit the quiz, attach questions, and review its title, instructions, and timer settings.",
            },
            {
              title: "Audit answer keys before publishing",
              body: "Double-check all stems and answer keys before publishing, since publishing can trigger student notifications.",
            },
          ],
          paragraphs: [
            "A **Quiz** always covers exactly one chapter, while a **Tryout** can span one or more chapters.",
            "The total time limit ends the attempt and auto-submits answers when expired. Per-question timers pace students and advance to the next item without ending the quiz while total time remains. When both are enabled, the sum of per-question timers must equal the total time limit.",
          ],
        },
        {
          title: "Reviewing results and essay grading",
          paragraphs: [
            "Eligible objective questions are graded automatically. Attempts containing essay items remain pending until every essay is graded, withholding final scores and analytics from the student until complete.",
            "Use **Results** and **Analytics** inside the same course workspace to inspect attempts before following up.",
          ],
        },
      ],
    },
  },
  {
    slug: "notifikasi",
    id: {
      category: "Komunikasi",
      title: "Mengirim dan memeriksa notifikasi",
      summary: "Kirim pengumuman ke sasaran yang tepat, pahami pemicu otomatis, dan baca status pengiriman push.",
      keywords: ["notifikasi", "broadcast", "push", "pengumuman", "pengiriman", "kotak masuk"],
      quickLinks: [
        { label: "Notifikasi", href: "/admin/notifications", description: "Kirim broadcast dan periksa riwayat pengiriman." },
      ],
      sections: [
        {
          title: "Mengirim pengumuman",
          steps: [
            {
              title: "Pilih penerima yang tepat",
              body: "Buka [Notifikasi](/admin/notifications) lalu tentukan segmen atau penerima yang dituju.",
            },
            {
              title: "Tulis judul dan pesan yang ringkas",
              body: "Susun informasi inti dengan jelas, lalu periksa ulang penerima dan redaksi sebelum menekan kirim.",
            },
            {
              title: "Pantau riwayat pengiriman",
              body: "Periksa log riwayat setelah pengiriman untuk melihat status akhir serta jumlah perangkat yang berhasil atau gagal menerima push.",
            },
          ],
          paragraphs: [
            "Setiap pengumuman juga masuk ke kotak masuk aplikasi. Pengiriman push bergantung pada perangkat dan izin notifikasi pengguna, sehingga status push terkirim berbeda dari status pesan sudah dibaca.",
          ],
          table: {
            caption: "Arti status pengiriman di riwayat notifikasi",
            headers: ["Status", "Artinya", "Tindak lanjut"],
            rows: [
              ["**Terkirim**", "Seluruh perangkat sasaran menerima push.", "Tidak perlu tindakan tambahan."],
              ["**Sebagian**", "Hanya sebagian perangkat yang berhasil menerima push.", "Gunakan kanal tambahan jika informasi mendesak."],
              ["**Gagal**", "Pengiriman push gagal di seluruh target.", "Periksa log dan sampaikan lewat kanal cadangan."],
              ["**Tanpa perangkat**", "Penerima belum mengaktifkan perangkat push.", "Pesan tetap ada di kotak masuk aplikasi; kabari lewat kanal lain bila mendesak."],
            ],
          },
        },
        {
          title: "Pemicu notifikasi otomatis",
          callouts: [
            {
              variant: "warning",
              title: "Periksa data sebelum menerbitkan kuis atau jadwal PKA",
              body: "Publikasi kuis, pengumuman dan perubahan jadwal PKA, serta broadcast admin dapat langsung memicu push notification. Pastikan judul, waktu, dan sasaran benar sebelum menyimpan status terbit.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Communication",
      title: "Sending and monitoring notifications",
      summary: "Deliver announcements to the right audience, understand automatic triggers, and interpret push delivery statuses.",
      keywords: ["notification", "broadcast", "push", "announcement", "delivery", "inbox"],
      quickLinks: [
        { label: "Notifications", href: "/admin/notifications", description: "Send broadcasts and inspect delivery history." },
      ],
      sections: [
        {
          title: "Sending announcements",
          steps: [
            {
              title: "Select the target audience",
              body: "Open [Notifications](/admin/notifications) and choose the intended recipients.",
            },
            {
              title: "Write a clear title and message",
              body: "Keep the message concise and actionable, then verify both audience and wording before sending.",
            },
            {
              title: "Inspect delivery history",
              body: "Review the history log afterward to check overall status and per-device success or failure counts.",
            },
          ],
          paragraphs: [
            "Announcements are always saved to the in-app inbox. Push delivery depends on device registration and browser/OS permissions, so push delivery and read receipts are tracked separately.",
          ],
          table: {
            caption: "Notification delivery statuses",
            headers: ["Status", "Meaning", "Recommended action"],
            rows: [
              ["**Sent**", "All target devices received the push.", "No further action needed."],
              ["**Partial**", "Only some registered devices received the push.", "Follow up on another channel if urgent."],
              ["**Failed**", "Push delivery failed across targets.", "Inspect logs and notify via a backup channel."],
              ["**No devices**", "Recipients have no active push subscriptions.", "Message remains in the in-app inbox; use another channel for urgent notices."],
            ],
          },
        },
        {
          title: "Automatic notification triggers",
          callouts: [
            {
              variant: "warning",
              title: "Verify before publishing quizzes or PKA schedules",
              body: "Publishing a quiz, posting or changing PKA schedules, and sending admin broadcasts can trigger push notifications immediately. Double-check titles, dates, and audiences before publishing.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "pemeriksaan-operasional",
    id: {
      category: "Operasional",
      title: "Pemeriksaan dan perubahan operasional",
      summary: "Lakukan verifikasi read-only sebelum mengubah data, jaga kerahasiaan kredensial, dan pilih workflow MCP yang tepat.",
      keywords: ["operasional", "agent", "mcp", "staging", "produksi", "verifikasi", "keamanan"],
      quickLinks: [
        { label: "Monitor Ops", href: "/admin/ops", description: "Pantau kesehatan operasional dan pekerjaan sistem." },
      ],
      sections: [
        {
          title: "Checklist sebelum melakukan perubahan",
          steps: [
            {
              title: "Konfirmasi lingkungan dan objek sasaran",
              body: "Pastikan apakah Anda berada di `staging` atau `production`, lalu cocokkan mata kuliah, bab, kelompok, atau akun yang dituju.",
            },
            {
              title: "Baca kondisi saat ini terlebih dahulu",
              body: "Lakukan pemeriksaan read-only untuk memastikan dampak perubahan atau penghapusan benar-benar sesuai permintaan.",
            },
            {
              title: "Verifikasi hasil pada objek yang sama",
              body: "Setelah menyimpan perubahan, periksa ulang status terbaru dan catat bila ada kegagalan atau keterbatasan verifikasi.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Jangan salin kredensial atau data pribadi ke catatan",
              body: "Jangan pernah menyalin token sesi, API key, kredensial, atau data pribadi ke instruksi agen maupun log operasional. Selalu gunakan alur autentikasi resmi.",
            },
          ],
        },
        {
          title: "Memilih workflow MCP authoring",
          paragraphs: [
            "Pemilihan mata kuliah dan bab mengunci cakupan workflow yang berjalan. Selalu pakai referensi dan ID dari katalog MCP, bukan menebak ID atau kunci penyimpanan. Koneksi MCP mengikuti sesi admin aktif; jika sesi habis atau peran berubah, lakukan autentikasi ulang.",
          ],
          table: {
            caption: "Ringkasan workflow MCP dan status penerbitannya",
            headers: ["Workflow", "Kegunaan", "Status setelah submit MCP"],
            rows: [
              ["`idea_product`", "Source Pack, Idea Bundle, Artikel, dan Diktat", "Masuk ke review dan publikasi admin (tidak langsung terbit)."],
              ["`quiz_bank`", "Soal original Zyx untuk bank soal", "Tersimpan sebagai `draft` untuk ditinjau di Zyx Admin."],
              ["`reference_question_ingest`", "Impor soal referensi historis dari PDF", "Langsung tersimpan sebagai `published` dan tidak dapat diubah."],
            ],
          },
        },
      ],
    },
    en: {
      category: "Operations",
      title: "Operational checks and safe changes",
      summary: "Verify target environments read-only before mutating data, protect credentials, and pick the right MCP workflow.",
      keywords: ["operations", "agent", "mcp", "staging", "production", "verification", "security"],
      quickLinks: [
        { label: "Ops monitor", href: "/admin/ops", description: "Monitor operational health and background jobs." },
      ],
      sections: [
        {
          title: "Pre-change verification checklist",
          steps: [
            {
              title: "Confirm environment and target object",
              body: "Verify whether you are working in `staging` or `production`, and confirm the exact course, chapter, group, or user record.",
            },
            {
              title: "Inspect current state read-only",
              body: "Read the existing record first so the mutation or deletion scope matches the request with zero surprises.",
            },
            {
              title: "Re-verify after writing",
              body: "Reload the target object after saving and record any partial failures or verification limits clearly.",
            },
          ],
          callouts: [
            {
              variant: "danger",
              title: "Never paste credentials or personal data into prompts or logs",
              body: "Keep session tokens, API keys, secrets, and personal data out of agent instructions and operational notes. Use the built-in auth flows.",
            },
          ],
        },
        {
          title: "Choosing an MCP authoring workflow",
          paragraphs: [
            "Selecting a course and chapter locks the workflow scope. Always use IDs returned by MCP rather than guessing slugs or storage keys. MCP sessions follow your active admin session; re-authenticate if your session expires or roles change.",
          ],
          table: {
            caption: "MCP workflows and publication behavior",
            headers: ["Workflow", "Purpose", "State after MCP submit"],
            rows: [
              ["`idea_product`", "Source Packs, Idea Bundles, Articles, and Diktat", "Enters admin review and release queue (not auto-published)."],
              ["`quiz_bank`", "Original Zyx questions", "Saved as `draft` for admin review and publishing."],
              ["`reference_question_ingest`", "Historical reference question imports from PDF", "Saved directly as immutable `published` records."],
            ],
          },
        },
      ],
    },
  },
];
