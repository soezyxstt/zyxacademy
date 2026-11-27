# Review galeri Android pada 83a0d658

Pada run `45885365744`, Expo dan referensi Next.js di Android WebView memakai sumber dan build `83a0d6585712df5e1c6cf220dddda209a4034c90`. Semua 54 pasangan crop stabil, berisi konten, dan cocok dengan dimensi yang terdaftar pada DPR 1. SHA-256 kedua PNG pada 51 pasangan yang sudah ditinjau cocok dengan run `45882580656`. Tiga pasangan Textarea diperiksa dari tangkapan run ini. [Run Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744) · [Crop](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744/artifacts/15150377131) · [Pengukuran](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744/artifacts/15150611770) · [Hash dan putusan per kasus](android-webview-review-45885365744.json)

Review visual relatif meluluskan **54 dari 54 kasus dan 18 dari 18 komponen**. Ketiga keadaan Textarea mempertahankan ukuran kontrol, teks, hierarki, dan keadaan nonaktif. Teks Expo bergeser sekitar 1 hingga 2 piksel ke bawah. WebView menampilkan tanda ubah ukuran kecil. Warna inti teks nonaktif adalah `#999999` pada kedua crop. [Review sebelumnya](android-webview-review-45882580656.md)

| Kasus Textarea | Review relatif | Selisih piksel | SSIM penuh / foreground |
| --- | --- | ---: | ---: |
| Kosong, terang | Lulus | 727 | 0,9607 / 0,8105 |
| Multibaris, gelap | Lulus | 1.877 | 0,9054 / 0,7017 |
| Nonaktif, terang | Lulus | 832 | 0,9571 / 0,7933 |

Gerbang otomatis `android-webview-relative-v1` meluluskan **18 dari 54 kasus dan 5 dari 18 komponen**. Ketiga kasus Textarea gagal pada SSIM dan kontras lokal. Delapan pasangan galeri cocok secara piksel. Maestro meluluskan **17 dari 17 alur interaksi**. Job perangkat dan ringkasan visual gagal pada gerbang otomatis. Job inventaris gagal saat mengimpor Pillow dan referensi serta kontrak native lulus. [Job perangkat](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744/job/140135420503) · [Job inventaris](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744/job/140134630025)
