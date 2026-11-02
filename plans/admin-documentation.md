# Rencana dokumentasi admin

Status: `OPEN / IN PROGRESS`
Tanggal: 2026-11-02
Tahap: implementasi lokal. Rute menggunakan `/admin/docs`, tersedia selalu untuk admin sesuai keputusan pengguna. Panduan awal tersedia dalam bahasa Indonesia. Navigasi bagian diperiksa di sandbox dengan database dan akun sintetis pada 380 x 844, 1536 x 864, serta breakpoint 1279 dan 1280 px. Pemeriksaan mobile dan breakpoint lulus, tetapi dua tes desktop melaporkan error hidrasi menu akun sidebar utama yang juga terulang saat layout navigasi dokumentasi dilepas. Pemeriksaan visual penuh, verifikasi operasional pada lingkungan target, dan perluasan cakupan masih terbuka.

## Tujuan

Admin dapat menemukan instruksi yang ringkas dan tepercaya untuk menyelesaikan pekerjaan operasional, memahami dampak tindakan, dan menangani kegagalan umum. Panduan ditulis berdasarkan perilaku yang sudah diverifikasi pada versi aplikasi yang akan dirilis. Dokumen teknis di `docs/` tetap menjadi sumber rujukan, bukan langsung dipublikasikan sebagai panduan admin.

## Titik awal dan batas

- Navigasi admin saat ini mengelompokkan akademik, alat, pengguna, operasi, dan Tutorial PKA di `components/admin-sidebar.tsx`. Workspace mata kuliah memiliki navigasi kontekstual tersendiri.
- `docs/features.md` mencatat alur produk; `docs/operations/` berisi runbook teknis dan pemeriksaan operasional. Keduanya harus diperiksa bersama kode terkini sebelum menyusun langkah panduan.
- Halaman ini khusus admin dan mengikuti gate admin yang sudah ada. Jangan tampilkan kredensial, data pribadi, instruksi akses langsung database, atau detail internal yang tidak diperlukan untuk pekerjaan admin.
- Tidak termasuk changelog, panduan murid atau tutor, editor CMS, pelacakan progres membaca, AI pencarian, perubahan hak akses, dan deployment.

## Struktur halaman dan navigasi

Rute `/admin/docs`, dengan entri sidebar **Dokumentasi** yang juga tersedia saat navigasi kontekstual mata kuliah aktif. Gunakan `PageHeader`, komponen admin, token, dan pola shell yang ada. Gunakan judul dan label sesuai bahasa antarmuka yang dipilih.

Halaman indeks:

1. Judul **Panduan admin** dan kolom pencarian dengan `SearchBar` jika cocok dengan kebutuhan aksesibilitas dan perilaku yang ada.
2. Daftar topik yang dikelompokkan berdasarkan pekerjaan, disajikan sebagai baris dengan pemisah dalam sedikit section, bukan kartu untuk setiap artikel. Judul artikel menjelaskan tugas, misalnya **Membuat token aktivasi**.
3. Pencarian lokal mencocokkan judul, istilah alternatif, dan ringkasan yang tersedia, tanpa permintaan AI. Sediakan kondisi tidak ada hasil dan cara menghapus pencarian. Pastikan hasil dapat dibuka dengan keyboard.
4. Tautan langsung ke panduan prioritas dapat ditempatkan pada bagian terkait bila berguna, bukan di setiap halaman secara otomatis. Periksa juga kemungkinan indeks pencarian global yang sudah ada.

Rute artikel `/admin/docs/[slug]` menyediakan navigasi kembali ke indeks, judul yang menjelaskan tugas, prasyarat yang relevan, langkah berurutan, hasil yang diharapkan, dan pemulihan jika langkah gagal. Peringatan hanya muncul untuk konsekuensi nyata, termasuk publikasi, perubahan akses, penghapusan, atau pengiriman ke pengguna.

Pada desktop, gunakan area baca yang nyaman dan daftar isi artikel hanya jika artikel cukup panjang. Pada 380 px, gunakan satu kolom, kontrol yang membungkus, dan daftar isi yang tidak menutupi isi. Ikuti ukuran judul, kontrol, fokus keyboard, kontras, serta dukungan bahasa Indonesia dan Inggris yang sudah berlaku. Hindari gambar dekoratif; gunakan screenshot hanya jika memperjelas langkah dan dapat dipelihara tanpa data pribadi.

## Cakupan dokumentasi

Setiap artikel harus menyatakan audiens, prasyarat, langkah, hasil, dan pemulihan yang relevan. Cantumkan akses atau ketersediaan fitur jika memang membatasi alurnya. Hindari menebak label tombol, dampak, atau status rilis. Daftar berikut adalah inventaris editorial, bukan klaim bahwa semua alur sudah diverifikasi.

### Prioritas 1: operasi inti

