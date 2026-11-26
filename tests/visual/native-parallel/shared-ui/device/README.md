# Bukti visual perangkat shared UI

Gunakan build galeri dari commit yang diperiksa, Python 3.10+ dengan Pillow, Maestro, dan target yang menjalankan React Native. Host memvalidasi semua kasus pada rute internal `/internal/shared-ui/[caseId]`. Alur Maestro memakai alias `/shared-ui/[id]` yang tersedia sejak commit integrator `68931f55`. Android memakai `adb` untuk emulator atau perangkat. iOS memakai `xcrun simctl` untuk simulator yang sedang boot. Simpan artefak gambar dan laporan lokal dalam `artifacts/native-parity/shared-ui/`.

## Bukti dari GitHub Actions

- Run pertama Android meluluskan 8 dari 12 alur interaksi, termasuk grid/tabel tablet. Alur Maestro dengan ukuran teks besar juga lulus. Simulator iOS tertahan pada dialog konfirmasi pembukaan deep link. [Run 45805093064](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064) · [Artefak Android 15110262845](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064/artifacts/15110262845) · [Artefak iOS 15116065483](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064/artifacts/15116065483)
- Run kedua Android menghasilkan 46 dari 52 frame dengan geometri terverifikasi. Seluruh 46 berstatus `different`. Enam capture ponsel gagal karena transport emulator. Alur tablet, daftar lebar, dan ukuran teks besar lulus, termasuk verifikasi pemulihan pengaturan teks. [Run 45809686564](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564) · [Artefak Android 15115345846](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564/artifacts/15115345846)
- Run iOS terakhir meluluskan 7 dari 12 alur dan mengukur geometri ketiga grup. Kegagalan membaca ABI pada collector lama menghalangi PNG raw. Run Android terakhir meluluskan 12 dari 12 alur dan pemeriksaan ukuran teks besar. Perbaikan posisi popover terlihat pada capture. Sebanyak 52 kasus unik lolos verifikasi geometri, semuanya berstatus `different`. [Artefak iOS 15126480318](https://github.com/soezyxstt/zyxacademy/actions/runs/45816593879/artifacts/15126480318) · [Artefak Android 15120224550](https://github.com/soezyxstt/zyxacademy/actions/runs/45822801876/artifacts/15120224550)

Artefak menyertakan `checkout-sha.txt`, `test-build.patch`, laporan interaksi JUnit, dan `ci-summary.json` per grup. Baca `compare/results.json` untuk status per kasus. Bandingkan PNG web dan native bersama diff. Diff viewport mencakup kontrol fixture di sekeliling komponen, seperti filter peran dan status di referensi pagination Admin. Perubahan bentuk atau status tombol pagination tetap terlihat di area komponen itu sendiri. [Rincian pemeriksaan hosted](../../../../../packages/native-parity/shared-ui/REPORT.md#hasil-github-actions-pada-emulator-dan-simulator)

## Gerbang relatif Android

Dispatch `Shared UI device evidence` pada branch induk menjalankan Android terlebih dahulu. Pilih `include_ios` untuk menambah pembanding historis iOS. Android memakai 36 kasus, masing-masing tiga untuk shell, header, daftar, navbar, navigasi bawah, tab, dialog, sheet, popover, grid, tabel dan kalender. Grid dan tabel lebar memakai viewport tablet. Kasus daftar lebar tambahan serta kontrol dan pagination tetap tersedia sebagai diagnostik dan pemeriksaan interaksi.

Build internal memakai kedua flag capture dan WebView. ADB meneruskan loopback perangkat ke server Next.js pada runner. Marker WebView menunggu kasus dan SHA yang cocok, viewport DPR 1, locale Indonesia, zona Asia/Jakarta, font, dan state fixture. Setiap perbandingan memakai frame Expo dan Next WebView pada emulator yang sama. Crop hanya mengeluarkan inset sistem, sehingga backdrop, panel, navigasi dan konten yang hilang tetap terlihat pada diff. Dua tangkapan berturut-turut harus cocok untuk setiap crop. [Gerbang relatif](../../../../../docs/native-readiness.md#gerbang-visual-relatif-android-webview).

Laporan `relative/results.json` menyimpan SSIM frame dan konten, batas konten, warna, kontras, jumlah piksel berbeda, dimensi dan hash frame. Ringkasan memerlukan tiga kasus sah untuk setiap komponen dan satu identitas emulator. `compare/results.json` menyimpan pembanding Chromium yang terpisah. Laporan Maestro dan audit teks besar tetap menjadi bukti perilaku dan aksesibilitas tersendiri.

## Cocokkan geometri dengan referensi

`capture.ts` menulis referensi Playwright ke `tests/visual/native-parallel/shared-ui/references/dpr<DPR>/`. Setiap `results.json` berisi ID kasus, komponen, tema, lebar dan tinggi CSS, DPR, status capture, error, dan ID kesiapan. Jalankan satu kali per ukuran viewport di manifest dan per platform. Opsi `--viewport WIDTHxHEIGHT` memilih semua kasus pada ukuran tersebut. Gunakan `--case ID` untuk mengulang kasus tunggal. Ukuran yang dicatat pada kasus adalah area konten setelah safe area.

Gunakan `maestro --device "$SHARED_DEVICE" hierarchy` pada rute kasus untuk membaca ID `shared-ui-geometry-<Wpx>x<Hpx>-dpr-<DPR>-insets-<L>-<T>-<R>-<B>`. Galeri menghasilkan ID berdasarkan ukuran root layar yang diukur dan safe area sistem. Catat empat inset dalam piksel fisik sesuai urutan kiri, atas, kanan, bawah. Untuk DPR desimal, ID mengganti titik dengan tanda hubung. Pilih viewport browser yang sama dengan area perangkat yang diukur. Sebagai contoh, perangkat iOS dengan area konten 390 pt memerlukan referensi 390 CSS px pada DPR yang sama. Memotong 10 pt dari sisi layar akan gagal di gate geometri. Jika ukuran yang tersedia berbeda, buat referensi di ukuran yang sesuai sebelum memulai perbandingan.

Android menghitung DPR dari density efektif `adb shell wm density`, termasuk override emulator. Verifikasi orientasi serta ukuran display dan font sebelum capture. Pada emulator yang dikhususkan untuk pengujian, `adb -s "$SHARED_DEVICE" shell wm size WIDTHxHEIGHT` dan `adb -s "$SHARED_DEVICE" shell wm density DPI` dapat menyetel ukuran layar fisik dan density. Periksa kembali inset setelah mengganti ukuran atau mode navigasi sistem. iOS memakai skala dan area root yang diukur aplikasi. Gunakan UDID dari `xcrun simctl list devices booted`.

## Tangkap dan bandingkan semua kasus

Tetapkan `SHARED_DEVICE` ke serial Android atau UDID simulator iOS, `SHARED_PLATFORM` ke `android` atau `ios`, serta `SHARED_DPR` ke DPR referensi. Tetapkan `SHARED_BUILD` ke SHA commit atau ID artefak binary yang terpasang. Ulangi `capture` untuk setiap viewport dalam manifest dengan `SHARED_VIEWPORT` dan inset `SHARED_LEFT`, `SHARED_TOP`, `SHARED_RIGHT`, `SHARED_BOTTOM` yang diukur pada konfigurasi itu. Pakai satu direktori raw per platform, DPR, dan build untuk mengumpulkan kasus dari beberapa ukuran.

```sh
SHARED_EVIDENCE=tests/visual/native-parallel/shared-ui/device/evidence.py
SHARED_RAW="artifacts/native-parity/shared-ui/$SHARED_BUILD/$SHARED_PLATFORM/dpr$SHARED_DPR/raw"
SHARED_REPORT="artifacts/native-parity/shared-ui/$SHARED_BUILD/$SHARED_PLATFORM/dpr$SHARED_DPR/compare"

python "$SHARED_EVIDENCE" capture --platform "$SHARED_PLATFORM" \
  --device "$SHARED_DEVICE" --build "$SHARED_BUILD" --scale "$SHARED_DPR" \
  --viewport "$SHARED_VIEWPORT" --raw-dir "$SHARED_RAW" \
  --insets "$SHARED_LEFT" "$SHARED_TOP" "$SHARED_RIGHT" "$SHARED_BOTTOM"

python "$SHARED_EVIDENCE" compare --platform "$SHARED_PLATFORM" \
  --build "$SHARED_BUILD" --scale "$SHARED_DPR" \
  --raw-dir "$SHARED_RAW" --out-dir "$SHARED_REPORT"
```

Maestro membuka setiap deep link dan menunggu identitas kasus serta geometri. Flow memakai ID panel saat dialog, sheet, atau popover tampil di jendela modal. Snapshot diambil dari renderer perangkat melalui `adb exec-out screencap -p` atau `xcrun simctl io ... screenshot`. Sidecar per kasus merekam model, versi OS, ABI, display pada Android, ukuran PNG penuh, DPR, area viewport, inset, dan checksum kedua PNG. Di iOS, collector memakai `xcrun simctl get_app_container` untuk menemukan app terpasang, membaca `CFBundleExecutable`, dan memeriksa bahwa irisan Mach-O dari `xcrun lipo -archs` mencakup arsitektur runner. Collector merekam arsitektur serta SHA-256 executable terpasang dan memverifikasi hash yang diberikan CI. Simpan direktori raw bersama laporan agar pengukuran dan build dapat direproduksi.

CI Android menyimpan log tiap percobaan ketika perangkat terputus dan menunggu ADB tersambung kembali sebelum mengulang langkah yang terdampak. CI iOS mengompilasi satu app Release dan memverifikasi checksum tar serta executable pada kelima job perangkat. Job iPhone membagi 49 kasus menjadi 17, 16, dan 16. Job tablet dan lebar menangani 2 dan 1 kasus. Job iPhone pertama juga menjalankan alur interaksi dan ukuran teks besar serta menyimpan diagnostik preflight di `phone/preflight/`. Flow iOS menekan tombol `Open` jika dialog konfirmasi sistem muncul. [Hasil terverifikasi terbaru di PR #517](https://github.com/soezyxstt/zyxacademy/pull/517)

Untuk menyelidiki kegagalan capture, perintah berikut menyimpan PNG utuh dari layar aktif. Tempatkan PNG sebagai `<id>.png` dalam direktori raw terpisah dan gunakan `compare --insets L T R B`. Perbandingan manual menghasilkan diff diagnostik dengan status `unverified` karena geometri dan kesiapan kasus tidak direkam oleh collector.

```sh
adb -s "$SHARED_DEVICE" exec-out screencap -p > "$SHARED_FRAME"
xcrun simctl io "$SHARED_DEVICE" screenshot "$SHARED_FRAME"
```

Catatan `results.json` menyertakan status `match`, `different`, `blank`, `invalid`, atau `unverified`. Perbandingan memakai crop safe area pada resolusi asli dan mengonversi profil warna tertanam ke sRGB. Gambar native hasil crop dan diff PNG disimpan saat geometri gambar valid. Status `match` memerlukan nol piksel berbeda, gambar berisi, serta metadata capture yang sesuai dengan build, referensi, dan PNG perangkat. Perintah keluar nonnol saat ada kasus yang belum lulus. Jalankan juga skenario Maestro di `.maestro/native-parallel/shared-ui/` untuk bukti perilaku.

```sh
python -m unittest discover -s tests/visual/native-parallel/shared-ui/device -v
```
