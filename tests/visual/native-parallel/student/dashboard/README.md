# Referensi dashboard Student

Rute produk `/dashboard` dirender dengan sesi Student, tema terang, locale id-ID dan zona waktu Asia/Jakarta pada PostgreSQL 16 lokal dan Next.js Turbopack. Playwright memeriksa tampilan awal sebelum dan sesudah setiap tangkapan. Penanda pada manifest meliputi kelas aktif, jumlah materi, progres, pratinjau bab gratis, serta streak, pencarian dan notifikasi yang sudah tampil di header. Tur telah dilewati pada seed. Pengingat profil, pemasangan aplikasi dan izin notifikasi telah ditunda pada sesi browser.

| Status | Akun seed | Isi yang diperiksa |
| --- | --- | --- |
| `enrolled` | Alya | Matematika I aktif, 0/4 materi, pencapaian, ulasan dan asesmen kosong |
| `unenrolled` | Bima | Paket Free, 0/1 materi, tautan materi pertama pada bab gratis |
| `revoked` | Citra | Pendaftaran sudah berakhir ketika dashboard dibuka, paket Free, 0/1 materi, tanpa kelas aktif |

Dimensi referensi Android ialah 380 × 820 pada DPR 1. Dimensi referensi iOS ialah 402 × 874 pada DPR 3. Manifest `web/<platform>/dashboard-reference.json` mencatat commit server, browser, hash seed, hash fixture Expo dan hash masing-masing PNG. Bima dan Citra menampilkan pratinjau yang sama. Kedua PNG web untuk iOS identik. PNG web untuk Android berbeda pada 38.396 piksel, dengan selisih maksimum 3 dari 255 per kanal RGB.

Web menggunakan komponen produksi. Expo menggunakan `StudentEntry` dan `CourseScreen` dengan [respons fixture](../../../../../packages/native-parity/student/dashboard/responses.json) yang diambil dari dashboard dan dashboard-extras untuk akun seed yang sama. Capture membandingkan seluruh JSON dari endpoint produk dengan fixture Expo. Pencabutan akses saat membuka materi tetap punya skenario Maestro sendiri. Skenario baru memeriksa tiga status awal dashboard pada build internal.

Perbandingan halaman penuh masih memerlukan hasil dari perangkat virtual. Referensi web memakai latar dan ikon produk, termasuk ilustrasi peringkat, serta streak, pencarian dan notifikasi pada shell. Fixture Expo memakai latar, ikon, shell dan safe area native. Rincian paket semester, mutasi aktivasi token dan transisi navigasi lanjutan berada di luar pemeriksaan visual tiga snapshot ini. Tema gelap, bahasa Inggris, sesi Expo OAuth dan verifikasi perangkat fisik belum dijalankan untuk slice ini.

## Reproduksi

Siapkan dan isi database loopback seperti di [petunjuk seed produk](../product/README.md). Gunakan Next.js checkout yang akan direkam. Jalankan Chromium yang terpasang atau isi `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` dengan executable setempat. Isi `STUDENT_SERVER_SHA` jika server berjalan dari checkout lain.

```sh
for platform in android ios; do
  STUDENT_DASHBOARD_PLATFORM="$platform" \
    bun --env-file=.env.local tests/visual/native-parallel/student/product/dashboard-capture.ts
done
```

Keluaran default berada di `artifacts/student-evidence/dashboard/web/<platform>/`. Untuk menyegarkan respons fixture setelah perubahan sah pada seed atau proyeksi dashboard, arahkan `STUDENT_DASHBOARD_RECORD_RESPONSES` ke berkas sementara, tinjau perubahan JSON dan jalankan ulang capture dengan fixture yang diperbarui.

Pada build internal Student gunakan [dashboard-parity.yaml](../../../../../.maestro/native-parallel/student/dashboard-parity.yaml). Flow **Student dashboard enrollment states** menghasilkan `student-dashboard-enrolled.png`, `student-dashboard-unenrolled.png` dan `student-dashboard-revoked.png`. Tangkapan Chromium yang dipatok dapat diverifikasi dengan hash di CI tanpa memulai database di job perangkat.

Otorisasi endpoint tetap berbasis sesi Student dan akses kursus yang sudah ada. Bidang progres dan bab gratis berasal dari read model dashboard web. Operasi ini tercatat sebagai operasi aplikasi Student di katalog MCP. Tool, scope, discovery, consent, skill, prompt host dan binding lingkungan MCP tidak berubah.
