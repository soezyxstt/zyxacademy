# Referensi web flashcard Student

Referensi untuk halaman produk Learning dengan sesi Student dan PostgreSQL sintetis disimpan bersama manifest dan seed. [Referensi produk](product/README.md)

## Referensi pada ukuran perangkat CI

Kedua target memakai dua kartu dari fixture native yang sama, mode Standar, tema terang, locale Indonesia, dan berkas font Inter milik aplikasi native. Playwright membuka path flashcard dan merakit komponen web produksi `ApplicationShell`, `StudentMobileTopNav`, `CourseMobileTabNav`, `StudentFlashcardsView`, `Reveal` dan `AppToaster`. Header memakai tombol kembali, pemilih kelas Kalkulus Dasar, pencarian dan notifikasi sesuai rute web. Sesi, data, permintaan review dan hitungan notifikasi memakai transport fixture. Sesi autentikasi Next.js dan overlay akun berada pada referensi produk. Playwright menahan permintaan grade `Paham` untuk menangkap keadaan menunggu, lalu mengembalikan penolakan HTTP 422. Maestro memeriksa keadaan yang sama dan memastikan percobaan ulang eksplisit berpindah ke kartu kedua. [Data bersama](../../../../../packages/native-parity/student/learning/flashcard-fixture.ts) · [Maestro](../../../../../.maestro/native-parallel/student/learning-flashcard-review.yaml)

| Target | Kartu depan | Penilaian menunggu | Penilaian ditolak | Manifest |
|---|---|---|---|---|
| Android, 380 × 820, DPR 1 | [PNG](web/android/flashcard-question.png) | [PNG](web/android/flashcard-review-pending.png) | [PNG](web/android/flashcard-review-failed.png) | [SHA-256 dan input](web/android/flashcard-reference.json) |
| iPhone 17 Pro, 402 × 874, DPR 3 (1206 × 2622 piksel) | [PNG](web/ios/flashcard-question.png) | [PNG](web/ios/flashcard-review-pending.png) | [PNG](web/ios/flashcard-review-failed.png) | [SHA-256 dan input](web/ios/flashcard-reference.json) |

```sh
PLAYWRIGHT_BASE_URL=http://learning-query.invalid \
bun run test:visual tests/visual/learning-query.spec.ts --project mobile-380 \
  --grep 'flashcard reference matches the device inputs'
```

CI memeriksa manifest input dan hash PNG web, hasil flow Maestro, serta ukuran gambar sebelum menghitung selisih seluruh tangkapan tanpa penskalaan. Perbandingan dengan referensi web yang sekarang menyertakan navigasi menunggu tangkapan perangkat dari revisi yang sama. [Pembanding](../compare.py)

Dua pengambilan ulang lokal setelah paint awal menghasilkan lima pasang PNG web yang identik. Pada keadaan menunggu di ukuran Android, 631 piksel berbeda dengan selisih maksimum satu tingkat RGB. Manifest memuat hash tangkapan yang disimpan.

## Selisih Android pada run 45818468369

Run ini membandingkan 311.600 piksel per keadaan dari source head `379dbde47ad55e7689b5bf6e65f4812e5549063d` dan checkout `8f073512c063882ac5a24621824ad7cee84c2832`. Komposisi web saat itu sudah memakai `StudentFlashcardsView`, dengan judul halaman yang hanya tersedia untuk pembaca layar. Chrome navigasi web belum dimuat pada fixture tersebut. Android memakai tombol `Kembali`, judul `Flashcard: Kalkulus Dasar`, dan bilah sistem asli. Saat kartu dibalik, dok penilaian Android juga berhenti di atas safe area bawah. [Tangkapan web dan Android, SHA-256 per file](../../../../../packages/native-parity/student/evidence/device-runs/45818468369/android/provenance.json)

| Keadaan | Piksel berbeda | SHA-256 PNG selisih |
|---|---:|---|
| Pertanyaan | 23.397 (7,51%) | `d2848d8495a9d9984fc1d1b4336225a197c7a24c535ba2dea6fcc6be4ab51c0b` |
| Menunggu penilaian | 45.803 (14,70%) | `61c0e1c05cb45c8402a9a44522057775943142653f33b31c78003562a3873d7c` |
| Penilaian ditolak | 68.175 (21,88%) | `9dd0e329a64fb389e3fa39d2cdaa2c749299dbda9f14cc9edfb2720844347f93` |

