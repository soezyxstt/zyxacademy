# Alur belajar Student

Playwright menjalankan `StudyPathTimeline` produksi dengan permintaan yang sama dari layar Expo ke fixture `/api/student/study-path`. Fixture browser memasok akun sintetis. Alur ini menguji tampilan dan interaksi perencanaan. Pengujian otorisasi API dijalankan terpisah di integrasi HTTP Student.

| Keadaan | Pemeriksaan |
| --- | --- |
| `roadmap` | Langkah Limit fungsi tersedia dengan perkiraan 8 menit. Kekontinuan terkunci dan menampilkan prasyarat setelah panel web dibuka. |
| `plan` | Playwright memeriksa permintaan `days=7`. Maestro memeriksa nilai 7 pada input dan rencana Hari 1 dengan durasi 8 menit. Fixture mengembalikan rencana yang sama untuk setiap target. Aksi Lihat roadmap mengembalikan daftar sebelumnya. |
| `empty` | Data langkah kosong memunculkan penjelasan dan kontrol perencanaan tersembunyi. |

Kedua target memakai bahasa Indonesia, tema terang, serta font Inter dan Lexend. Referensi Chromium memakai Android 380 × 820 DPR 1 dan iOS 402 × 874 DPR 3. Manifest mencatat data, selector Maestro, serta SHA-256 berkas sumber, font, dan PNG. [Manifest Android](web/android/study-path-reference.json) · [Manifest iOS](web/ios/study-path-reference.json) · [Skenario Maestro](../../../../../.maestro/native-parallel/student/study-path-parity.yaml)

```sh
PLAYWRIGHT_BASE_URL=http://student-learning-reference.invalid \
  bunx playwright test tests/visual/native-parallel/student/learning-reference.spec.ts --project=mobile-380
```
