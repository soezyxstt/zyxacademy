# Progres belajar Student

Playwright merender `StudentCourseProgressView` produksi dengan data statistik dan aktivitas dari fixture Student yang juga dibaca Expo. Maestro membuka layar Expo dengan tautan fixture yang sama. Layar web menampilkan waktu relatif dengan jam browser tetap. Expo memakai tanggal dan waktu setempat dari timestamp yang sama. Kedua layar menampilkan hitungan nol saat statistik belum tersedia.

| Keadaan | Pemeriksaan |
| --- | --- |
| `populated` | Waktu belajar 35 menit, 2 materi selesai, 12 ulasan, streak 3 hari, dan aktivitas Limit fungsi. Aksi menuju hasil per topik. |
| `long` | Judul aktivitas panjang terbaca tanpa overflow horizontal. |
| `empty` | Pesan belum ada aktivitas dan tautan hasil penilaian tersedia. |

Kedua target memakai bahasa Indonesia, tema terang, serta font Inter dan Lexend. Referensi Chromium memakai Android 380 × 820 DPR 1 dan iOS 402 × 874 DPR 3. Manifest mencatat data, selector Maestro, serta SHA-256 berkas sumber, font, dan PNG. [Manifest Android](web/android/progress-reference.json) · [Manifest iOS](web/ios/progress-reference.json) · [Skenario Maestro](../../../../../.maestro/native-parallel/student/progress-parity.yaml)

```sh
PLAYWRIGHT_BASE_URL=http://student-learning-reference.invalid \
  bunx playwright test tests/visual/native-parallel/student/learning-reference.spec.ts --project=mobile-380
```
