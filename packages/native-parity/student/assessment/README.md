# Asesmen Student di Expo

Ekspor integrasi `AssessmentScreen` dari `apps/mobile-native/features/student/assessment/index.tsx`. Ada sembilan pola rute hasil inventaris Student. Router dan transport bersama mengikat akun, origin, sesi dan bahasa. Renderer produk, penyimpanan draf dan pemilih berkas diteruskan lewat `StudentScreenProps`.

## Operasi dan izin

Basis adapter HTTPS adalah `/api/native/student/assessment/[courseId]`. Identitas peserta diambil dari sesi oleh `requireNativeStudent`, dicocokkan dengan `x-student-id`, lalu setiap operasi memeriksa kursus, rekaman, dan lisensi konten terkait. Semua respons adapter bersifat `private, no-store`.

| Operasi | Rute dan pemanggil web | Layanan dan batas akses | Pemulihan |
| --- | --- | --- | --- |
| Katalog kuis | `GET /quiz`, `StudentQuizListView` | `getStudentVisibleCourseQuizzes`, resolver akses kursus, dan kebijakan kuis bebas. Filter `access` menerima `free` atau `premium`. | Muat ulang dengan filter yang sama. |
| Petunjuk, soal, pembahasan kuis | `GET /quiz/[quizId]`, `CourseQuizTakePage` | `findQuizAttempt` mengikat kursus, template dan peserta. Proyeksi soal aktif berisi tampilan soal dan jawaban peserta. Pembahasan menggunakan release policy dan pencatatan disclosure. PKA mengecek pemetaan dan status tahap, termasuk template lama berkategori `chapter`. | Draf rehidrasi per percobaan. Coba lagi pada kegagalan baca. |
| Mulai kuis | `POST /quiz/[quizId]`, `QuizStartButton` | Delegasi ke `POST /api/quiz/attempts` untuk izin, jadwal, kuota dan pemilihan soal. Input tambahan `requestId` UUID opsional pada kontrak lama. | UUID yang tersimpan mengembalikan reservasi yang sama, termasuk jika dua permintaan berbarengan atau respons hilang. |
| Kumpulkan kuis | `POST /quiz/[quizId]/attempt/[attemptId]`, `QuizPlayer` | Delegasi ke `POST /api/quiz/attempts/[id]` untuk penilaian, batas percobaan, transaksi bukti, dan peristiwa belajar. Pemeriksaan identitas dan keanggotaan ID soal dilakukan sebelum delegasi. | Respons untuk percobaan milik peserta yang sudah selesai mengakui pengumpulan yang sama. Draf dibersihkan setelah konfirmasi. |
| Katalog dan soal tryout | `GET /tryout`, `GET /tryout/[tryoutId]`, `StudentTryoutsView` dan `TryoutForm` | Tryout terbit, kursus yang cocok, akses penuh dan jadwal aktif untuk membuka soal. Kuota dicocokkan dengan jumlah pengumpulan peserta dari database. | Muat ulang dan pulihkan draf untuk tryout yang sama. |
| Kumpulkan tryout | `POST /tryout/[tryoutId]`, `submitTryoutAction` | `submitStudentTryout` dipakai oleh adapter dan Server Action. Input native memvalidasi set soal, tipe jawaban, indeks pilihan dan bukti lampiran. Audit dan mutasi penilaian Tutor tetap terpisah. | Draf menyimpan UUID dan jawaban pengumpulan sebelum pengiriman pertama. Retry membaca kembali hasil yang sama dan tidak mengurangi kuota lagi. |
| Lampiran jawaban | `POST /quiz/[quizId]/attachment`, `POST /tryout/[tryoutId]/attachment`, dan `DELETE /quiz/[quizId]/attachment` | Adapter mengecek soal, izin, ukuran aktual dan tipe, lalu mendelegasikan pengunggahan ke endpoint quiz/exam yang sudah ada. Tryout menggunakan bukti yang terikat peserta, soal, berkas, dan UUID draf. | Unggah lagi jika gagal. Penghapusan lampiran kuis memeriksa percobaan aktif dan file key terdaftar. Untuk tryout, melepas lampiran dari jawaban mengikuti alur web. |
| Riwayat dan review | `GET /my-results`, `GET /my-results/[submissionId]`, `StudentCourseResultsList` dan `StudentSubmissionReviewView` | Join hasil dengan kursus dan pemilik. Daftar dan hasil tryout memerlukan akses penuh. Kuis memakai otorisasi template dan soal serta kebijakan pembahasan. | Muat ulang hasil ketika akses berubah. |
| Diagnosis | `GET` dan `POST /quiz/[quizId]/summary/[attemptId]`, `GET` dan `POST /my-results/[submissionId]/summary`, `QuizAnalyticsView` | Kuis harus dimiliki peserta, selesai, pembahasan telah dibuka, dan esai telah dinilai. Delegasi ke analytics handler kuis dengan validasi bentuk dan identitas hasil. | Refresh status saat diproses. Hitung ulang via POST. |
| Pembahasan terbit | `GET` dan `POST /solutions/[collectionId]`, `SolutionCollectionReader` | `getPublishedSolutionCollection` memeriksa publikasi, kursus, bab dan konten. `completeGamificationExplanation` memerlukan enrollment penuh, versi sesuai, dan seluruh ID soal yang dirilis. | Muat ulang bila versi berubah. Jalankan ulang penyelesaian dengan versi sama jika penyimpanan belum terkonfirmasi. |

