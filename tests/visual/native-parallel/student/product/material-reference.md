# Referensi detail kursus, daftar materi, dan pembaca Student

Playwright membuka `/courses/matematika-1`, `/courses/matematika-1/material`, dan `/courses/matematika-1/material/dokumen-4` pada produk Next.js dengan sesi Better Auth sintetis yang ditandatangani. Alya memiliki pendaftaran aktif, Bima belum terdaftar, dan pendaftaran Citra telah kedaluwarsa. Ketiganya melihat kursus **Matematika I** serta pratinjau **Sistem bilangan real**. Akses **Turunan** diberikan kepada Alya. Bima dan Citra melihat permintaan aktivasi kelas. [Seed PostgreSQL](seed.ts) · [Pemeriksaan sesi dan capture](material-reference.ts)

| Halaman | Android 380 × 820, DPR 1 | iPhone 17 Pro 402 × 874, DPR 3 |
| --- | --- | --- |
| Detail kursus | [Manifest](../course-detail/web/android/course-detail-reference.json) | [Manifest](../course-detail/web/ios/course-detail-reference.json) |
| Daftar materi | [Manifest](../material-list/web/android/material-list-reference.json) | [Manifest](../material-list/web/ios/material-list-reference.json) |
| Pembaca | [Manifest](../material-reader/web/android/material-reader-reference.json) | [Manifest](../material-reader/web/ios/material-reader-reference.json) |

Manifest mencatat nama file, SHA-256 PNG, SHA-256 sumber seed dan fixture respons, serta isi yang terlihat di viewport awal. Browser menggunakan tema terang, locale `id-ID`, dan zona waktu Jakarta. Sesi memakai preferensi peserta yang menutup pengingat profil serta menunda pengingat notifikasi dan unduhan aplikasi. Peserta aktif menempatkan pet Zyra di kiri bawah pembaca agar tombol penyelesaian dapat dibaca. Pada tangkapan lain, peserta menyembunyikan pet. Permintaan browser dibatasi ke origin produk lokal dan service worker diblokir. Capture memeriksa elemen utama dan form yang relevan sebelum serta sesudah mengambil PNG.

Skrip memeriksa respons API produk dengan sesi tiap peserta, termasuk penolakan identitas akun yang tidak cocok (409), ID pembaca yang tidak ada (404), serta akses pratinjau dan materi premium. Perangkat memakai ulang respons GET sintetis untuk kursus, daftar materi, materi premium, dan pratinjau. Flow Maestro memeriksa judul kursus, tab **Semua**, penolakan materi premium atau kesiapan host pembaca, tombol kembali dan pemulihan ke pratinjau. [Respons GET fixture](../../../../../packages/native-parity/student/courses/material-reference.json) · [Peserta aktif](../../../../../.maestro/native-parallel/student/course-material-enrolled.yaml) · [Peserta belum terdaftar](../../../../../.maestro/native-parallel/student/course-material-unenrolled.yaml) · [Pendaftaran kedaluwarsa](../../../../../.maestro/native-parallel/student/course-material-revoked.yaml)

## Komposisi yang diukur pada Android

Sembilan pasangan pada `14295fc2` memakai bingkai 380 × 820. Tiga detail kursus memiliki 264.076–266.757 piksel berbeda, tiga daftar materi 252.059–258.034, dan dua pembaca terkunci 267.650–267.656. Pembaca peserta aktif diklasifikasikan `blocked_renderer`. Ketiga flow Maestro kursus dan materi selesai pada Android. [Perbandingan dan tangkapan asli Android](../../../../../packages/native-parity/student/evidence/device-runs/45829658265/android/README.md)

