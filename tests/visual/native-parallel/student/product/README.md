# Referensi alur kursus pada web produk

Direktori `web/` memuat hasil Playwright dari lima halaman Next.js untuk Alya (peserta aktif), Bima (belum terdaftar), dan Citra (enrollment berakhir). Semua akun, kursus, dokumen, dan sesi berasal dari seed lokal. Setiap gambar memperlihatkan viewport pertama pada rute yang tercantum dalam `web/web.json`. Halaman dokumen menampilkan “Turunan” untuk Alya dan “Materi terkunci” untuk Bima serta Citra.

Server memakai checkout `7d93b3a5984814ee382ccd36d9ceff8cb34abbcd`, PostgreSQL 16 di loopback dan Next.js Turbopack. Chromium 154.0.8037.57 memakai viewport 380 × 820, DPR 1, tema terang, locale id-ID dan zona waktu Asia/Jakarta. Browser memuat font dari aplikasi dan menunggu `document.fonts.ready`. Referensi ini meliputi pemuatan rute dan keputusan akses pada web. Pengembalian posisi gulir di Expo memakai skenario Maestro terpisah.

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

Jika server berjalan dari checkout yang berbeda, gunakan SHA checkout server. Playwright memakai Chromium terpasang dari `bunx playwright install chromium` atau executable yang ditentukan oleh `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Capture menolak origin selain loopback dan menghentikan proses dengan status gagal bila ada rute tanpa judul produk. Berkas PNG serta `web.json` ditulis ke `artifacts/student-evidence/product/` atau `STUDENT_CAPTURE_DIR`.

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
