# Review independen galeri Android pada 81b9cd096

Sumber dan build `81b9cd0964f2f19077c72396e4092c315284d03b` pada run `45882580656`. Referensi berasal dari ekspor Next.js yang dirender Android WebView pada emulator yang sama dengan Expo. Crop berukuran 320 piksel pada DPR 1. Tinggi ditentukan per kasus. Identitas build, urutan kasus, ukuran crop, dan status frame nonkosong cocok dengan manifest dan 17 laporan pengukuran. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45882580656) · [Crop Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45882580656/artifacts/15148509485) · [Pengukuran](https://github.com/soezyxstt/zyxacademy/actions/runs/45882580656/artifacts/15149480013)

Review visual meluluskan **51/51 pasangan stabil**. Itu mencakup tiga kasus per komponen pada 17 dari 18 komponen target. Selisih kecil rasterisasi teks, garis tepi, dan baseline tetap terlihat. Gerbang otomatis `android-webview-relative-v1` meluluskan **18/54 target dan 5/18 komponen**. Maestro meluluskan **17/17 alur interaksi**, termasuk isi kotak masuk, tindakan baca, dan pengeditan multibaris. Job Android dan ringkasan visual berstatus gagal.

| Komponen | Review relatif | Gerbang otomatis |
| --- | --- | --- |
| Separator | 3/3 | 3/3 |
| Skeleton | 3/3 | 3/3 |
| Button | 3/3 | 1/3 |
| Label | 3/3 | 0/3 |
| Input | 3/3 | 0/3 |
| Textarea | 3 belum dapat dinilai | 3 pasangan belum tersedia |
| Checkbox | 3/3 | 1/3 |
| Switch | 3/3 | 3/3 |
| Radio group | 3/3 | 1/3 |
| Progress | 3/3 | 3/3 |
| Avatar | 3/3 | 0/3 |
| Badge | 3/3 | 0/3 |
| Beta badge | 3/3 | 0/3 |
| Formatted date | 3/3 | 0/3 |
| Notification inbox | 3/3 | 0/3 |
| Slider | 3/3 | 3/3 |
| Alert | 3/3 | 0/3 |
| Toggle group | 3/3 | 0/3 |

Kotak masuk kosong memiliki kedua garis ikon tutup. Pada keadaan belum dibaca, ikon tandai semua terbaca dan hierarki informasi sepadan. Pada keadaan campuran, kedua waktu relatif tetap satu baris dan ikon tutup serta tindakan baca lengkap. Perbedaan kecil pada garis pemisah, posisi baris, dan rasterisasi tetap terlihat. Ketiga kasus masih gagal ambang SSIM otomatis. [Pengukuran kotak masuk](https://github.com/soezyxstt/zyxacademy/actions/runs/45882580656/artifacts/15149480013)

Collector menyimpan `unstable-frame-textarea.png` dengan tiga area contoh serta tiga crop WebView. Tidak ada crop Expo stabil atau laporan pengukuran `native-vs-webview/result-textarea.json`. Piksel marker Android teramati sebagai RGB `(224, 1, 239)` di titik yang mengharapkan `(224, 0, 239)`. Perbaikan collector ada pada `83a0d6585712df5e1c6cf220dddda209a4034c90`. Ketiga putusan visual Textarea membutuhkan pasangan stabil dari run lanjutan. [Build lanjutan](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744)

## Pemeriksaan identitas

Manifest kasus `webview-reference/cases.json` memiliki SHA-256 `9c794dd279efa555aa25bd3d64e3ec711c5b227845ac0b925299ef24eafe27e8`. SHA-256 kedua PNG pada setiap pasangan stabil di luar kotak masuk, total 48 pasangan, cocok dengan catatan run sebelumnya. Ketiga PNG WebView kotak masuk juga identik dengan run sebelumnya. [Hash gambar sebelumnya](android-webview-review-45877794715.json)

| Crop Expo kotak masuk | SHA-256 |
| --- | --- |
| `notification-inbox-empty-light.png` | `b0a4307d19cc9ef98e446f54787760f20e300b737ff670c7d217a9b4dc5e17e0` |
| `notification-inbox-unread-light.png` | `f53f482c4a69c4d662286de1b96e75dd8d5ad0d2cf167a972e72b9dfd3850961` |
| `notification-inbox-mixed-dark.png` | `e757b02b6b0f5b3b8720ed8196a8267484ae38f2ac10bd2c30dd24430661a7f9` |

SHA-256 `result-notification-inbox.json` adalah `9c489aadc91f9156b9e36df44d44fefd5702686335b117063c8d5a1053578fa6`. SHA-256 `unstable-frame-textarea.png` adalah `fc711a8ddfaacbb55abd08775a9470074c23bb7c4dd7ef08472023a76bd4568c`.
