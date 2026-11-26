# Referensi detail kursus, daftar materi, dan pembaca Student

Playwright membuka `/courses/matematika-1`, `/courses/matematika-1/material`, dan `/courses/matematika-1/material/dokumen-4` pada produk Next.js dengan sesi Better Auth sintetis yang ditandatangani. Alya memiliki pendaftaran aktif, Bima belum terdaftar, dan pendaftaran Citra telah kedaluwarsa. Ketiganya melihat kursus **Matematika I** serta pratinjau **Sistem bilangan real**. Akses **Turunan** diberikan kepada Alya. Bima dan Citra melihat permintaan aktivasi kelas. [Seed PostgreSQL](seed.ts) · [Pemeriksaan sesi dan capture](material-reference.ts)

| Halaman | Android 380 × 820, DPR 1 | iPhone 17 Pro 402 × 874, DPR 3 |
| --- | --- | --- |
| Detail kursus | [Manifest](../course-detail/web/android/course-detail-reference.json) | [Manifest](../course-detail/web/ios/course-detail-reference.json) |
| Daftar materi | [Manifest](../material-list/web/android/material-list-reference.json) | [Manifest](../material-list/web/ios/material-list-reference.json) |
| Pembaca | [Manifest](../material-reader/web/android/material-reader-reference.json) | [Manifest](../material-reader/web/ios/material-reader-reference.json) |

Manifest mencatat nama file, SHA-256 PNG, SHA-256 sumber seed dan fixture respons, serta isi yang terlihat di viewport awal. Browser menggunakan tema terang, locale `id-ID`, dan zona waktu Jakarta. Permintaan browser dibatasi ke origin produk lokal dan service worker diblokir. Capture memeriksa elemen utama dan form yang relevan sebelum serta sesudah mengambil PNG.

Skrip memeriksa respons API produk dengan sesi tiap peserta, termasuk penolakan identitas akun yang tidak cocok (409), ID pembaca yang tidak ada (404), serta akses pratinjau dan materi premium. Perangkat memakai ulang respons GET sintetis untuk kursus, daftar materi, materi premium, dan pratinjau. Flow Maestro memeriksa judul kursus, tab **Semua**, penolakan materi premium atau kesiapan host pembaca, tombol kembali dan pemulihan ke pratinjau. [Respons GET fixture](../../../../../packages/native-parity/student/courses/material-reference.json) · [Peserta aktif](../../../../../.maestro/native-parallel/student/course-material-enrolled.yaml) · [Peserta belum terdaftar](../../../../../.maestro/native-parallel/student/course-material-unenrolled.yaml) · [Pendaftaran kedaluwarsa](../../../../../.maestro/native-parallel/student/course-material-revoked.yaml)

Web peserta aktif menampilkan isi artikel dan aksi penyelesaian. Host native pada fixture menampilkan fallback pembaca dan belum menampilkan isi atau menyimpan progres, sehingga gambar pembaca peserta aktif hanya mendukung pemeriksaan identitas dan keputusan akses. Kedua keadaan terkunci menyediakan form aktivasi dengan presentasi dan salinan antarmuka yang berbeda. Flow ini menggunakan snapshot pendaftaran yang sudah kedaluwarsa. Perubahan akses ketika pembaca dibuka di tengah sesi diperiksa pada skenario `revoked` terpisah. Bukti perangkat Android, iOS, dan hasil perbandingan piksel untuk flow baru masih diperlukan. [Alur pencabutan saat sesi berjalan](../../../../../.maestro/native-parallel/student/revoked.yaml)

## Reproduksi

Siapkan checkout Next.js dan PostgreSQL lokal menggunakan setup dan seed produk. Apabila checkout server berbeda, setel `STUDENT_SERVER_SHA` ke SHA yang dijalankan dan `STUDENT_PRODUCT_SEED_SOURCE` ke file seed yang digunakan oleh server. [Setup produk](README.md)

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/material-reference.ts
```

Skrip menulis tiga grup PNG dan manifest ke `artifacts/student-evidence/reference` atau `STUDENT_MATERIAL_REFERENCE_DIR`. Gunakan `--inputs-only` untuk memeriksa respons bertanda tangan tanpa membuka browser. Gunakan `--write-inputs` untuk memperbarui fixture bersama setelah perubahan seed atau proyeksi.
