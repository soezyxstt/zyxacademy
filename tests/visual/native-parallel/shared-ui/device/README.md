# Bukti visual perangkat shared UI

Gunakan build galeri dari commit yang diperiksa, Python 3.10+ dengan Pillow, Maestro, dan target yang menjalankan React Native. Host memvalidasi semua kasus pada rute internal `/internal/shared-ui/[caseId]`. Alur Maestro memakai alias `/shared-ui/[id]` yang tersedia sejak commit integrator `68931f55`. Android memakai `adb` untuk emulator atau perangkat. iOS memakai `xcrun simctl` untuk simulator yang sedang boot. Simpan artefak gambar dan laporan lokal dalam `artifacts/native-parity/shared-ui/`.

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

Maestro membuka setiap deep link dan menunggu identitas kasus serta geometri. Flow memakai ID panel saat dialog, sheet, atau popover tampil di jendela modal. Snapshot diambil dari renderer perangkat melalui `adb exec-out screencap -p` atau `xcrun simctl io ... screenshot`. Sidecar per kasus merekam model, versi OS, ABI, display pada Android, ukuran PNG penuh, DPR, area viewport, inset, dan checksum kedua PNG. Untuk iOS, ABI adalah arsitektur simulator (`uname -m`). Simpan direktori raw bersama laporan agar pengukuran dan build dapat direproduksi.

Untuk menyelidiki kegagalan capture, perintah berikut menyimpan PNG utuh dari layar aktif. Tempatkan PNG sebagai `<id>.png` dalam direktori raw terpisah dan gunakan `compare --insets L T R B`. Perbandingan manual menghasilkan diff diagnostik dengan status `unverified` karena geometri dan kesiapan kasus tidak direkam oleh collector.

```sh
adb -s "$SHARED_DEVICE" exec-out screencap -p > "$SHARED_FRAME"
xcrun simctl io "$SHARED_DEVICE" screenshot "$SHARED_FRAME"
```

Catatan `results.json` menyertakan status `match`, `different`, `blank`, `invalid`, atau `unverified`. Perbandingan memakai crop safe area pada resolusi asli dan mengonversi profil warna tertanam ke sRGB. Gambar native hasil crop dan diff PNG disimpan saat geometri gambar valid. Status `match` memerlukan nol piksel berbeda, gambar berisi, serta metadata capture yang sesuai dengan build, referensi, dan PNG perangkat. Perintah keluar nonnol saat ada kasus yang belum lulus. Jalankan juga skenario Maestro di `.maestro/native-parallel/shared-ui/` untuk bukti perilaku.

```sh
python -m unittest discover -s tests/visual/native-parallel/shared-ui/device -v
```
