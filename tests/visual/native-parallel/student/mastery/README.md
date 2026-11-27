# Penguasaan materi Student

Referensi memakai `ConceptMap` web produksi dan layar `MasteryContent` Expo melalui entry Student. Keduanya membaca fixture transport Student yang sama pada `/courses/matematika-1/mastery`. Playwright merender susunan komponen halaman web tanpa sesi Next.js. Maestro membuka layar Expo melalui entry fixture. Judul dan bilah navigasi web serta pembungkus dan safe area Expo dapat berbeda.

| Keadaan | Masukan dan pemeriksaan |
| --- | --- |
| `review` | Fixture `enrolled` menampilkan saran ulang Limit fungsi dengan skor 56/100 dan satu dari dua topik dinilai. Bab masih tertutup. |
| `expanded` | Payload sama. Bab dan daftar belum dinilai dibuka. Periksa skor dan tren, prasyarat Fungsi real, topik Limit sepihak, lalu aksi menuju konsep. |
| `empty` | Fixture `empty` menghasilkan daftar bab kosong. Periksa petunjuk dan aksi menuju alur belajar. |

Kedua target menggunakan bahasa Indonesia, zona Asia/Jakarta, tema terang, dan aset Inter serta Lexend dari Expo. Referensi Chromium memakai viewport Android 380 × 820 DPR 1 dan iOS 402 × 874 DPR 3. Manifest menyimpan payload, keadaan panel, selector Maestro, dan SHA-256 berkas sumber, font, serta PNG. Artefak web tersedia untuk kedua ukuran. Jalankan Maestro pada perangkat untuk memperoleh tangkapan layar native dan selisih piksel. [Manifest Android](web/android/mastery-reference.json) · [Manifest iOS](web/ios/mastery-reference.json) · [Skenario Maestro](../../../../../.maestro/native-parallel/student/mastery-parity.yaml)

```sh
PLAYWRIGHT_BASE_URL=http://student-mastery-reference.invalid \
  bunx playwright test tests/visual/native-parallel/student/mastery-reference.spec.ts --project=mobile-380
```
