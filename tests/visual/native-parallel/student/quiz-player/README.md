# Referensi pemain kuis Student

Pemain kuis berada di rute `/courses/[id]/quiz/[quizId]?attemptId=…`. Referensi ini menggunakan percobaan aktif Kuis bilangan dasar, tiga soal pilihan tunggal, tanpa batas waktu, dengan locale Indonesia dan tema terang. Komponen web produksi `QuizPlayer` dan `CoursePageShell` dirender dengan komposisi yang dipakai halaman kuis setelah akses diberikan. Fixture menyediakan data yang sama untuk pemain native melalui `StudentEntry`. [Halaman produksi](../../../../../app/(student)/courses/%5Bid%5D/quiz/%5BquizId%5D/page.tsx) · [Data fixture](../../../../../packages/native-parity/student/assessment/quiz-player-fixture.ts) · [Pemain native](../../../../../apps/mobile-native/features/student/assessment/player.tsx) · [Playwright](../quiz-player-reference.spec.ts) · [Maestro](../../../../../.maestro/native-parallel/student/quiz-player.yaml)

| Target | Belum dijawab | Sudah dijawab | Tanda ragu-ragu dipulihkan | Manifest |
| --- | --- | --- | --- | --- |
| Android, 380 × 820, DPR 1 | [PNG](web/android/quiz-player-unanswered.png) | [PNG](web/android/quiz-player-answered.png) | [PNG](web/android/quiz-player-flagged-restored.png) | [Input dan SHA-256](web/android/quiz-player-reference.json) |
| iPhone 17 Pro, 402 × 874, DPR 3 | [PNG](web/ios/quiz-player-unanswered.png) | [PNG](web/ios/quiz-player-answered.png) | [PNG](web/ios/quiz-player-flagged-restored.png) | [Input dan SHA-256](web/ios/quiz-player-reference.json) |

Kedua flow membuka soal pertama tanpa jawaban, memilih B (4), menandai soal, lalu berpindah ke soal kedua dan kembali. Playwright membuka ulang halaman dan memverifikasi jawaban, tanda ragu-ragu, indeks soal, serta isi draf di `localStorage`. Maestro membuka kembali fixture setelah memulai ulang proses aplikasi dengan penyimpanan SQLite dipertahankan. Maestro memeriksa soal pertama, status radio, jumlah jawaban, serta tanda ragu-ragu sebelum tangkapan terkait.

PNG web berasal dari Chromium 154.0.8037.57 dan Playwright 1.62.1. PNG iOS berukuran fisik 1206 × 2622 piksel. Manifest mencatat input, hash sumber dan font, serta assertion Maestro yang harus selesai sebelum pengambilan tangkapan native. Lingkup web adalah fixture komponen produksi. Autentikasi, pengiriman jawaban, cuplikan native Android dan iOS, serta selisih piksel belum tercakup dalam bukti ini. Native memakai header dan tombol pemainnya sendiri dengan safe area perangkat.

```sh
PLAYWRIGHT_BASE_URL=http://student-quiz-player-reference.invalid \
bunx playwright test tests/visual/native-parallel/student/quiz-player-reference.spec.ts \
  --project=mobile-380 --reporter=list --output artifacts/student-evidence/reference/quiz-player
```
