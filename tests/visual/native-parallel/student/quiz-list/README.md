# Referensi daftar kuis Student

Rute `/courses/[id]/quiz` menampilkan semua kuis untuk kelas Kalkulus dasar. Playwright memuat `StudentQuizListView`, `QuizListClient`, dan formulir aktivasi produksi. Manifest menyimpan respons fixture native yang diterima browser dan parameter yang dipakai Maestro. Keadaan diterbitkan dan terkunci memakai kuis yang sama dengan tiga soal, batas waktu 15 menit, dan nilai tertinggi 80%. Pada keadaan kosong, kelas masih dapat diakses, tetapi belum memiliki kuis. [Spec Playwright](../assessment-lists-reference.spec.ts) · [Flow Maestro](../../../../../.maestro/native-parallel/student/quiz-list.yaml)

| Profil Playwright | Diterbitkan | Terkunci | Kosong | Manifest |
| --- | --- | --- | --- | --- |
| Android, 380 × 820, DPR 1 | [PNG](web/android/quiz-list-published.png) | [PNG](web/android/quiz-list-locked.png) | [PNG](web/android/quiz-list-empty.png) | [Input dan SHA-256](web/android/quiz-list-reference.json) |
| iPhone 17 Pro, 402 × 874, DPR 3 | [PNG](web/ios/quiz-list-published.png) | [PNG](web/ios/quiz-list-locked.png) | [PNG](web/ios/quiz-list-empty.png) | [Input dan SHA-256](web/ios/quiz-list-reference.json) |

Cakupan web adalah isi halaman dengan heading aksesibel. Navigasi akun, aktivasi token melalui server, dan pergantian filter berada di luar cakupan. Pada lebar ponsel, contoh token di input web terpotong. Native menampilkan judul dan kontrol kembali di layar, serta mengarahkan pengguna ke halaman kelas melalui aksi aktivasi. Tangkapan Maestro aktual pada kedua platform dan pengukuran visual masih tertunda.

```sh
PLAYWRIGHT_BASE_URL=http://student-assessment-lists-reference.invalid \
bunx playwright test tests/visual/native-parallel/student/assessment-lists-reference.spec.ts \
  --project=mobile-380 --reporter=list --output artifacts/student-evidence/reference/assessment-lists
```
