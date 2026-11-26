# Referensi web akademik

Playwright merender komponen produksi dari Next.js lewat harness lokal, dengan CSS global aplikasi, font Inter dan Lexend yang tersedia di repositori, dan fixture akademik bersama. Harness memakai navbar dan pembungkus halaman asli. Shell peran lengkap, autentikasi, Server Components, dan koneksi layanan eksternal berada di luar cakupan tangkapan ini. Pembacaan yang diperlukan untuk interaksi menggunakan data sintetis.

`cases.ts` menetapkan komponen asal, URL, tema, interaksi dan pemeriksaan bagi tiga kasus setiap komponen. Jalur `/tutor/[courseId]/tryouts` pada fixture menampilkan `TryoutsClient` yang juga dipakai oleh halaman web `/visual-fixtures/tutor-tryouts`. Rute Tutor yang terproteksi saat ini mengarahkan ke ringkasan kursus.

## Reproduksi

```sh
bun install --frozen-lockfile
bun run test:visual:install
bun tests/visual/native-parallel/academic/capture.ts
PARITY_DPR=3 bun tests/visual/native-parallel/academic/capture.ts
python3 tests/visual/native-parallel/academic/contact-sheet.py \
  tests/visual/native-parallel/academic/web/dpr1/manifest.json \
  artifacts/native-parity/academic/web/contact-sheet.png
```

Jika Chromium lokal sudah tersedia, gunakan `PARITY_CHROMIUM_EXECUTABLE=/usr/bin/chromium`. `PARITY_OUTPUT_DIR` dapat menunjuk ke direktori artefak lain. Untuk satu kelompok atau kasus tertentu, gunakan `PARITY_CASES=tutor-participants` atau `PARITY_CASES=tutor-participants-enrolled-light`. Pembuat lembar kontak memakai Python 3.12 dan Pillow.

Tangkapan mobile menggunakan viewport 380 × 844 CSS px, DPR 1 atau 3, locale `id-ID`, zona waktu `Asia/Jakarta`, dan waktu tetap `2026-11-28T02:00:00Z`. Setiap manifest mencatat ukuran PNG, hash, versi Chromium, sumber dan jalur setiap kasus.

## Perbandingan perangkat

Workflow `.github/workflows/native-parity.yml` membaca registri galeri pusat dan membandingkan cuplikan primitif 320 × 100 px. Skrip `scripts/native-parity/check-interactions.sh` menjalankan `.maestro/native-parity/academic.yaml` bersama alur Maestro lain setelah build Expo terpasang. Arsip `android-parity` dan `ios-parity` menyimpan PNG dari langkah `takeScreenshot` di `interactions/results/`. Catat SHA build, model dan versi OS, viewport konten dalam dp, densitas, serta batas konten dalam piksel. Ukur batas aktual dengan memperhitungkan status bar, safe area dan navbar perangkat. Pertahankan file PNG mentah saat membuat manifest.

`device-manifest.py` menggunakan delapan pasangan nama screenshot Maestro dan kasus Playwright dengan peran, data, state, dan tema yang sama. Kasus yang tidak memiliki padanan semantik, seperti layar detail peserta yang terpisah di native, tidak dipasangkan. Nama screenshot yang tidak ditemukan tercatat dalam manifest perangkat.

Unduh artefak Android dari run yang ingin diuji. Untuk iOS, gunakan nama artefak iOS dan referensi DPR 3.

```sh
gh run download <ID-run> --repo soezyxstt/zyxacademy \
  --name android-parity \
  --dir artifacts/native-parity/academic/android/raw
```

Buat manifest dengan ukuran yang diukur dari build dan screenshot perangkat. Gunakan viewport dan batas konten per kasus dalam JSON apabila chrome perangkat berubah di antara tangkapan.

```sh
python3 tests/visual/native-parallel/academic/device-manifest.py \
  artifacts/native-parity/academic/android/raw/interactions/results \
  artifacts/native-parity/academic/android/manifest.json \
  --platform android --device "<model dan versi Android>" --revision "<SHA build>" \
  --dpr 1 --viewport <lebar-dp> <tinggi-dp> \
  --bounds <kiri-px> <atas-px> <lebar-px> <tinggi-px>

python3 tests/visual/native-parallel/academic/compare.py \
  tests/visual/native-parallel/academic/web/dpr1/manifest.json \
  artifacts/native-parity/academic/android/manifest.json \
  artifacts/native-parity/academic/android/diffs \
  --case tutor-dashboard-assigned-light
```

Pembanding menggunakan piksel asli dan memotong hanya sesuai batas konten yang dicatat. Status lulus mensyaratkan viewport, DPR, tema, dimensi konten, gambar referensi yang berisi, dan selisih nol piksel. Perbedaan ukuran menghasilkan PNG area tumpang tindih dan PNG area yang tidak berpasangan sebagai diagnostik. Run standar memeriksa semua pasangan semantik, dan `--case` membatasi pemeriksaan ke kasus tertentu. Hasil JSON mencatat dimensi PNG mentah, batas konten, dan alasan kasus gagal.

Linux lokal memiliki Chromium. Android SDK, emulator, ADB, KVM, Xcode dan Maestro tidak tersedia, sehingga pengukuran antarplatform menunggu tangkapan perangkat.
