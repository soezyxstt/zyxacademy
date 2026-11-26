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

### Suite Playwright Student pada viewport seluler

Pengulangan pada checkout `28b8dd94` dengan komponen preferensi yang sudah terpasang menghasilkan 38/44. Enam kegagalan tercatat pada hidrasi shell web. Pengujian langsung `/settings` secara terpisah menghasilkan satu tangkapan yang lolos pemeriksaan. [Rincian pengulangan dan matriks dua viewport](../references/community/README.md)

Pada checkout `0cc3c835251cead65ff838cde0c3e9c9ad3ccc0b`, Playwright menjalankan seluruh direktori Student dengan proyek `mobile-380`, Next.js 16.3 dan PostgreSQL 16.13 lokal. Sebanyak **41 dari 44 tes lulus**, tiga gagal dan tidak ada yang dilewati. Semua 19 tes komponen, referensi dan siklus layar lulus. Sebanyak 22 dari 25 skenario web komunitas bersesi lulus pada run pertama.

| Halaman produk | Run pertama | Satu percobaan ulang pada server yang sama dengan konteks browser baru |
| --- | --- | --- |
| `/feedback` | HTTP 200. Form terlihat. React melaporkan ketidakcocokan hidrasi pada pemicu popover `NotificationBellContent`. | Lulus, termasuk pemeriksaan hidrasi. |
| `/settings/notifications` | HTTP 200. Preferensi terlihat. Label SSR pada kontrol bersama berbunyi “Cari (Ctrl + K)”, sementara klien mengharapkan “Notifikasi”. | Lulus, termasuk pemeriksaan hidrasi. |
| `/settings`, pemuatan langsung | HTTP 200. Setelah tombol Bahasa ditekan, opsi menu “Bahasa Indonesia” tidak terlihat dalam 25 detik. | Mengulang kegagalan yang sama. Navigasi ke Pengaturan melalui profil lulus pada run pertama. |

Status pemuatan langsung tetap tercatat sebagai gagal. Rujukan gambar Pengaturan yang berhasil memakai jalur melalui profil. [Skenario dan assertion](community-web.spec.ts)

### Autentikasi klien native melalui HTTPS loopback

Harness resmi lulus pada checkout bersih `4a1d9c866fd24047db59585f66dded3671cbc4c5` dengan Bun 1.3.14 dan PostgreSQL 17.12. Server uji memakai HTTPS `127.0.0.1:9443`, akun sintetis, handler autentikasi produksi, dan basis data sementara. Permintaan dari klien Expo diarahkan ke loopback selama pengujian. Login melalui UI perangkat masih perlu diverifikasi. [Workflow](../../../../../.github/workflows/native-authenticated-preview.yml)

1. Endpoint start mengembalikan 302 menuju browser fixture. Klaim sintetis yang sah mendapat 303. Klaim salah atau yang diulang mendapat 403.
2. Endpoint complete menghasilkan deep link dengan kode dan state yang sesuai. Permintaan tanpa cookie handoff mendapat 403. Pertukaran yang sah menghasilkan 200 dan cookie bertanda tangan. Origin salah mendapat 403, sedangkan verifier salah atau kode yang dipakai ulang mendapat 400.
3. Klien Expo memverifikasi identitas akun dan sesi dengan masa berlaku maksimum lima menit. Konteks terautentikasi mengembalikan satu peran `murid` dan tujuan `/dashboard`.
4. Klien mencabut sesi melalui sign-out. Permintaan konteks dengan cookie yang sudah dicabut mendapat 401. Permintaan anonim juga mendapat 401.

Untuk mengulang, pakai checkout terpisah pada SHA di atas dan Bun 1.3.14. Siapkan instance PostgreSQL 17 kosong yang hanya mendengarkan di loopback port 55453. Gunakan database, pengguna, dan password fixture `native_preview` seperti pada workflow. Harness menerapkan migrasi dan membuat sesi sintetis. Penanda runner pada perintah ini berlaku hanya untuk proses fixture lokal.

```bash
(
  set -eu
  test "$(git rev-parse HEAD)" = 4a1d9c866fd24047db59585f66dded3671cbc4c5
  umask 077
  tls_dir=$(mktemp -d)
  trap 'rm -rf -- "$tls_dir"' EXIT
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
    -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1 \
    -keyout "$tls_dir/key.pem" -out "$tls_dir/cert.pem" 2>/dev/null
  GITHUB_ACTIONS=true RUNNER_ENVIRONMENT=github-hosted NATIVE_PRODUCT_AUTH_FIXTURE=1 \
    DATABASE_URL=postgresql://native_preview:native_preview@127.0.0.1:55453/native_preview \
    NEXT_TELEMETRY_DISABLED=1 bun --no-env-file \
    scripts/native-readiness/product-auth/smoke.ts "$tls_dir/cert.pem" "$tls_dir/key.pem"
)
```

Harness menutup listener TLS setelah selesai. Hentikan instance PostgreSQL fixture setelah pengujian.