Seluruh operasi di tabel dimiliki jalur Student. Operasi penulisan, moderasi, dan penilaian Tutor/Admin tetap dimiliki jalur akademik atau operasi. Katalog MCP menandai adapter peserta sebagai `excluded`. Scope, consent, discovery, tool, playbook, skill terkemas, host prompt, klien dan binding lingkungan MCP tidak memerlukan perubahan.

## Fixture dan bukti

- `fixtures.ts` mengekspor `assessmentFixturePaths`, `assessmentFixtureCases` dan `createAssessmentFixtureRequest`. Fixture menggunakan namespace `student.assessment.*` dan data sintetis. Skenario `retry` menyimpan pengumpulan pada fixture sebelum mensimulasikan respons terputus.
- `.maestro/native-parallel/student/assessment-*.yaml` mencakup kuis yang dipulihkan setelah kembali dari daftar, tryout dengan retry dan hasil, serta pembukaan pembahasan dan penyelesaian koleksi. Runner Android dan iOS memakai daftar skenario ini. Eksekusi simulator dan screenshot device menunggu hasil CI.
- `tests/contracts/native-student-assessment.test.ts` menguji route handler di atas PGlite dengan autentikasi sintetis, tabel dan constraint PostgreSQL terpakai, tanpa database eksternal. Tes mencakup akun salah, sesi kedaluwarsa, kursus silang, pencabutan akses, pengulangan quiz dan tryout, kuota, proyeksi jawaban aktif, release, dan pemulihan draf.
- `tests/visual/student-assessment-layout.spec.ts` dan `tests/visual/tryout-submission.spec.ts` memakai komponen web produksi dengan fixture sintetis. Chromium lokal lulus 5 skenario pada 380 × 844, DPR 1, bahasa Indonesia dan tema terang. Capture gateway kuis, hasil, dialog, dan pemulihan tryout disimpan di `artifacts/student-evidence/assessment-web/`. Harness fixture memakai font fallback saat memuat komponen ini.
- `tests/visual/native-parallel/student/assessment-reference.spec.ts` memuat gateway kuis dan hasil web menggunakan aset Inter dan Lexend dari Expo. Dua pengujian lulus dan menghasilkan delapan tangkapan layar pada 380 × 844, DPR 1, bahasa Indonesia, zona Asia/Jakarta dan tema terang serta gelap. Hasil lokal berada di `artifacts/student-evidence/assessment-themed-web/`.
- Capture web produk memakai halaman Next.js untuk peserta sintetis di PostgreSQL loopback. Metadata mencantumkan SHA server, Chromium, viewport 380 × 820, DPR 1, tema terang, locale id-ID dan zona Asia/Jakarta. Capture gateway kuis memeriksa petunjuk. Capture draf kuis dan tryout memilih jawaban, memeriksa penyimpanan browser, memuat ulang halaman, lalu memeriksa bahwa jawaban masih terpilih. [Manifest web produk](../../../../tests/visual/native-parallel/student/product/assessment-web/web.json)
- Run kontrak lokal meluluskan 34 tes dari empat suite termasuk regresi kuis dan Tutor yang sudah ada. Pengujian ulang meluluskan 17 tes asesmen, akses kuis bebas dan katalog MCP, termasuk proyeksi soal historis, unggah multipart tryout, penyelesaian koleksi dengan bab kanonik, serta template tahap PKA lama berjenis `chapter`. Sepuluh tes pengendali foto Expo dan delapan tes file Expo lulus, termasuk pemulihan Android yang terikat draf, pembuangan hasil lama, tipe file, dan batas byte.