| Kelompok | Panduan yang perlu disiapkan | Hasil yang harus jelas |
|---|---|---|
| Akses dan pengguna | Membuat dan mengelola token aktivasi; mengelola pengguna dan kelompok belajar | Kapasitas, kedaluwarsa, akses yang diberikan, dan dampak perubahan. |
| Mata kuliah | Menyiapkan mata kuliah dan struktur bab; mengelola dokumen dan video | Prasyarat, urutan kerja, dan apa yang dapat dilihat murid. |
| Materi | Meninjau dan menerbitkan Article dan Diktat melalui alur yang tersedia | Status draft, pemeriksaan, publikasi, dan cara menangani kegagalan. |
| Penilaian | Mengelola bank soal; membuat dan menerbitkan kuis atau tryout; melihat hasil | Sumber soal, batasan publikasi, dan dampak pada peserta. |
| Komunikasi | Mengirim notifikasi dan memeriksa riwayat | Sasaran, konsekuensi pengiriman, dan apa yang dapat dipastikan dari riwayat. |

### Prioritas 2: pekerjaan lanjutan

- Jadwal umum, Meet, dan aktivitas tutor.
- Pustaka Media, Tautan Publik, Blog, dan Form Studio, termasuk ekspor bila tersedia.
- Tutorial PKA: pendaftar, jadwal, pengumuman, kuis, dan materi, dengan keterangan ketersediaan fitur.
- Monitoring operasi dan Zyra: membaca status, mengenali masalah yang dapat ditangani admin, serta kapan menghubungi penanggung jawab teknis. Tautkan runbook teknis yang sesuai hanya jika akses dan audiensnya tepat.
- Pengaturan berisiko, termasuk feature flags dan API keys: jelaskan tujuan, dampak, kewenangan, dan pemulihan yang telah diverifikasi. Jangan mencantumkan nilai rahasia.

## Konten dan pemeliharaan

- Awali dengan himpunan artikel prioritas 1 yang benar-benar diperiksa, bukan seluruh inventaris sekaligus. Pilih tugas awal berdasarkan frekuensi dan dampak bersama pemilik operasional.
- Simpan konten awal bersama kode menggunakan pola konten lokal yang sudah ada jika cocok. Hindari skema database atau editor baru untuk versi pertama. Pastikan konten aman untuk dirender dan hanya memuat tautan yang valid.
- Tentukan penanggung jawab setiap kelompok, sumber kode atau dokumen, tanggal verifikasi terakhir, dan pemicu tinjauan ketika alur berubah. Tanggal verifikasi tidak boleh disamakan dengan bukti deployment.
- Selaraskan dengan sistem bahasa aplikasi. Sediakan konten Indonesia dan Inggris yang setara sebelum mengklaim dukungan dua bahasa; jika belum siap, tetapkan perilaku fallback yang jelas saat implementasi.
- Uji setiap panduan pada data sintetis atau lingkungan nonproduksi yang secara eksplisit diizinkan. Jangan gunakan data pribadi dalam contoh atau screenshot.

## Tahapan pelaksanaan dan penerimaan

1. **Inventaris dan verifikasi:** petakan pemilik, route, hak akses, label, prasyarat, dampak, dan jalur pemulihan untuk artikel awal. Pisahkan perilaku lokal dari perilaku yang telah diverifikasi pada lingkungan target.
2. **Konten:** tulis dan tinjau artikel prioritas 1 berdasarkan bukti. Tandai topik yang belum terverifikasi sebagai pekerjaan terbuka, jangan tampilkan sebagai panduan final.
3. **Implementasi:** bangun indeks dan artikel dengan komponen yang ada, pencarian lokal, akses admin, navigasi responsif, dan lokalisasi. Navigasi kanan menampilkan daftar panduan dan bagian yang dapat ditautkan; pada layar kecil gunakan panel geser.
4. **Validasi:** periksa akses admin dan penolakan peran lain, tautan, pencarian dan kondisi tanpa hasil, navigasi keyboard, isi kedua bahasa, serta kesesuaian artikel dengan alur yang diuji. Primary agent menjalankan pemeriksaan visual Playwright pada 380 x 844 dan 1536 x 864 untuk indeks, hasil pencarian, tanpa hasil, dan artikel, lalu memeriksa seluruh screenshot dan melaporkan batas yang belum diuji.
5. **Serah terima:** perbarui `docs/features.md` dan indeks dokumentasi sesuai perubahan, catat pemilik dan artikel yang belum selesai. Rilis ke staging atau production memerlukan otorisasi dan verifikasi terpisah.

## Keputusan sebelum implementasi

- Konfirmasi urutan artikel awal dengan pemilik operasional dan tetapkan penanggung jawab kontennya.
- Diputuskan: kemampuan selalu tersedia untuk admin, tanpa feature flag baru.
- Tentukan cakupan terjemahan awal dan apakah screenshot cukup bernilai untuk biaya pemeliharaannya.
