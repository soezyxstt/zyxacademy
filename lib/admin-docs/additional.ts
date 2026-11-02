import type { AdminDoc } from "./types";

export const additionalDocs: AdminDoc[] = [
  {
    slug: "jadwal-tutorial",
    category: "Operasional",
    title: "Jadwal tutorial dan sesi belajar",
    summary: "Pantau ketersediaan tutor, pemesanan kelompok, dan perubahan sesi.",
    keywords: ["jadwal", "tutor", "kelompok", "slot", "meet", "kuota", "audit"],
    sections: [
      {
        title: "Pantau jadwal",
        steps: ["Buka /admin/schedules dan pilih mode Tutorial untuk melihat ketersediaan, sesi yang dipesan, dan cakupan mingguan tutor.", "Periksa tutor, tanggal, jumlah slot yang dibuka, sesi terpesan, dan ketersediaan sebelum menindaklanjuti kekurangan jadwal.", "Pada tab Tutor, atur mata kuliah yang boleh diajar tutor sesuai penugasan."],
        paragraphs: ["Setiap slot tutorial berdurasi 90 menit dan memiliki tanggal. Ketersediaan lama tanpa tanggal tidak dapat dipesan dan tidak dihitung dalam cakupan mingguan.", "Gunakan mode Akademik untuk jadwal akademik seperti ujian, tryout, dan kuis. Mode Tutorial tidak membuat ujian resmi."],
      },
      {
        title: "Pemesanan dan pengecualian",
        paragraphs: ["Anggota kelompok dapat memesan atau memindahkan sesi sebelum waktu mulai menurut Asia/Jakarta. Pemesanan memakai satu sesi paket. Pembatalan oleh murid mengembalikan sesi sekali, sedangkan pembatalan melalui tiket setelah penguncian tidak mengembalikan kuota minggu tersebut.", "Sesi daring memperoleh ruang Google Meet saat dipesan, dipindahkan, atau perubahan jadwal melalui tiket disetujui. Sesi luring memerlukan lokasi. Tutor yang ditugaskan berwenang menyetujui tiket perubahan jadwal."],
        steps: ["Gunakan tindakan pengecualian admin jika perlu membuat ketersediaan, menugaskan kelompok, memindahkan sesi, atau membatalkannya.", "Isi alasan dan periksa tutor, kelompok, serta waktu sebelum menyimpan. Sistem mencatat pelaku, tindakan, alasan, kondisi sebelum dan sesudah, serta waktunya.", "Jika tautan Meet belum tersedia, gunakan tindakan pembuatan tautan yang hilang di dashboard admin, lalu periksa hasilnya."],
      },
      {
        title: "Berkas sesi",
        paragraphs: ["Bahan persiapan dan catatan setelah sesi terkait dengan ID pemesanan. Unggahan sesi menerima PDF, PNG, JPG, atau WebP hingga 10 MB. Detail sesi menampilkan bahan, tautan, ringkasan tutor, rekaman, dan riwayat yang tersedia."],
      },
    ],
  },
  {
    slug: "meet-studio",
    category: "Komunikasi",
    title: "Membuat ruang Meet",
    summary: "Buat ruang, pilih akses, dan periksa undangan sebelum membagikan tautan.",
    keywords: ["meet", "ruang", "slug", "akses", "host", "cohost", "undangan"],
    sections: [
      {
        title: "Buat ruang",
        steps: ["Buka /admin/meet dan isi judul ruang. Slug disarankan dari judul dan dapat disunting sebelum membuat ruang.", "Pilih jenis akses yang sesuai. Untuk akses Trusted atau Restricted, pilih pengguna berdasarkan peran atau mata kuliah sesuai kebutuhan.", "Buat ruang, periksa hasil dan peringatan pemberian akses, lalu bagikan tautan /f/{slug} kepada peserta yang sesuai."],
        paragraphs: ["Slug Meet berbagi ruang nama dengan Form Studio. Sebelum membuat ruang, sistem memeriksa apakah slug sudah dipakai oleh Meet atau formulir aktif. Pilih slug yang singkat dan menjelaskan tujuan ruang.", "Akun Google yang terhubung menjadi penyelenggara. Pembuat yang masuk dan admin aktif diajukan sebagai co-host. Jika pemberian hak gagal, sistem menampilkan peringatan. Periksa dan tindak lanjuti peringatan tersebut; jangan menganggap semua undangan berhasil."],
      },
      {
        title: "Memeriksa akses",
        paragraphs: ["Pengguna yang dipilih pada mode Trusted atau Restricted ditambahkan sebagai anggota ruang agar dapat bergabung tanpa mengetuk sesuai mode akses. Periksa daftar penerima dan akses aktual sebelum sesi penting."],
      },
    ],
  },
  {
    slug: "tutorial-pka",
    category: "Operasional",
    title: "Operasional Tutorial PKA",
    summary: "Kelola pendaftaran, jadwal pembahasan, dan pengumuman kampanye.",
    keywords: ["pka", "pendaftaran", "simulasi", "jadwal", "pengumuman", "meet"],
    sections: [
      {
        title: "Pendaftaran dan simulasi",
        steps: ["Buka Pendaftar PKA, Jadwal Live PKA, atau Pengumuman PKA dari navigasi admin sesuai pekerjaan yang akan dilakukan.", "Periksa data pendaftaran pada /admin/tutorial-pka/registrations sebelum menindaklanjuti peserta."],
        paragraphs: ["Tutorial PKA menggunakan mata kuliah khusus dengan ID tutorial-pka. Simulasi mencakup Matematika, Fisika, dan Kimia dengan pemetaan kuis. Jangan mengubah ID tersebut sebagai bagian dari pengelolaan rutin.", "Simulasi adalah latihan Zyx, bukan hasil resmi PKA ITB. Jangan menyampaikan hasil latihan atau perkiraan tanggal ujian sebagai keputusan maupun tanggal resmi."],
      },
      {
        title: "Jadwal dan pengumuman",
        steps: ["Buka /admin/tutorial-pka/schedules, isi judul dan waktu sesi, lalu tambahkan tautan Meet jika tersedia.", "Periksa waktu di zona perangkat sebelum menyimpan. Jadwal yang akan datang dapat memicu pemberitahuan, jadi pastikan judul, waktu, dan tautan benar sebelum membuatnya.", "Gunakan /admin/tutorial-pka/announcements untuk mengelola pengumuman. Periksa sasaran dan isi sebelum menyebarkan informasi."],
        paragraphs: ["Preferensi email opsional peserta memengaruhi pengiriman email Tutorial PKA. Pemberitahuan push memiliki pengaturan tersendiri."],
      },
    ],
  },
  {
    slug: "formulir-dan-respons",
    category: "Komunikasi",
    title: "Formulir dan respons",
    summary: "Terbitkan formulir dengan pengaturan respons yang tepat dan kelola ekspornya.",
    keywords: ["form", "formulir", "respons", "slug", "jadwal", "spreadsheet", "ekspor"],
    sections: [
      {
        title: "Siapkan dan terbitkan",
        steps: ["Buka /admin/forms, isi judul, pertanyaan, dan pengaturan. Gunakan preset jika susunan pertanyaan dan pengaturannya memang sesuai.", "Periksa pengumpulan email, penerimaan respons, jadwal buka dan tutup, penyuntingan jawaban, serta batas respons sebelum menerbitkan.", "Periksa slug dan pratinjau. Setelah diterbitkan, bagikan /f/{slug} kepada responden yang dituju."],
        paragraphs: ["Formulir dan Meet memakai jalur /f/{slug} yang sama. Gunakan slug yang menjelaskan tujuan formulir dan periksa apakah slug sudah dipakai sebelum publikasi. Isi jadwal sesuai zona waktu perangkat; sistem menyimpannya sebagai waktu absolut."],
      },
      {
        title: "Kelola respons dan ekspor",
        steps: ["Buka detail formulir untuk memeriksa ringkasan dan respons. Jika formulir perlu ditutup, ubah pengaturan penerimaan respons.", "Ekspor respons ke spreadsheet melalui halaman detail. Jika ada konflik, periksa perubahan manual sebelum mengonfirmasi penimpaan."],
        paragraphs: ["Ekspor spreadsheet menggunakan folder forms/{slug} dan nama form-{slug}-responses. Baris pemisah bagian tidak menjadi pertanyaan pada ekspor. Blok data aplikasi dimulai dari A1; perubahan manual di blok tersebut dapat menimbulkan konflik.", "Unggahan jawaban disimpan berdasarkan formulir dan nomor pertanyaan. Sistem menambahkan penanda waktu dan hash pada nama berkas. Admin tidak perlu menebak atau membuat kunci penyimpanan sendiri."],
      },
    ],
  },
  {
    slug: "media-library",
    category: "Konten",
    title: "Media Library dan penamaan berkas",
    summary: "Unggah dan susun media bersama dengan nama yang mudah dikenali.",
    keywords: ["media", "gambar", "video", "audio", "file", "folder", "r2", "penamaan"],
    sections: [
      {
        title: "Susun dan unggah",
        steps: ["Buka /admin/media dan pilih atau buat folder sesuai kebutuhan konten.", "Sebelum mengunggah, beri nama berkas yang menjelaskan isi dan tujuannya. Gunakan nama ringkas yang konsisten dan pertahankan ekstensi yang benar.", "Setelah mengunggah, periksa berkas dan foldernya melalui pratinjau yang tersedia sebelum membagikan atau memasangnya pada konten."],
        examples: ["Contoh nama operasional: pembahasan-limit-pertemuan-01.mp4 atau diagram-rangkaian-seri.png. Ini anjuran agar mudah ditemukan, bukan format wajib sistem."],
        paragraphs: ["Media bersama disimpan di R2 dengan pola media/{folder}/{filename}. Gunakan Media Library atau jalur unggah resmi agar sistem membentuk kunci penyimpanan. Jangan meminta agen menyusun atau mengubah kunci secara langsung."],
      },
      {
        title: "Memindahkan atau menghapus",
        paragraphs: ["Media Library mendukung pemindahan, penyalinan, penggantian nama dan isi, pengunduhan, serta penghapusan berkas atau folder. Sebelum memindahkan, mengganti, atau menghapus berkas, periksa penggunaannya dan tautan terkait karena konten lain mungkin merujuk ke lokasi tersebut.", "Pratinjau mendukung gambar, video, audio, PDF, Markdown, dan teks. Periksa pratinjau sebelum menggunakan berkas."],
      },
    ],
  },
  {
    slug: "blog-dan-tautan",
    category: "Komunikasi",
    title: "Blog dan tautan publik",
    summary: "Terbitkan artikel, kelola tautan pilihan, dan buat tautan pendek.",
    keywords: ["blog", "artikel", "tautan", "slug", "publikasi", "link", "qr"],
    sections: [
      {
        title: "Artikel blog",
        steps: ["Buka /admin/blog untuk membuat atau mengedit artikel. Isi judul, konten, kategori, dan ringkasan yang sudah diperiksa.", "Simpan sebagai draf selama artikel masih ditinjau. Pilih status terbit setelah isi dan aset siap untuk pembaca."],
        paragraphs: ["Sistem membuat slug dari judul dan menambahkan akhiran jika slug sudah dipakai. Saat judul diubah dan artikel disimpan, slug dihitung ulang sehingga tautan sebelumnya dapat berubah. Periksa dan perbarui tautan yang sudah dibagikan.", "Jika ringkasan dikosongkan, sistem mencoba membuatnya secara otomatis dan dapat memakai bagian awal konten sebagai cadangan. Jika redaksinya harus pasti, tulis dan periksa ringkasan sendiri."],
      },
      {
        title: "Tautan pilihan dan tautan pendek",
        steps: ["Buka /admin/tautan untuk mengelola judul, URL, kategori, urutan, dan status tautan pilihan. Hanya tautan aktif yang ditampilkan pada /tautan.", "Untuk tautan pendek, buka /admin/ops/short-links, isi URL tujuan dan slug, lalu buat tautan. Periksa tujuan sebelum membagikan /s/{slug}; QR dapat dibuat dari daftar."],
        paragraphs: ["Periksa URL tujuan dan status setelah perubahan. Gunakan judul yang membantu pengunjung memahami tujuan tautan."],
      },
    ],
  },
];
