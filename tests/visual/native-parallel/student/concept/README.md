# Penjelajah konsep Student

Referensi browser merender halaman server Next.js produksi dan komponen Markdown yang digunakan halaman tersebut. Fixture memasok sesi sintetis, keputusan akses, dan payload Student yang juga dibaca Expo. Fixture server memeriksa ID kelas, slug konsep, serta identitas akun, dan menolak pembacaan konsep saat akses terkunci. Formulir token diperiksa saat dirender. Pengiriman token dan otorisasi produksi memerlukan pengujian integrasi terpisah.

| Keadaan | Pemeriksaan |
| --- | --- |
| `populated` | Skor penguasaan 56, prasyarat Fungsi real, dan definisi Limit fungsi. |
| `long` | Judul konsep panjang tetap terbaca bersama definisi tanpa overflow horizontal di web. |
| `locked` | Pelajar tanpa akses melihat petunjuk aktivasi kelas. Skor dan definisi tersembunyi. |

Kedua target memakai bahasa Indonesia, tema terang, serta font Inter dan Lexend. Referensi Chromium memakai Android 380 × 820 DPR 1 dan iOS 402 × 874 DPR 3. Manifest mencatat payload, selector Maestro, dan SHA-256 sumber, font, serta PNG. [Manifest Android](web/android/concept-reference.json) · [Manifest iOS](web/ios/concept-reference.json) · [Skenario Maestro](../../../../../.maestro/native-parallel/student/concept-parity.yaml)

```sh
PLAYWRIGHT_BASE_URL=http://student-concept-reference.invalid \
  bunx playwright test tests/visual/native-parallel/student/concept-reference.spec.ts --project=mobile-380
```
