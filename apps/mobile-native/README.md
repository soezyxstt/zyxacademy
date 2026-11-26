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
