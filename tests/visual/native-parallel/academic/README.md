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

Workflow `.github/workflows/academic-native-evidence.yml` menjalankan job Android dan iOS secara independen dari galeri komponen. Setiap job mengambil sembilan kasus prioritas, menjalankan alur Maestro akademik, lalu melanjutkan tangkapan 162 kasus dari manifest akademik. Runner memulai proses aplikasi baru untuk setiap segmen `openLink`, membuka fixture lewat intent Android atau `simctl openurl`, lalu menjalankan segmen Maestro yang dimulai dengan pemeriksaan layar tujuan. Arsip `academic-android-evidence` dan `academic-ios-evidence` menyimpan PNG mentah, manifest rute dan interaksi, log pembukaan fixture, tangkapan Maestro, serta laporan dan status tiap segmen selama tujuh hari. Penanda sesaat pada tangkapan rute mengukur batas konten setelah safe area. Job Linux menyiapkan referensi Playwright pada viewport terukur serta menyimpan referensi, selisih, dan hasil pembandingan dalam arsip `academic-matched-viewport`.

Dengan build fixture terpasang di emulator atau simulator lokal, jalankan runner dari root repositori. Gunakan `ios` dan UDID simulator untuk iOS.

```sh
python3 scripts/native-parity/academic/interactions.py android "<serial>" "$(command -v maestro)" \
  artifacts/native-parity/academic/android/interactions
python3 scripts/native-parity/academic/accessibility.py android "<serial>" "$(command -v maestro)" \
  artifacts/native-parity/academic/android/accessibility
```

Folder `accessibility/` di setiap arsip berisi hierarki perangkat, screenshot, dan hasil pemeriksaan nama yang terbaca di detail peserta Tutor dan daftar kursus Admin. Alur penolakan memeriksa bahwa data kedua halaman tidak muncul dalam hierarki akun murid. Pemeriksaan TalkBack dan VoiceOver memerlukan pengujian tersendiri.

`device-manifest.py` menggunakan delapan pasangan nama screenshot Maestro dan kasus Playwright dengan peran, data, state, dan tema yang sama. Kasus yang tidak memiliki padanan semantik, seperti layar detail peserta yang terpisah di native, tidak dipasangkan. Nama screenshot yang tidak ditemukan tercatat dalam manifest perangkat.

Unduh artefak Android dari run yang ingin diuji. Untuk iOS, gunakan nama artefak iOS dan referensi DPR 3.

```sh
gh run download <ID-run> --repo soezyxstt/zyxacademy \
  --name academic-android-evidence \
  --dir artifacts/native-parity/academic/android/raw
```

Buat manifest dengan ukuran yang diukur dari build dan screenshot perangkat. Gunakan viewport dan batas konten per kasus dalam JSON apabila chrome perangkat berubah di antara tangkapan.

```sh
python3 tests/visual/native-parallel/academic/device-manifest.py \
  artifacts/native-parity/academic/android/raw/interactions \
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

Untuk pembandingan yang sesuai ukuran perangkat, gunakan `contentViewport` dari `comparison-status.json` dengan status `ready`. File bersufiks `-provisional` menyimpan geometri dari kasus prioritas untuk diagnosis. Gunakan dimensi yang sudah diverifikasi di akhir run, DPR perangkat, dan kasus yang sudah dipasangkan saat menangkap ulang referensi Playwright. Simpan referensi baru di folder ukuran perangkat agar baseline 380 × 844 tetap tersedia.

```sh
PARITY_WIDTH=<lebar-dp> PARITY_HEIGHT=<tinggi-dp> PARITY_DPR=1 \
  PARITY_CASES=tutor-dashboard-assigned-light \
  bun tests/visual/native-parallel/academic/capture.ts
```

Linux lokal memiliki Chromium. Android SDK, emulator, ADB, KVM, Xcode dan Maestro tidak tersedia, sehingga pengukuran antarplatform menunggu tangkapan perangkat.