Perhitungan ulang dari pasangan PNG asli menghasilkan hitungan yang sama. SHA-256 ZIP Android adalah `2c3746d0cb2bdef7f9dde97e88a4bd949f5e774f39c07a5454faf63ba862b874` dan SHA-256 ZIP web adalah `7b63dacf1755914a15bb7d6f2002e4d02552430d3577df66850640a068bb9179`. Flow Android melewati tiga tangkapan lalu berpindah ke kartu kedua setelah satu penilaian ulang. [Selisih CI](../../../../../packages/native-parity/student/evidence/device-runs/45818468369/android/comparison.json) · [JUnit Maestro](../../../../../packages/native-parity/student/evidence/device-runs/45818468369/android/report.xml)

## Referensi regresi web 380 × 844

Tangkapan Playwright menggunakan komponen flashcard web dan data sintetis pada Chromium 154.0.8037.57 dengan Playwright 1.62.1. Project `mobile-380` menetapkan viewport 380 × 844, DPR 1, tema terang, locale `id-ID`, dan zona waktu `Asia/Jakarta`. Fixture membekukan waktu pada 18 November 2026 untuk mengontrol percobaan review. [Spec Playwright](../../../learning-query.spec.ts) · [Fixture UI](../../../fixtures/learning-query.tsx)

| Kasus | Tangkapan asli | SHA-256 |
|---|---|---|
| Pertanyaan sebelum kartu dibalik. Panel penilaian belum terlihat. | [question.png](web/question.png) | `cb6abc4721c6a0dd21161e0aab1d7436fa5efccdee8bd0c7c9761317912cabf2` |
| Jawaban terbuka. Empat nilai dibekukan sementara saat permintaan berjalan. | [review-pending.png](web/review-pending.png) | `f86768e330e130a5aeb20dabd218161e4d4ea6a5fd55e90b9e778e21dc0f0ca6` |
| Respons review tidak valid. Kartu dan panel penilaian tetap terlihat. | [review-failed.png](web/review-failed.png) | `05d571c64ae2858324f9cdc7b69ecc31dca11ad86462e2d4788f328e19943026` |

Blob Git untuk komponen flashcard web adalah `3c70ac7be0f98b67866aace9a86b9e7b4519978c`. Blob spec adalah `35139f8e79a1cf8cb42931c51329d3149b3f1fa6`, fixture UI `f8efa7f7ba80082b99a9d46d8c5bc88345ac3d41`, dan builder fixture `dbaf7276e15ccf9d36a0f473f48d89af9ece8ec9`. File PNG disalin tanpa perubahan dari hasil Playwright.

```sh
PLAYWRIGHT_BASE_URL=http://learning-query.invalid \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
bun run test:visual tests/visual/learning-query.spec.ts \
  --project mobile-380 --grep 'flashcards keep the active card'
```

Ketiga tes flashcard web lulus di viewport 380 × 844 dan 1536 × 864. Spec memeriksa perubahan akun, status simpan, pemulihan, koordinat overflow horizontal, serta error HTTP dan konsol. Pada kedua tangkapan sisi jawaban di sini, batas atas panel penilaian web mulai pada y=777 dan menyisakan 67 px hingga dasar viewport. [Komponen web](../../../../../app/(student)/courses/[id]/flashcard/flashcard-client.tsx)

## Perbedaan yang perlu diukur pada perangkat

Expo menempatkan panel penilaian di bawah area gulir pada lebar kurang dari 768 dp, di dalam safe area host. Tombol tetap mengikuti ukuran teks perangkat. Pada layout lebar, panel mengikuti urutan isi halaman. Kartu memakai rotasi perspektif 600 ms ketika pengurangan gerak dinonaktifkan. Pada preferensi pengurangan gerak aktif, sisi kartu berganti langsung dan sisi tersembunyi keluar dari pohon aksesibilitas.

Expo memakai radius kartu 18 dp, warna latar untuk empat grade dan pemberitahuan penolakan di tepi atas. Label grade memakai warna teks dengan kontras tinggi. Ikon balik dan lewati mengikuti ikon Lucide dari komponen web. Fallback native memakai ukuran paragraf 18 dp untuk pertanyaan pendek dan 16 dp untuk jawaban serta penjelasan. Web menampilkan rumus inline melalui KaTeX. Host fixture Expo merender teks sumber sampai renderer Markdown terhubung melalui `renderAssessmentMarkdown`. Shell native, safe area sistem, ornamen latar web, dan rasterisasi antarplatform tetap terlihat di tangkapan utuh.

Penolakan eksplisit mempertahankan kartu, mengaktifkan kembali grade dan menunggu percobaan ulang dari pengguna. Respons yang ambigu menampilkan pemulihan antrean sebelum grade berikutnya. Panel menyesuaikan ukuran teks dan tetap berada dalam safe area native. Fokus aksesibilitas dan perilaku dengan pengurangan gerak aktif atau nonaktif masih memerlukan uji perangkat terpisah.
