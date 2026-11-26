# Referensi gateway kuis Student

Playwright menjalankan `StudentQuizGateway` dan `QuizStartButton` produksi. Fixture browser membaca respons sintetis yang sama dengan `StudentEntry` native. Tiga keadaan memakai kelas Kalkulus dasar, kuis Fungsi, limit, dan turunan, 3 soal, durasi 15 menit, tema terang, locale Indonesia, dan aset font Inter serta Lexend dari aplikasi native. Browser menggunakan Chromium 154.0.8037.57 dan Playwright 1.62.1. [Fixture data](../../../../../packages/native-parity/student/assessment/fixtures.ts) · [Spec Playwright](../quiz-gateway-reference.spec.ts) · [Flow Maestro](../../../../../.maestro/native-parallel/student/quiz-gateway.yaml)

| Target | Baru | Bisa dilanjutkan | Batas percobaan tercapai | Manifest |
| --- | --- | --- | --- | --- |
| Android, 380 × 820, DPR 1 | [PNG](web/android/quiz-gateway-new.png) | [PNG](web/android/quiz-gateway-resumable.png) | [PNG](web/android/quiz-gateway-exhausted.png) | [Input dan SHA-256](web/android/quiz-gateway-reference.json) |
| iPhone 17 Pro, 402 × 874, DPR 3 | [PNG](web/ios/quiz-gateway-new.png) | [PNG](web/ios/quiz-gateway-resumable.png) | [PNG](web/ios/quiz-gateway-exhausted.png) | [Input dan SHA-256](web/ios/quiz-gateway-reference.json) |

Pada keadaan baru, peserta dapat mulai dan riwayat masih kosong. Pada keadaan bisa dilanjutkan, ada satu percobaan aktif dan satu percobaan selesai. Pada keadaan batas tercapai, ada satu percobaan selesai dengan kuota satu. Maestro memeriksa nilai, riwayat dan kontrol sebelum setiap tangkapan. Flow kemudian membuka pemain dari aksi mulai dan lanjutkan, membuka hasil yang masih menutup pembahasan, serta memeriksa navigasi Batal.

```sh
PLAYWRIGHT_BASE_URL=http://student-quiz-gateway-reference.invalid \
bunx playwright test tests/visual/native-parallel/student/quiz-gateway-reference.spec.ts \
  --project=mobile-380 --reporter=list --output artifacts/student-evidence/reference/quiz-gateway
```

Tangkapan browser mencakup komponen gateway tanpa shell akun web. Fixture Expo memuat identitas kelas, kontrol kembali bawaan layar, dan safe area perangkat. Instruksi penyimpanan draf dan melanjutkan kuis menyebut browser pada web dan aplikasi pada native. Aksi lanjutkan juga masih memakai warna tombol utama native. Tangkapan Expo pada Android dan iOS serta pengukuran selisih piksel masih diperlukan. [Layout native](../../../../../apps/mobile-native/features/student/assessment/quiz-gateway-layout.tsx)
