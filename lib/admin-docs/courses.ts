import type { AdminDoc } from "./types";

export const courseDocs: AdminDoc[] = [
  {
    slug: "mata-kuliah-dan-bab",
    category: "Mata kuliah dan materi",
    title: "Menyiapkan mata kuliah dan bab",
    summary: "Tetapkan identitas mata kuliah dan urutan bab sebelum menambahkan materi.",
    keywords: ["course", "id", "slug", "nama", "kategori", "bab", "silabus"],
    sections: [
      {
        title: "Identitas mata kuliah",
        paragraphs: [
          "ID menjadi identitas sekaligus bagian dari alamat mata kuliah. Sistem menghapus spasi di awal dan akhir serta mengubah huruf menjadi kecil. ID hanya boleh berisi huruf a sampai z, angka, dan tanda hubung; ID tidak boleh kosong atau sudah terdaftar. Isi nama dan pilih kategori dari daftar yang tersedia.",
          "Gunakan kode mata kuliah resmi yang stabil sebagai ID jika tersedia, misalnya ma1101. Jika tidak ada, gunakan nama ringkas seperti kalkulus-1. Untuk judul, gunakan nama resmi yang mudah dikenali, misalnya Kalkulus IA. Periksa katalog lebih dulu agar tidak membuat mata kuliah yang sama dua kali.",
          "ID, nama tampilan, dan kode resmi memiliki fungsi berbeda. Saat memberi tugas kepada agen atau MCP, cantumkan ID yang benar. Jangan membuat ID baru hanya karena nama mata kuliah berubah. Periksa data yang ada sebelum menindaklanjuti pemetaan ID lama dan kanonis, serta jangan mengubah identitas langsung melalui database."
        ],
        steps: ["Buka daftar mata kuliah di /admin/courses dan cari mata kuliah yang akan dikelola.", "Jika belum ada, buat mata kuliah dengan ID yang sudah disepakati, nama resmi, dan kategori yang sesuai. Isi deskripsi bila diperlukan.", "Buka mata kuliah yang tersimpan dan pastikan nama, kategori, dan ID sesuai sebelum melanjutkan."]
      },
      {
        title: "Susun bab",
        paragraphs: ["Judul bab wajib diisi. Urutan bab menentukan susunan materi dan menjadi salah satu petunjuk saat sistem mendeteksi dokumen. Ikuti urutan silabus dan gunakan judul yang jelas serta konsisten. Sistem menetapkan ID bab; gunakan ID yang dikembalikan sistem saat memberi tugas kepada agen.", "Sebelum menghapus mata kuliah atau bab, periksa materi dan data yang terkait. Penghapusan dapat memengaruhi pekerjaan yang bergantung padanya. Jangan membuat ulang mata kuliah atau bab hanya untuk mengganti nama atau urutannya."],
        steps: ["Buka mata kuliah dan susun bab sesuai silabus.", "Periksa judul dan urutannya, lalu simpan perubahan.", "Sebelum menambahkan materi, cocokkan topik setiap berkas dengan bab yang sudah dibuat."]
      }
    ]
  },
  {
    slug: "dokumen-materi",
    category: "Mata kuliah dan materi",
    title: "Menamai dan mengunggah dokumen",
    summary: "Beri nama PDF, pilih kategori, dan hubungkan dokumen ke bab yang sesuai.",
    keywords: ["pdf", "upload", "unggah", "nama berkas", "kategori", "soal", "pembahasan", "duplikat", "batch"],
    sections: [
      {
        title: "Siapkan dokumen",
        paragraphs: ["Dokumen yang diunggah harus berupa PDF. Batas ukuran untuk unggah satuan maupun massal adalah 50 MiB per berkas. Sebelum mengunggah, pastikan isi terbaca, versinya benar, dan berkas layak digunakan.", "Gunakan format nama tim: kode-mata-kuliah_bab_kategori_deskripsi_role_tahun-semester.pdf. Pakai huruf kecil dan angka, garis bawah untuk memisahkan segmen, serta tanda hubung untuk memisahkan kata dalam satu segmen. Nomor bab memakai dua digit, misalnya bab01. Isi deskripsi dan role jika relevan. Untuk ujian yang mencakup beberapa bab, segmen bab dapat dihilangkan. Format ini adalah standar kerja tim; sistem tidak memvalidasi seluruh bagiannya saat unggah.", "Gunakan kode mata kuliah resmi yang disepakati, kategori yang sesuai, serta tahun atau periode di bagian akhir. Pisahkan berkas soal dan solusi. Jangan masukkan data pribadi atau label revisi informal ke nama berkas."],
        examples: ["ma1101_bab01_materi_limit-kontinu_slide_2025-sem1.pdf", "ma1101_uts_soal_2024-sem1.pdf", "ma1101_uts_solusi_2024-sem1.pdf"]
      },
      {
        title: "Kategori, judul, dan nama berkas",
        paragraphs: ["Pilih kategori Materi, Soal, atau Pembahasan Soal dan subkategori yang sesuai. Materi memiliki subkategori Materi Dosen, SCL, Modul, E-Book, dan Lainnya. Soal dan pembahasan memiliki Kuis, KBF, Tutorial, Modul, UTS, UAS, UP, LTM, dan Lainnya. Subkategori harus sesuai dengan kategori.", "Judul dokumen yang dibaca pengguna berbeda dari nama berkas dan kunci penyimpanan. Gunakan judul yang menunjukkan jenis dan topiknya, serta tahun, sesi, atau bagian bila perlu. Sistem menyediakan pembuatan judul dan nama standar berdasarkan metadata. Periksa hasilnya, jangan menganggap nama sumber atau hasil otomatis selalu benar.", "Generator nama massal menggunakan bagian kode mata kuliah, bab jika relevan, kategori, deskripsi, peran, serta tahun atau semester jika tersedia. Beberapa bagian dapat dihilangkan, termasuk bab pada UTS, UAS, dan UP. Kunci penyimpanan dikelola aplikasi dan dapat berbeda dari nama yang ditampilkan. Jangan menyusun atau mengubah kunci secara manual."]
      },
      {
        title: "Unggah dan periksa",
        steps: ["Buka mata kuliah yang dituju, lalu buka bagian dokumen. Pastikan bab yang diperlukan sudah tersedia.", "Pilih unggah dokumen dan pilih PDF. Periksa judul, kategori, subkategori, tahun, dan bab yang terkait. Satu dokumen dapat dihubungkan ke beberapa bab, tetapi setidaknya satu bab harus dipilih.", "Simpan, lalu periksa kembali dokumen pada mata kuliah dan bab yang dituju. Jika gagal, periksa format, ukuran, metadata, dan pilihan bab sebelum mencoba lagi."]
      },
      {
        title: "Unggah massal dan duplikat",
        paragraphs: ["Unggah massal menerima hingga 200 PDF per proses. Nama berkas digunakan untuk memperkirakan judul, kategori, tahun, dan bab. Misalnya UTS diperkirakan terkait dengan separuh awal bab, sedangkan UAS dan UP dengan seluruh bab. Ini adalah petunjuk otomatis, bukan keputusan kurikulum. Periksa dan koreksi setiap hasil, terutama jika penomoran sumber berbeda dari urutan bab Zyx.", "Pemeriksaan duplikat menggunakan checksum berkas pada mata kuliah yang dipilih. Dokumen lama tanpa checksum mungkin tidak terdeteksi. Periksa kecocokan sebelum memilih lewati, simpan keduanya, atau timpa. Menimpa memperbarui dokumen yang ada, jadi pastikan target dan konsekuensinya terlebih dahulu."],
        steps: ["Pilih berkas, lalu tinjau daftar yang disiapkan.", "Koreksi judul, kategori, tahun, dan seluruh kaitan bab. Tinjau peringatan duplikat satu per satu.", "Jalankan unggah dan periksa hasil serta kegagalan setiap berkas. Coba ulang hanya berkas yang belum berhasil setelah memeriksa hasil yang sudah tersimpan."]
      }
    ]
  },
  {
    slug: "video-mata-kuliah",
    category: "Mata kuliah dan materi",
    title: "Mengelola video mata kuliah",
    summary: "Susun video dalam playlist dan pastikan judul, sumber, serta babnya sesuai.",
    keywords: ["video", "playlist", "youtube", "thumbnail", "sampul", "unggah"],
    sections: [
      {
        title: "Siapkan playlist dan video",
        paragraphs: ["Video harus memiliki judul, sumber video, dan playlist milik mata kuliah yang sama. Bab dapat dipilih untuk mengaitkan video dengan topik. Judul playlist wajib diisi.", "Rekomendasi: beri playlist nama yang menggambarkan kelompok materi, misalnya Bab 1: Limit. Beri video judul spesifik seperti Limit fungsi aljabar atau Pembahasan soal limit, dan tambahkan nomor bagian jika topik dibagi. Ini adalah konvensi kerja, bukan format yang diwajibkan sistem."],
        steps: ["Buka video pada mata kuliah yang benar dan buat atau pilih playlist.", "Tambahkan video dari YouTube atau unggah berkas, lalu isi judul dan pilih bab jika relevan.", "Periksa sumber, judul, playlist, bab, dan thumbnail sebelum menyimpan. Setelah tersimpan, periksa video pada daftar yang sesuai."]
      },
      {
        title: "Berkas dan thumbnail",
        paragraphs: ["Untuk unggah langsung, antarmuka menunjukkan MP4, WebM, dan MOV dengan batas 100 MB. Endpoint juga mengenali MKV dan M4V dengan tipe MIME yang sesuai. Thumbnail kustom menerima JPG, PNG, atau WebP hingga 5 MB.", "Sistem mengubah tautan atau ID YouTube yang dikenali menjadi URL YouTube. Jika tidak ada thumbnail kustom, sistem memakai thumbnail YouTube. Pastikan murid dapat mengakses video dan sumbernya berhak digunakan.", "Menghapus playlist juga menghapus video di dalamnya dan dapat menghapus berkas video serta thumbnail dari penyimpanan. Periksa isi dan dampaknya sebelum menghapus."]
      }
    ]
  }
];