```sh
bun scripts/test-contracts.ts tests/contracts/native-student-assessment.test.ts tests/contracts/free-quiz-attempt-access.test.ts tests/contracts/quiz-timeout-submission.test.ts tests/contracts/tutor-grading-scope.test.ts tests/contracts/admin-mcp-catalog.test.ts
npm run typecheck --prefix apps/mobile-native
PLAYWRIGHT_BASE_URL=http://127.0.0.1:9 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium bunx playwright test tests/visual/student-assessment-layout.spec.ts tests/visual/tryout-submission.spec.ts --project=mobile-380 --output=artifacts/student-evidence/assessment-web
```

Untuk mengulang capture produk, siapkan Next.js dan PostgreSQL di loopback. Seed mengatur akun khusus asesmen, memperbarui awal percobaan kuis, dan membuat data hasil sintetis. Capture menjalankan satu browser secara berurutan, memeriksa kesalahan hidrasi dan lebar halaman, serta memakai status pengingat yang sebelumnya ditunda oleh akun sintetis. [Setup server dan database](../../../../tests/visual/native-parallel/student/product/README.md)

```sh
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-seed.ts
STUDENT_SERVER_SHA=$(git rev-parse HEAD) \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-capture.ts
```

`STUDENT_ASSESSMENT_CAPTURE_CASES` menerima daftar ID skenario yang dipisahkan koma untuk menjalankan sebagian kasus. `STUDENT_CAPTURE_DIR` dapat mengarahkan PNG dan manifest ke direktori lain. Manifest memuat kesalahan assertion, hidrasi, atau runtime untuk tiap kasus yang gagal.

Draf memakai store terikat akun dan origin. Bila store yang dikonfigurasi melaporkan gagal membaca atau menyimpan identitas pengiriman, UI memberi tindakan ulang sebelum mutasi berjalan. `VerifiedStudentEntry` menyediakan pilihan foto dan dokumen pada soal yang mengizinkannya. Foto galeri dipulihkan pada Android jika sesi, origin, locale, rute, percobaan, draf dan soal masih cocok. `scopedFiles` menyalin dokumen pilihan ke cache privat, memverifikasi header file dan ukuran, dan mengikat hasil ke target draf yang sama. File sementara dilepas saat unggah selesai, gagal, atau target tidak aktif lagi. Pemulihan dokumen setelah proses mati memerlukan pemilihan ulang.

`renderAssessmentMarkdown` dan `renderAssessmentParts` bergantung pada renderer dari host native. Dengan renderer default, soal dan rumus tampak sebagai teks, dan visual interaktif menggunakan keterangan yang tersedia. Penggunaan kedua picker pada perangkat, rumus dan visual interaktif, pemulihan setelah proses mati, kombinasi tema dan skala font, dan perbandingan nol piksel berbeda belum diverifikasi. Fixture tiga kasus per komposisi adalah input untuk capture, dan hasil perangkat menjadi dasar klaim paritas.
