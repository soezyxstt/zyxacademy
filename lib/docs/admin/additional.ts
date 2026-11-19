import type { BilingualDocEntry } from "../types";

export const adminAdditionalDocs: BilingualDocEntry[] = [
  {
    slug: "jadwal-tutorial",
    id: {
      category: "Operasional",
      title: "Jadwal tutorial dan sesi belajar",
      summary: "Pantau ketersediaan tutor, pemesanan kelompok, pengecualian admin, dan berkas sesi tutorial.",
      keywords: ["jadwal", "tutor", "kelompok", "slot", "meet", "kuota", "audit"],
      quickLinks: [
        { label: "Jadwal umum", href: "/admin/schedules", description: "Pantau slot tutorial, cakupan tutor, dan jadwal akademik." },
      ],
      sections: [
        {
          title: "Memantau jadwal dan cakupan tutor",
          diagram: "tutorial-schedule-lifecycle",
          steps: [
            {
              title: "Buka mode Tutorial",
              body: "Masuk ke [Jadwal umum](/admin/schedules) lalu pilih mode **Tutorial** untuk melihat ketersediaan slot, sesi terpesan, dan cakupan mingguan tutor.",
            },
            {
              title: "Evaluasi ketersediaan slot",
              body: "Periksa tutor, tanggal, jumlah slot dibuka, sesi terpesan, dan sisa ketersediaan sebelum menindaklanjuti kekurangan jadwal.",
            },
            {
              title: "Atur penugasan mata kuliah tutor",
              body: "Pada tab **Tutor**, atur mata kuliah yang boleh diajar masing-masing tutor sesuai penugasan aktif.",
            },
          ],
          paragraphs: [
            "Setiap slot tutorial berdurasi **90 menit** dan wajib memiliki tanggal. Slot lama tanpa tanggal tidak dapat dipesan dan tidak masuk hitungan cakupan mingguan. Untuk jadwal ujian, tryout, atau kuis, gunakan mode **Akademik**.",
          ],
        },
        {
          title: "Pemesanan, tiket, dan pengecualian admin",
          paragraphs: [
            "Anggota kelompok dapat memesan atau memindahkan sesi sebelum waktu mulai (zona waktu `Asia/Jakarta`). Setiap pemesanan memakai satu sesi paket. Pembatalan langsung oleh murid mengembalikan sesi sekali, sedangkan pembatalan lewat tiket setelah penguncian tidak mengembalikan kuota minggu tersebut.",
            "Sesi daring otomatis memperoleh ruang Google Meet saat dipesan, dipindahkan, atau tiket perubahan jadwal disetujui. Sesi luring memerlukan lokasi. Tutor yang ditugaskan berwenang menyetujui tiket perubahan jadwal.",
          ],
          steps: [
            {
              title: "Gunakan tindakan pengecualian bila perlu",
              body: "Admin dapat membuat ketersediaan, menugaskan kelompok, memindahkan sesi, atau membatalkannya langsung dari [Jadwal umum](/admin/schedules).",
            },
            {
              title: "Isi alasan untuk log audit",
              body: "Periksa tutor, kelompok, dan waktu lalu cantumkan alasan. Sistem mencatat pelaku, tindakan, alasan, kondisi sebelum/sesudah, dan waktunya.",
            },
            {
              title: "Buat ulang tautan Meet jika belum muncul",
              body: "Jika sesi daring belum memiliki tautan Google Meet, jalankan tindakan pembuatan tautan Meet yang tersedia lalu periksa hasilnya.",
            },
          ],
        },
        {
          title: "Berkas dan catatan sesi",
          paragraphs: [
            "Bahan persiapan sebelum sesi dan catatan setelah sesi tersimpan berdasarkan ID pemesanan. Unggahan menerima `PDF`, `PNG`, `JPG`, atau `WebP` hingga **10 MB**. Halaman detail sesi menampilkan bahan, tautan Meet, ringkasan tutor, rekaman, dan riwayat terkait.",
          ],
        },
      ],
    },
    en: {
      category: "Operations",
      title: "Tutorial schedules and study sessions",
      summary: "Monitor tutor availability, group bookings, admin overrides, and session attachments.",
      keywords: ["schedule", "tutor", "group", "slot", "meet", "quota", "audit"],
      quickLinks: [
        { label: "Shared schedule", href: "/admin/schedules", description: "Track tutorial slots, tutor coverage, and academic dates." },
      ],
      sections: [
        {
          title: "Monitoring schedule coverage",
          diagram: "tutorial-schedule-lifecycle",
          steps: [
            {
              title: "Switch to Tutorial mode",
              body: "Open [Shared schedule](/admin/schedules) and select **Tutorial** mode to inspect open slots, booked sessions, and weekly tutor coverage.",
            },
            {
              title: "Audit weekly capacity",
              body: "Review tutor names, dates, open slots, booked sessions, and remaining availability before addressing gaps.",
            },
            {
              title: "Assign tutor courses",
              body: "In the **Tutor** tab, configure which courses each tutor is authorized to teach.",
            },
          ],
          paragraphs: [
            "Every tutorial slot lasts **90 minutes** and requires an explicit calendar date. Legacy undated slots cannot be booked and are excluded from weekly coverage. Use **Academic** mode for exams, tryouts, and quizzes.",
          ],
        },
        {
          title: "Bookings, tickets, and admin overrides",
          paragraphs: [
            "Group members can book or move sessions before the start time (`Asia/Jakarta`). Each booking consumes one package session. Self-service student cancellation refunds a session once, while ticket-based cancellation after lock does not refund that week's quota.",
            "Online sessions automatically receive a Google Meet link when booked, moved, or rescheduled via an approved ticket. In-person sessions require a location. The assigned tutor can approve reschedule tickets.",
          ],
          steps: [
            {
              title: "Use admin overrides when needed",
              body: "Admins can create availability, assign groups, move sessions, or cancel bookings from [Shared schedule](/admin/schedules).",
            },
            {
              title: "Record a clear audit reason",
              body: "Verify tutor, group, and time, then enter a reason. The system logs actor, action, reason, before/after state, and timestamp.",
            },
            {
              title: "Generate missing Meet links",
              body: "If an online session is missing a Meet link, run the missing-link generator in the admin dashboard and confirm the link appears.",
            },
          ],
        },
        {
          title: "Session files and notes",
          paragraphs: [
            "Pre-session materials and post-session notes are bound to the booking ID. Supported uploads are `PDF`, `PNG`, `JPG`, and `WebP` up to **10 MB**. The session detail view shows files, Meet links, tutor summaries, recordings, and audit history.",
          ],
        },
      ],
    },
  },
  {
    slug: "meet-studio",
    id: {
      category: "Komunikasi",
      title: "Membuat ruang Meet",
      summary: "Buat ruang Google Meet dengan slug ringkas, atur mode akses peserta, dan periksa peringatan hak akses.",
      keywords: ["meet", "ruang", "slug", "akses", "host", "cohost", "undangan"],
      quickLinks: [
        { label: "Meet Studio", href: "/admin/meet", description: "Buat dan kelola ruang Google Meet." },
      ],
      sections: [
        {
          title: "Membuat ruang dan memilih mode akses",
          diagram: "meet-access-modes",
          steps: [
            {
              title: "Isi judul dan periksa slug",
              body: "Buka [Meet Studio](/admin/meet) lalu masukkan judul ruang. Slug otomatis disarankan dari judul dan bisa Anda ubah sebelum ruang dibuat.",
            },
            {
              title: "Pilih mode akses",
              body: "Tentukan mode akses (`Open`, `Trusted`, atau `Restricted`). Untuk mode `Trusted` atau `Restricted`, pilih peserta berdasarkan peran atau mata kuliah.",
            },
            {
              title: "Buat ruang dan periksa peringatan akses",
              body: "Setelah ruang dibuat, periksa apakah ada peringatan pemberian hak akses sebelum membagikan tautan `/f/{slug}` kepada peserta.",
            },
          ],
          paragraphs: [
            "Slug Meet berbagi ruang nama `/f/{slug}` dengan Form Studio. Sistem memeriksa ketersediaan slug agar tidak bentrok dengan Meet atau formulir aktif. Akun Google yang terhubung menjadi penyelenggara, sedangkan pembuat ruang dan admin aktif diajukan sebagai co-host.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Tindak lanjuti peringatan pemberian akses",
              body: "Jika Google gagal menambahkan sebagian peserta atau co-host, sistem menampilkan peringatan. Jangan berasumsi semua undangan berhasil tanpa memeriksa daftar penerima sebelum sesi penting dimulai.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Communication",
      title: "Creating Meet rooms",
      summary: "Create Google Meet rooms with clean short slugs, configure access modes, and verify invite warnings.",
      keywords: ["meet", "room", "slug", "access", "host", "cohost", "invite"],
      quickLinks: [
        { label: "Meet Studio", href: "/admin/meet", description: "Create and manage Google Meet rooms." },
      ],
      sections: [
        {
          title: "Creating a room and access modes",
          diagram: "meet-access-modes",
          steps: [
            {
              title: "Enter a title and review the slug",
              body: "Open [Meet Studio](/admin/meet) and enter the room title. A slug is suggested automatically and can be edited before creating.",
            },
            {
              title: "Choose an access mode",
              body: "Select `Open`, `Trusted`, or `Restricted`. For `Trusted` or `Restricted`, choose participants by role or course.",
            },
            {
              title: "Create and verify permissions",
              body: "Check for any access-grant warnings before sharing `/f/{slug}` with participants.",
            },
          ],
          paragraphs: [
            "Meet slugs share the `/f/{slug}` namespace with Form Studio, and the system checks for conflicts with active rooms and forms. The connected Google account acts as organizer while the creator and active admins are added as co-hosts.",
          ],
          callouts: [
            {
              variant: "warning",
              title: "Always review access-grant warnings",
              body: "If adding any participant or co-host fails, the UI displays a warning. Verify the recipient list before important sessions instead of assuming every invite succeeded.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "tutorial-pka",
    id: {
      category: "Operasional",
      title: "Operasional Tutorial PKA",
      summary: "Kelola pendaftar, jadwal sesi pembahasan, dan pengumuman kampanye Tutorial PKA.",
      keywords: ["pka", "pendaftaran", "simulasi", "jadwal", "pengumuman", "meet"],
      quickLinks: [
        { label: "Pendaftar PKA", href: "/admin/tutorial-pka/registrations", description: "Tinjau data peserta terdaftar." },
        { label: "Jadwal Live PKA", href: "/admin/tutorial-pka/schedules", description: "Atur jadwal sesi dan tautan Meet." },
        { label: "Pengumuman PKA", href: "/admin/tutorial-pka/announcements", description: "Kelola pengumuman untuk peserta PKA." },
      ],
      sections: [
        {
          title: "Pendaftaran dan simulasi",
          steps: [
            {
              title: "Periksa data pendaftar",
              body: "Buka [Pendaftar PKA](/admin/tutorial-pka/registrations) untuk memverifikasi status peserta sebelum menindaklanjuti kendala atau pengumuman.",
            },
          ],
          paragraphs: [
            "Tutorial PKA memakai mata kuliah khusus dengan ID `tutorial-pka` yang memetakan kuis simulasi Matematika, Fisika, dan Kimia. Jangan mengubah ID tersebut saat pengelolaan rutin.",
          ],
          callouts: [
            {
              variant: "info",
              title: "Batas informasi simulasi PKA",
              body: "Simulasi PKA di Zyx adalah latihan persiapan, bukan hasil resmi PKA ITB. Jangan menyampaikan skor latihan maupun perkiraan tanggal ujian sebagai keputusan resmi.",
            },
          ],
        },
        {
          title: "Jadwal pembahasan dan pengumuman",
          steps: [
            {
              title: "Atur jadwal sesi live",
              body: "Buka [Jadwal Live PKA](/admin/tutorial-pka/schedules), isi judul dan waktu sesi sesuai zona perangkat, lalu tambahkan tautan Meet bila tersedia.",
            },
            {
              title: "Kelola pengumuman peserta",
              body: "Gunakan [Pengumuman PKA](/admin/tutorial-pka/announcements) untuk menyampaikan pembaruan. Periksa sasaran dan isi pesan sebelum dikirim.",
            },
          ],
          paragraphs: [
            "Jadwal mendatang dapat memicu pemberitahuan otomatis. Pengiriman email mengikuti preferensi email opsional peserta, sedangkan push notification memakai pengaturan tersendiri.",
          ],
        },
      ],
    },
    en: {
      category: "Operations",
      title: "Tutorial PKA operations",
      summary: "Manage registrations, live discussion schedules, and announcements for the Tutorial PKA campaign.",
      keywords: ["pka", "registration", "simulation", "schedule", "announcement", "meet"],
      quickLinks: [
        { label: "PKA registrations", href: "/admin/tutorial-pka/registrations", description: "Review registered participants." },
        { label: "PKA live schedule", href: "/admin/tutorial-pka/schedules", description: "Manage live sessions and Meet links." },
        { label: "PKA announcements", href: "/admin/tutorial-pka/announcements", description: "Publish updates to PKA participants." },
      ],
      sections: [
        {
          title: "Registrations and simulations",
          steps: [
            {
              title: "Verify participant records",
              body: "Open [PKA registrations](/admin/tutorial-pka/registrations) to inspect registration details before following up.",
            },
          ],
          paragraphs: [
            "Tutorial PKA uses a dedicated course with ID `tutorial-pka` mapping Mathematics, Physics, and Chemistry simulation quizzes. Never change this ID during routine maintenance.",
          ],
          callouts: [
            {
              variant: "info",
              title: "Simulation scope disclaimer",
              body: "Zyx PKA simulations are practice exercises, not official PKA ITB results. Never present practice scores or estimated exam dates as official decisions.",
            },
          ],
        },
        {
          title: "Live schedules and announcements",
          steps: [
            {
              title: "Publish live session schedules",
              body: "Open [PKA live schedule](/admin/tutorial-pka/schedules), enter the title and session time in your device timezone, and attach a Meet link if ready.",
            },
            {
              title: "Send announcements",
              body: "Use [PKA announcements](/admin/tutorial-pka/announcements) to publish updates after verifying audience and content.",
            },
          ],
          paragraphs: [
            "Upcoming schedules can trigger automatic notifications. Email delivery respects each participant's optional email preference, while push notifications follow separate device permissions.",
          ],
        },
      ],
    },
  },
  {
    slug: "formulir-dan-respons",
    id: {
      category: "Komunikasi",
      title: "Formulir dan respons",
      summary: "Susun formulir dengan aturan penerimaan yang tepat, bagikan lewat `/f/{slug}`, dan ekspor respons ke spreadsheet.",
      keywords: ["form", "formulir", "respons", "slug", "jadwal", "spreadsheet", "ekspor"],
      quickLinks: [
        { label: "Form Studio", href: "/admin/forms", description: "Buat formulir, tinjau respons, dan ekspor ke Google Sheets." },
      ],
      sections: [
        {
          title: "Menyiapkan dan menerbitkan formulir",
          steps: [
            {
              title: "Buat formulir atau mulai dari preset",
              body: "Buka [Form Studio](/admin/forms), isi judul, daftar pertanyaan, dan pengaturannya. Gunakan preset hanya jika susunan pertanyaan memang sesuai kebutuhan.",
            },
            {
              title: "Periksa aturan penerimaan respons",
              body: "Cek pengumpulan email, status penerimaan respons, jadwal buka/tutup, izin sunting jawaban, dan batas jumlah respons sebelum terbit.",
            },
            {
              title: "Pratinjau dan bagikan tautan",
              body: "Pastikan slug tidak bentrok dengan Meet atau formulir lain, cek pratinjau, lalu bagikan `/f/{slug}` ke responden.",
            },
          ],
          paragraphs: [
            "Jadwal buka dan tutup diisi mengikuti zona waktu perangkat lalu disimpan sistem sebagai waktu absolut. Unggahan berkas responden disimpan terstruktur berdasarkan formulir dan nomor pertanyaan dengan penanda waktu serta hash otomatis.",
          ],
        },
        {
          title: "Mengelola respons dan ekspor spreadsheet",
          steps: [
            {
              title: "Tinjau ringkasan dan tutup bila selesai",
              body: "Buka halaman detail formulir di [Form Studio](/admin/forms) untuk memantau respons atau menutup penerimaan jawaban.",
            },
            {
              title: "Ekspor ke Google Sheets",
              body: "Jalankan ekspor spreadsheet dari halaman detail. Jika muncul peringatan konflik, periksa suntingan manual pada sheet sebelum mengonfirmasi penimpaan.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Lokasi dan blok data spreadsheet",
              body: "Ekspor disimpan pada folder `forms/{slug}` dengan nama `form-{slug}-responses`. Blok data milik aplikasi dimulai dari sel `A1`, sehingga perubahan manual di dalam blok tersebut dapat memicu konflik saat sinkronisasi ulang. Baris pemisah bagian tidak ikut menjadi kolom pertanyaan.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Communication",
      title: "Forms and responses",
      summary: "Build forms with clear submission rules, share via `/f/{slug}`, and sync responses to Google Sheets.",
      keywords: ["form", "response", "slug", "schedule", "spreadsheet", "export"],
      quickLinks: [
        { label: "Form Studio", href: "/admin/forms", description: "Build forms, inspect responses, and export to Google Sheets." },
      ],
      sections: [
        {
          title: "Building and publishing a form",
          steps: [
            {
              title: "Create a form or apply a preset",
              body: "Open [Form Studio](/admin/forms), add a title, questions, and settings. Use a preset only when its structure matches your use case.",
            },
            {
              title: "Check submission rules",
              body: "Verify email collection, response acceptance, open/close schedule, edit permissions, and response caps before publishing.",
            },
            {
              title: "Preview and share",
              body: "Confirm the slug does not collide with active Meet rooms or forms, preview the layout, and share `/f/{slug}`.",
            },
          ],
          paragraphs: [
            "Open and close schedules use your local timezone on input and are stored as absolute timestamps. File uploads from respondents are stored automatically per form and question number with a timestamp and hash.",
          ],
        },
        {
          title: "Managing responses and spreadsheet export",
          steps: [
            {
              title: "Review responses and close when done",
              body: "Open the form detail view in [Form Studio](/admin/forms) to inspect summaries or toggle response acceptance.",
            },
            {
              title: "Export to Google Sheets",
              body: "Trigger spreadsheet export from the detail page. If a conflict warning appears, review manual sheet edits before confirming overwrite.",
            },
          ],
          callouts: [
            {
              variant: "info",
              title: "Spreadsheet folder and owned data block",
              body: "Exports live in `forms/{slug}` as `form-{slug}-responses`. The app owns the data block starting at `A1`, so manual edits inside that block trigger conflict protection. Section dividers are excluded from exported question columns.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "media-library",
    id: {
      category: "Konten",
      title: "Pustaka media dan penamaan berkas",
      summary: "Susun aset bersama dalam folder yang rapi dengan nama berkas deskriptif agar mudah ditemukan kembali.",
      keywords: ["media", "gambar", "video", "audio", "file", "folder", "penamaan", "pustaka"],
      quickLinks: [
        { label: "Pustaka media", href: "/admin/media", description: "Unggah, pratinjau, dan kelola folder media bersama." },
      ],
      sections: [
        {
          title: "Menyusun folder dan mengunggah aset",
          steps: [
            {
              title: "Pilih atau buat folder tujuan",
              body: "Buka [Pustaka media](/admin/media) lalu masuk ke folder yang sesuai dengan jenis konten.",
            },
            {
              title: "Gunakan nama berkas yang deskriptif",
              body: "Sebelum mengunggah, beri nama ringkas yang menjelaskan isi aset dan pertahankan ekstensi aslinya.",
            },
            {
              title: "Periksa pratinjau sebelum dipakai",
              body: "Gunakan fitur pratinjau (mendukung gambar, video, audio, PDF, Markdown, dan teks) untuk memastikan aset tampil benar sebelum disematkan ke konten.",
            },
          ],
          codeBlocks: [
            {
              label: "Contoh nama berkas operasional yang rapi",
              code: `pembahasan-limit-pertemuan-01.mp4
diagram-rangkaian-seri.png`,
            },
          ],
          paragraphs: [
            "Media bersama disimpan menggunakan pola `media/{folder}/{filename}` melalui jalur unggah resmi. Jangan meminta agen menyusun atau mengubah kunci penyimpanan secara langsung.",
          ],
        },
        {
          title: "Memindahkan, mengganti, atau menghapus berkas",
          callouts: [
            {
              variant: "warning",
              title: "Cek referensi konten sebelum memindahkan atau menghapus",
              body: "Pustaka media mendukung pindah, salin, ganti nama/isi, unduh, dan hapus. Karena artikel atau halaman lain dapat merujuk ke URL berkas tersebut, pastikan tidak ada konten aktif yang bergantung padanya sebelum mengubah lokasi atau menghapusnya.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Content",
      title: "Media library and file naming",
      summary: "Organize shared assets into clear folders with descriptive filenames so the team can find and reuse them easily.",
      keywords: ["media", "image", "video", "audio", "file", "folder", "naming", "library"],
      quickLinks: [
        { label: "Media library", href: "/admin/media", description: "Upload, preview, and organize shared media folders." },
      ],
      sections: [
        {
          title: "Organizing folders and uploading assets",
          steps: [
            {
              title: "Select or create a folder",
              body: "Open [Media library](/admin/media) and navigate to the appropriate folder.",
            },
            {
              title: "Name files descriptively",
              body: "Rename files concisely to describe their contents while keeping the original file extension.",
            },
            {
              title: "Verify via preview before sharing",
              body: "Check the built-in preview (images, video, audio, PDF, Markdown, and text) before embedding the asset.",
            },
          ],
          codeBlocks: [
            {
              label: "Recommended operational filenames",
              code: `pembahasan-limit-pertemuan-01.mp4
diagram-rangkaian-seri.png`,
            },
          ],
          paragraphs: [
            "Shared media uses the `media/{folder}/{filename}` convention through the official upload flow. Never ask agents to construct or modify raw storage keys directly.",
          ],
        },
        {
          title: "Moving, replacing, or deleting files",
          callouts: [
            {
              variant: "warning",
              title: "Check active references before moving or deleting",
              body: "Media library supports move, copy, rename/replace, download, and delete. Verify no live articles or pages reference the asset URL before moving or deleting it.",
            },
          ],
        },
      ],
    },
  },
  {
    slug: "blog-dan-tautan",
    id: {
      category: "Komunikasi",
      title: "Blog dan tautan publik",
      summary: "Terbitkan artikel blog, kurasi daftar tautan publik di `/tautan`, dan kelola tautan pendek `/s/{slug}` beserta QR.",
      keywords: ["blog", "artikel", "tautan", "slug", "publikasi", "link", "qr", "short link"],
      quickLinks: [
        { label: "Blog", href: "/admin/blog", description: "Tulis, sunting, dan terbitkan artikel blog." },
        { label: "Tautan publik", href: "/admin/tautan", description: "Kelola daftar tautan pilihan di /tautan." },
        { label: "Short Links", href: "/admin/ops/short-links", description: "Buat tautan pendek /s/{slug} dan kode QR." },
      ],
      sections: [
        {
          title: "Menerbitkan artikel blog",
          steps: [
            {
              title: "Susun draf dan lengkapi metadata",
              body: "Buka [Blog](/admin/blog) untuk membuat atau mengedit artikel. Lengkapi judul, isi, kategori, dan ringkasan yang sudah diperiksa.",
            },
            {
              title: "Terbitkan saat seluruh aset siap",
              body: "Simpan sebagai `draft` selama masih ditinjau, lalu ubah ke status terbit setelah isi dan gambarnya siap dibaca publik.",
            },
          ],
          callouts: [
            {
              variant: "warning",
              title: "Mengubah judul dapat mengubah slug URL",
              body: "Sistem membentuk slug dari judul artikel dan menghitung ulang slug saat judul diubah lalu disimpan. Jika artikel sudah dibagikan, periksa dan perbarui tautan yang terlanjur tersebar. Jika ringkasan dikosongkan, sistem membuat ringkasan otomatis; tulis sendiri bila redaksinya harus pasti.",
            },
          ],
        },
        {
          title: "Tautan pilihan dan tautan pendek",
          steps: [
            {
              title: "Kelola halaman /tautan",
              body: "Buka [Tautan publik](/admin/tautan) untuk mengatur judul, URL, kategori, urutan, dan status aktif. Hanya tautan berstatus aktif yang tampil di `/tautan`.",
            },
            {
              title: "Buat tautan pendek dan QR",
              body: "Buka [Short Links](/admin/ops/short-links), isi URL tujuan dan slug ringkas, lalu simpan. Uji tujuan `/s/{slug}` sebelum dibagikan; kode QR dapat langsung dibuat dari daftar.",
            },
          ],
        },
      ],
    },
    en: {
      category: "Communication",
      title: "Blog and public links",
      summary: "Publish blog articles, curate public links on `/tautan`, and create `/s/{slug}` short links with QR codes.",
      keywords: ["blog", "article", "links", "slug", "publish", "qr", "short link"],
      quickLinks: [
        { label: "Blog", href: "/admin/blog", description: "Draft, edit, and publish blog articles." },
        { label: "Public links", href: "/admin/tautan", description: "Manage featured links shown on /tautan." },
        { label: "Short links", href: "/admin/ops/short-links", description: "Create /s/{slug} short links and QR codes." },
      ],
      sections: [
        {
          title: "Publishing blog articles",
          steps: [
            {
              title: "Draft and review metadata",
              body: "Open [Blog](/admin/blog) to create or edit an article. Fill in the title, body, category, and reviewed summary.",
            },
            {
              title: "Publish when assets are ready",
              body: "Keep articles in `draft` during review and switch to published once text and media are verified.",
            },
          ],
          callouts: [
            {
              variant: "warning",
              title: "Renaming a title recalculates its slug",
              body: "Slugs are generated from the article title and recalculated when the title is updated and saved. Check and update any shared links after renaming. If the summary is left blank, the system generates a fallback excerpt; write one manually when exact copy matters.",
            },
          ],
        },
        {
          title: "Public links and short links",
          steps: [
            {
              title: "Curate /tautan",
              body: "Open [Public links](/admin/tautan) to manage titles, URLs, categories, ordering, and active status. Only active items appear on `/tautan`.",
            },
            {
              title: "Create short links and QR codes",
              body: "Open [Short links](/admin/ops/short-links), enter the destination URL and slug, and save. Test `/s/{slug}` before sharing; QR codes can be generated directly from the list.",
            },
          ],
        },
      ],
    },
  },
];
