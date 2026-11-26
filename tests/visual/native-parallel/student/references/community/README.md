# Referensi web komunitas Student

Tangkapan memakai halaman Next.js asli dengan Better Auth dan PostgreSQL lokal `student_evidence`. Seluruh identitas, nama, aktivitas, sesi tutorial, dan hasil belajar pada tangkapan berasal dari data sintetis. Manifest menyimpan SHA server, versi Chromium, viewport, DPR, tampilan, URL, dan assertion untuk setiap kasus. Tangkapan ini mengukur web.

## Menjalankan ulang

Siapkan server Next.js loopback dan seed Student dasar. Arahkan `STUDENT_EVIDENCE_ENV` ke berkas konfigurasi lokal server uji. Jalankan seed komunitas dan Playwright satu worker.

```sh
bun --env-file="$STUDENT_EVIDENCE_ENV" tests/visual/native-parallel/student/product/community-seed.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3140 \
STUDENT_COMMUNITY_HTTP_BASE=http://127.0.0.1:3140 \
STUDENT_SERVER_SHA="$WEB_CHECKOUT_SHA" \
STUDENT_COMMUNITY_CAPTURE_DIR=tests/visual/native-parallel/student/references/community \
node --env-file="$STUDENT_EVIDENCE_ENV" node_modules/@playwright/test/cli.js test \
  tests/visual/native-parallel/student/product/community-web.spec.ts --workers=1
```

`WEB_CHECKOUT_SHA` berisi SHA lengkap checkout server. Setiap kasus memeriksa rute akhir, parameter alias bila relevan, isi halaman yang diharapkan, dan overflow horizontal. Error halaman serta respons HTTP gagal pada origin loopback membuat kasus gagal. Status konsol di luar pemeriksaan tersebut tetap tercatat. Browser memulai dengan pengingat notifikasi yang sudah ditunda, tanpa memberikan izin atau mendaftarkan token.

## Batas bukti

- Pada 380 × 844, 23 tangkapan mencakup 19 pola rute. Navigasi dari profil ke diskusi dan pengaturan lulus. Pemuatan langsung `/dashboard/discussions` dan `/settings` masih gagal hidrasi pada checkout web `7d93b3a5`. [Manifest 380 px](manifest-mobile-380.json)
- Pada checkout web `28b8dd941b665105ebe0f6331d6b594abc06ed08`, pemuatan langsung `/settings` lulus pada 380 × 844. Pengujian menunggu tautan **Unduh aplikasi** yang baru muncul setelah komponen preferensi terpasang, lalu memastikan menu **Bahasa** terbuka dan menampilkan **Bahasa Indonesia** serta **English**. [Manifest pemuatan langsung](manifest-settings-direct-28b8dd94-mobile-380.json)
- Pada 1536 × 864, dua kasus ranking global lulus dan dua kasus ranking kursus gagal. [Manifest desktop](manifest-laptop-fhd-125.json)
- Kasus yang berhasil tersimpan sebagai PNG bersama manifest. Entri gagal menyimpan penyebab tanpa mengklaim tangkapan lulus. Kasus dalam spesifikasi yang tidak ada di manifest belum menghasilkan bukti.
- Ranking akademik menampilkan nilai 93% untuk peserta sintetis. Ranking partisipasi menampilkan 165 XP. Halaman ranking kursus aktif dapat menampilkan isi tersebut ketika pemilih kursus pada shell masih memuat.
- Referensi hanya mencatat viewport dan state yang benar-benar dijalankan. Kesetaraan visual di Android dan iOS memerlukan screenshot perangkat atau emulator dan diff tersendiri.
