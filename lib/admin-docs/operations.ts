import type { AdminDoc } from "./types";

export const operationsDocs: AdminDoc[] = [
  {
    slug: "token-aktivasi",
    category: "Akses dan pengguna",
    title: "Token aktivasi dan akses kelompok",
    summary: "Buat token sesuai mata kuliah, kapasitas, dan masa akses yang disepakati.",
    keywords: ["token", "aktivasi", "kapasitas", "kedaluwarsa", "akses"],
    sections: [
      {
        title: "Sebelum membuat token",
        paragraphs: ["Token menghubungkan murid ke kelompok dan mata kuliah yang dipilih. Sebelum membuatnya, pastikan mata kuliah, kapasitas kelompok, kuota pertemuan, dan masa berlaku sesuai kesepakatan.", "Kapasitas harus berupa bilangan bulat dari 1 sampai 1000. Pilih kapasitas sesuai kebutuhan, bukan otomatis memakai batas maksimum."],
        steps: ["Buka /admin/tokens dan pilih pembuatan token.", "Pilih mata kuliah, kapasitas, serta paket atau kuota sesuai kebutuhan. Periksa kembali sebelum menyimpan.", "Salin token yang dihasilkan kepada pihak yang berhak. Periksa anggota dan status token setelah aktivasi."],
        examples: ["Format token: Zyx-XXXXXXXX-{kapasitas}-{jumlah mata kuliah}. Bagian acak dibuat oleh sistem, bukan ditentukan manual. Kedaluwarsa dihitung sistem dari akhir semester saat token dibuat."],
      },
      {
        title: "Memeriksa dan mencabut",
        paragraphs: ["Jika aktivasi gagal, periksa status, tanggal kedaluwarsa, kapasitas tersisa, mata kuliah, dan akun yang digunakan sebelum membuat token baru.", "Menghapus token melalui halaman admin juga menghapus kelompok yang terhubung. Sebelum melanjutkan, periksa anggota dan dampaknya pada kelompok. Jangan bagikan token melalui dokumen atau kanal publik."],
      },
    ],
  },
  {
    slug: "pengguna-dan-kelompok",
    category: "Akses dan pengguna",
    title: "Pengguna dan kelompok belajar",
    summary: "Kelola peran, keanggotaan, paket, dan mata kuliah kelompok.",
    keywords: ["pengguna", "peran", "admin", "tutor", "murid", "kelompok", "anggota"],
    sections: [
      {
        title: "Mengubah peran pengguna",
        steps: ["Buka /admin/users dan temukan akun yang benar berdasarkan identitas yang tersedia.", "Pilih peran yang diperlukan dan simpan. Periksa kembali daftar peran setelah perubahan."],
        paragraphs: ["Pengguna harus memiliki sekurangnya satu peran. Admin tidak dapat mencabut peran admin dari akunnya sendiri. Berikan hak sesuai tugas, terutama akses admin."],
      },
      {
        title: "Mengelola kelompok",
        steps: ["Buka /admin/groups. Saat membuat atau mengubah kelompok, periksa paket, tanggal semester, dan mata kuliah yang terkait.", "Buka detail kelompok untuk memeriksa anggota, pemimpin, token terkait, penggunaan kuota mingguan, dan riwayat sesi.", "Tambahkan atau keluarkan anggota dan tetapkan pemimpin sesuai kebutuhan. Periksa kembali nama kelompok dan akun sebelum menyimpan."],
        paragraphs: ["Paket reguler, intensif, dan super intensif masing-masing memiliki 15, 30, dan 45 sesi per semester dengan jatah mingguan 1, 2, dan 3 sesi. Paket kustom memakai total dan jatah mingguan yang ditentukan admin.", "Menghapus anggota atau kelompok mengubah hubungan keanggotaan. Periksa anggota, token, dan jadwal yang terkait sebelum melakukan tindakan tersebut."],
      },
    ],
  },
  {
    slug: "kelola-kuis",
    category: "Penilaian",
    title: "Membuat dan memeriksa kuis",
    summary: "Siapkan cakupan, soal, waktu, dan penilaian sebelum kuis dipublikasikan.",
    keywords: ["kuis", "soal", "penilaian", "essay", "waktu", "publikasi"],
    sections: [
      {
        title: "Siapkan kuis",
        steps: ["Buka /admin/courses, pilih mata kuliah, lalu buka Kuis.", "Buat atau edit kuis dan pilih cakupan bab serta soalnya. Periksa judul, instruksi, dan pengaturan waktu.", "Tinjau soal dan kunci jawaban sebelum menerbitkan kuis."],
        paragraphs: ["Kuis memiliki cakupan tepat satu bab. Tryout dapat mencakup satu atau beberapa bab.", "Batas waktu total menentukan akhir sesi dan mengirim jawaban otomatis saat habis. Timer per soal membantu mengatur tempo dan berpindah ke soal berikutnya, bukan mengakhiri kuis selama waktu total masih tersedia. Jika keduanya aktif, jumlah waktu per soal harus sama dengan batas total."],
      },
      {
        title: "Periksa hasil dan esai",
        paragraphs: ["Jawaban objektif yang memenuhi syarat dinilai otomatis. Percobaan dengan soal esai menunggu penilaian, sehingga nilai akhir dan analitik belum ditampilkan kepada murid sampai seluruh esai ditinjau.", "Gunakan halaman hasil dan analitik pada workspace mata kuliah yang sama. Periksa mata kuliah, kuis, dan percobaan sebelum menindaklanjuti hasil."],
      },
    ],
  },
  {
    slug: "notifikasi",
    category: "Komunikasi",
    title: "Mengirim dan memeriksa notifikasi",
    summary: "Kirim pengumuman kepada penerima yang tepat dan periksa hasil pengiriman.",
    keywords: ["notifikasi", "broadcast", "push", "pengumuman", "pengiriman"],
    sections: [
      {
        title: "Kirim pengumuman",
        steps: ["Buka /admin/notifications dan pilih penerima yang dimaksud.", "Tulis judul dan pesan yang jelas. Periksa penerima dan isi sebelum mengirim.", "Periksa riwayat setelah pengiriman, termasuk status dan jumlah keberhasilan atau kegagalan."],
        paragraphs: ["Notifikasi juga tersedia di kotak masuk aplikasi. Push bergantung pada perangkat dan izin pengguna, sehingga pengiriman push dan pesan yang sudah dibaca merupakan dua hal berbeda.", "Riwayat dapat menunjukkan Terkirim, Sebagian, Gagal, atau Tanpa perangkat. Jika tidak semua perangkat menerima push, periksa status tersebut dan gunakan kanal komunikasi lain bila pesan mendesak."],
      },
      {
        title: "Pemicu otomatis",
        paragraphs: ["Publikasi kuis, pengumuman dan perubahan jadwal PKA, serta broadcast admin dapat memicu push. Periksa status dan isi sebelum menerbitkan atau mengirim agar penerima tidak menerima pemberitahuan yang keliru."],
      },
    ],
  },
  {
    slug: "pemeriksaan-operasional",
    category: "Operasional",
    title: "Pemeriksaan dan perubahan operasional",
    summary: "Periksa target, dampak, dan hasil sebelum dan sesudah perubahan.",
    keywords: ["operasional", "agent", "mcp", "staging", "produksi", "verifikasi"],
    sections: [
      {
        title: "Sebelum melakukan perubahan",
        steps: ["Pastikan lingkungan dan objek yang dituju, termasuk mata kuliah, bab, kelompok, atau pengguna yang tepat.", "Baca kondisi saat ini terlebih dahulu. Pastikan tindakan dan dampaknya sesuai permintaan sebelum melakukan perubahan atau penghapusan.", "Setelah tindakan, periksa kembali status dan hasil pada objek yang sama. Catat kegagalan atau batas verifikasi secara jelas."],
        paragraphs: ["Jangan salin kredensial, token sesi, atau data pribadi ke instruksi agen maupun catatan operasional. Gunakan alur autentikasi dan izin yang tersedia."],
      },
      {
        title: "Menggunakan MCP authoring",
        paragraphs: ["Pilih workflow sesuai pekerjaan: idea_product, quiz_bank, atau reference_question_ingest. Pilihan mata kuliah dan bab mengunci cakupan workflow yang relevan. Gunakan pilihan dan referensi yang diberikan MCP, bukan menebak ID atau kunci penyimpanan.", "Idea Bundle dan Product Bundle masuk ke alur review dan publikasi admin, bukan diterbitkan langsung oleh MCP. Soal referensi historis yang lolos validasi menggunakan alur berbeda dan dapat langsung berstatus terbit. Periksa kontrak workflow sebelum mengirim hasil.", "Koneksi MCP terkait sesi admin aktif dan izin yang disetujui. Jika sesi berakhir atau peran berubah, lakukan autentikasi ulang melalui alur yang tersedia."],
      },
    ],
  },
];