| Permukaan | Web dengan sesi peserta | Fixture Android `14295fc2` |
| --- | --- | --- |
| Detail kursus | Judul kelas, pengalih kelas, pencarian dan lonceng, tab Ringkasan dan Dokumen, serta navigasi bawah. Bagian Silabus kelas menampilkan nomor bab, progres dan tautan. | Tombol kembali pada isi, judul dan deskripsi kursus, baris tindakan, tombol **Buka dokumen**, serta daftar bab dengan tautan ke dokumen yang tersedia. |
| Daftar materi | Shell kursus, filter dokumen, daftar bab yang bisa dibuka atau ditutup, pratinjau, dan navigasi bawah. | Judul dan filter materi dengan baris dokumen dalam bagian bab terbuka. Tangkapan memperlihatkan dua tombol **Kembali**. Fixture kini memakai tombol dari layar kursus untuk detail dan materi. |
| Pembaca | Saat akses diberikan, pembaca mengganti shell kursus dengan toolbar sendiri, isi artikel dan tindakan penyelesaian serta lanjut ke materi berikutnya atau kembali ke daftar. Saat akses terkunci, shell kursus dan form aktivasi tetap tampil. | Saat akses diberikan, judul dan pesan ketersediaan renderer mengonfirmasi bahwa materi diizinkan. Saat terkunci, pesan akses dan form aktivasi tampil. Tangkapan memperlihatkan dua tombol **Kembali**. |

Rute produk yang dipasang oleh generator membungkus `VerifiedStudentEntry` dengan `StudentChrome`. Navigasi atas dan bawah memakai shared UI setelah peran Student diverifikasi. `StudentChrome` menyediakan judul rute dan lonceng yang terikat sesi. Navigasi bawah disembunyikan untuk semua pola pembaca, termasuk saat materi terkunci. Generator menyembunyikan navigasi atas pada artikel yang boleh dibuka. Pengalih kelas, pencarian kursus dan tab tingkat kursus belum tersedia di shell tersebut. Jika navigasi atas tampil di atas layar kursus atau materi, tombol kembali pada isi juga tersedia. [Mount rute produk](../../../../../scripts/native-readiness/product/ProductRoute.tsx.in) · [Aturan chrome](../../../../../apps/mobile-native/routing/student-chrome.tsx) · [Pemasangan visibilitas](../../../../../scripts/native-readiness/product/mount.py)

Host produk masih perlu memasang `renderMaterial` setelah pembacaan detail mengizinkan akses. Tindakan toolbar, penyelesaian bab, dan lanjut ke materi berikutnya berada di pembaca web. Slot yang belum terpasang membuat pembaca artikel produk masih memakai pesan ketersediaan, dengan akses ke pustaka bacaan offline dari entry terverifikasi. Capture berikutnya untuk mengukur chrome terverifikasi memerlukan build rute produk dengan sesi Student yang benar dan renderer yang terpasang untuk keadaan diizinkan. Capture fixture saat ini menguji konten, izin dan navigasi lokal. [Kontrak reader dan host native](../../../../../apps/mobile-native/features/student/README.md) · [Aksi pembaca web](../../../../../components/course/structured-article-reader.tsx)

Flow kedaluwarsa memakai snapshot pendaftaran. Skenario `revoked` terpisah memeriksa pencabutan akses ketika pembaca dibuka di tengah sesi. Hasil iOS dan pengukuran ulang setelah perubahan tombol kembali masih diperlukan. [Alur pencabutan saat sesi berjalan](../../../../../.maestro/native-parallel/student/revoked.yaml)

## Reproduksi

Siapkan checkout Next.js dan PostgreSQL lokal menggunakan setup dan seed produk. Apabila checkout server berbeda, setel `STUDENT_SERVER_SHA` ke SHA yang dijalankan dan `STUDENT_PRODUCT_SEED_SOURCE` ke file seed yang digunakan oleh server. [Setup produk](README.md)

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/material-reference.ts
```

Skrip menulis tiga grup PNG dan manifest ke `artifacts/student-evidence/reference` atau `STUDENT_MATERIAL_REFERENCE_DIR`. Gunakan `--inputs-only` untuk memeriksa respons bertanda tangan tanpa membuka browser. Gunakan `--write-inputs` untuk memperbarui fixture bersama setelah perubahan seed atau proyeksi.
