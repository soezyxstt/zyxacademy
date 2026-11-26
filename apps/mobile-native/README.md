# Zyx Academy Native

Galeri parity UI React Native untuk Android dan iOS. Galeri memakai fixture lokal dari `packages/ui-parity` dan dapat dijalankan tanpa akun Zyx atau server web.

## Pengembangan

Gunakan Node.js 22.13 atau lebih baru pada seri 22, atau 24.3 atau lebih baru pada seri 24. Pasang dependency melalui lockfile npm aplikasi ini.

```sh
cd apps/mobile-native
npm ci
npm start
```

Buka di Expo Go yang mendukung SDK 58. Untuk build pengembangan lokal, gunakan `npm run android` dengan Android SDK atau `npm run ios` dengan Xcode di macOS. Expo menghasilkan direktori `android` dan `ios` dari `app.json`.

Build lokal menggunakan ID `com.zyx.academy.nativeparity` agar dapat dipasang berdampingan dengan paket Capacitor di `apps/mobile`.

## Galeri dan bukti paritas

Pilih komponen di atas galeri untuk membuka tiga kasusnya. Pada build internal, tautan seperti `zyx-native-parity://gallery/button` membuka komponen yang sama. Galeri memuat Inter dan Lexend dari aset lokal agar capture dapat diulang tanpa akses jaringan.

Workflow `Native component parity` menjalankan referensi Next.js pada skala 1 dan 3. Android WebView dan iOS WKWebView juga merender ekspor Next.js yang sama pada perangkat masing-masing. Android dan iOS membuka setiap komponen Expo pada perangkat virtual, memeriksa identitas galeri, lalu mengambil ketiga crop tanpa resize. Ringkasan job mencatat jumlah piksel berbeda, selisih kanal RGB terbesar dan batas area yang berbeda. Job `visual-summary` menggabungkan hasil tiga kasus pada Android dan iOS serta mencatat commit PR dan commit checkout yang diuji. Artefak perangkat mencakup frame asli, crop dan diff. Satu piksel berbeda menggagalkan kasus tersebut.

Hasil visual, pemeriksaan interaksi dan kesiapan produk dilacak terpisah di [audit kesiapan](../../docs/native-readiness.md).
