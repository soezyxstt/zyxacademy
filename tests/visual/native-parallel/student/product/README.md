# Referensi alur kursus pada web produk

Direktori `web/` memuat tangkapan Playwright dari lima halaman Next.js untuk Alya (peserta aktif), Bima (belum terdaftar), dan Citra (pendaftaran berakhir). [Manifest](web/web.json) mencatat pemeriksaan isi yang terlihat di viewport awal untuk setiap akun dan rute. Dasbor direkam setelah pengingat kelengkapan profil ditutup. Alya dapat membaca artikel “Turunan”. Bima dan Citra melihat permintaan aktivasi kelas tanpa isi artikel.

Server memakai checkout `7d93b3a5984814ee382ccd36d9ceff8cb34abbcd`, Next.js Turbopack, dan database PostgreSQL 16 di loopback yang hanya diisi oleh [seed kursus](seed.ts). Chromium 154.0.8037.57 memakai viewport 380 × 820, DPR 1, tema terang, locale id-ID dan zona waktu Asia/Jakarta. Dasbor dan pembaca artikel peserta aktif memakai pengaturan animasi sistem standar. Kasus lain memakai preferensi sistem untuk mengurangi animasi. Browser menunggu font aplikasi, membatasi permintaan ke origin lokal, dan memblokir service worker agar setiap rute dimuat langsung dari server.

Referensi ini mencatat tampilan awal dan keputusan akses pada web. [Skenario Maestro](../../../../../.maestro/native-parallel/student/) memeriksa perilaku Expo, termasuk pengembalian posisi gulir.

## Reproduksi lokal

1. Siapkan PostgreSQL 16 lokal dengan database kosong bernama `student_evidence`. Terapkan migrasi `drizzle-postgres/` dalam urutan jurnal Drizzle.
2. Isi environment pengembangan lokal untuk Next.js dan Bun. Gunakan `DATABASE_URL` ke database di atas, `BETTER_AUTH_URL` serta `NEXT_PUBLIC_APP_URL` ke `http://127.0.0.1:3140`, dan satu `BETTER_AUTH_SECRET` sintetis sepanjang sedikitnya 32 karakter yang sama untuk kedua proses.
3. Dari root repo, jalankan perintah berikut. Jalankan server dan capture di terminal terpisah.

```sh
bun --env-file=.env.local tests/visual/native-parallel/student/product/seed.ts
node node_modules/next/dist/bin/next dev --turbopack --hostname 127.0.0.1 -p 3140
```

```sh
bun --env-file=.env.local tests/visual/native-parallel/student/product/http.ts
STUDENT_SERVER_SHA=$(git rev-parse HEAD) \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/capture.ts
```

Jika server berjalan dari checkout yang berbeda, gunakan SHA checkout server. Playwright memakai Chromium terpasang dari `bunx playwright install chromium` atau executable yang ditentukan oleh `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Skrip memeriksa tautan, tombol, atau isi artikel yang sesuai dengan akun dan rute sebelum serta sesudah mengambil gambar. Elemen harus selesai ditampilkan oleh animasi dan berada di viewport awal. Skrip mencatat peringatan hidrasi React yang dapat dipulihkan dalam manifest jika isi target berhasil tampil. Kasus yang gagal tidak menghasilkan PNG dan membuat perintah keluar dengan status 1. Berkas PNG dan `web.json` ditulis ke `artifacts/student-evidence/product/` atau `STUDENT_CAPTURE_DIR`. Untuk mengulang kasus tertentu, isi `STUDENT_CAPTURE_CASES` dengan ID dari manifest dipisah koma dan gunakan direktori keluaran terpisah.

Smoke HTTP menjalankan enam proyeksi untuk masing-masing akun. Pengujian menerima 18 respons 200 dan memeriksa isi dashboard, mastery, enrollment serta dokumen terkunci. Tiga permintaan dengan akun berbeda menghasilkan 409 dan tiga permintaan dokumen tidak dikenal menghasilkan 404. Pengujian konkurensi streak menggunakan dua pembacaan pertama secara bersamaan pada basis data pengujian.

## Referensi asesmen

Jalankan seed asesmen sebelum capture untuk memperbarui waktu mulai percobaan kuis sintetis dan sesi kedua peserta. Capture mengambil halaman produk pada viewport 380 × 820, termasuk pemeriksaan isi halaman, pemulihan jawaban setelah muat ulang, dan pesan akses peserta tanpa pendaftaran. Manifest mencatat hasil per skenario. Gunakan `STUDENT_ASSESSMENT_CAPTURE_CASES` dengan daftar ID dipisah koma untuk mengulang sebagian skenario. Arahkan pengulangan ke direktori keluaran terpisah agar manifest run lengkap tetap tersedia.

```sh
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-seed.ts
STUDENT_SERVER_SHA=$(git rev-parse HEAD) \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-capture.ts
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-http.ts
```

Smoke HTTP memakai sesi peserta sintetis yang ditandatangani dan resource sementara. Pengujian memeriksa identitas yang sama ketika permintaan mulai atau kirim diulang, jumlah rekaman tersimpan, pelepasan pembahasan, hasil dan kuota, serta penolakan ketika hasil diminta oleh peserta lain.

### Pengujian HTTP pada `e2b8f44a`

Kedua skrip lulus pada checkout bersih `e2b8f44a7885a87e20eb2ff71f937ed66aae7218`, dengan Next.js 16.3.0 Turbopack dan PostgreSQL 16.13 di loopback. Database uji `student_evidence` memakai 49 migrasi dari jurnal Drizzle, seed kursus untuk tiga akun sintetis, dan seed asesmen untuk dua sesi tambahan. Skrip kursus menerima 18 respons 200 untuk enam proyeksi pada tiga akun, tiga 409 saat identitas akun tidak cocok, serta tiga 404 untuk dokumen yang tidak dikenal. Status enrollment dan penguncian dokumen sesuai dengan seed.

Skrip asesmen menerima sembilan respons 200, tiga 201, dua 404, dan satu 409. Seluruh respons asesmen memakai `private, no-store`. Pengulangan mulai dan pengumpulan kuis serta pengulangan pengumpulan tryout mempertahankan identitas hasil dan menyimpan satu percobaan serta satu pengumpulan. Kedua skor bernilai 100. Pembahasan kuis baru terbuka setelah kuis ditutup. Permintaan tryout baru setelah kuota habis mendapat 409. Peserta kedua yang terdaftar memperoleh daftar hasil pribadi kosong dan 404 saat membuka kedua hasil milik peserta pertama. Setelah skrip selesai, pemeriksaan database menemukan nol rekaman asesmen sementara pada tabel kursus, enrollment, kuis, tryout, soal, percobaan, dan pengumpulan yang diperiksa. Kedua layanan uji dihentikan.
