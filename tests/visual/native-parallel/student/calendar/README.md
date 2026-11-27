# Referensi kalender Student

Playwright membungkus komponen `CalendarAgendaClient` produksi dengan `ApplicationPage` dan `MobileTopNavbar`. Fixture Student native dan browser memakai agenda sintetis yang sama, zona waktu Asia/Jakarta, bahasa Indonesia, tema terang, dan berkas Inter serta Lexend dari aplikasi native. Tangkapan ini mencakup tampilan agenda tanpa integrasi Google Calendar. [Data bersama](../../../../../packages/native-parity/student/community/calendar-fixture.ts) · [Flow Maestro](../../../../../.maestro/native-parallel/student/community-calendar-parity.yaml)

| Target | Semua agenda | Tutorial | Kategori kosong | Manifest |
|---|---|---|---|---|
| Android 380 × 820, DPR 1 | [PNG](web/android/calendar-all.png) | [PNG](web/android/calendar-tutorial.png) | [PNG](web/android/calendar-empty-filter.png) | [Input dan SHA-256](web/android/calendar-reference.json) |
| iOS 402 × 874, DPR 3 | [PNG](web/ios/calendar-all.png) | [PNG](web/ios/calendar-tutorial.png) | [PNG](web/ios/calendar-empty-filter.png) | [Input dan SHA-256](web/ios/calendar-reference.json) |

Dua agenda aktif memiliki tanggal UTC yang berbeda dan tampil pada tanggal Jakarta yang sama. Pemilah Tutorial menampilkan sesi riwayat yang dibatalkan. Skenario kedua menyediakan dua agenda assessment. Memilih kategori Tutorial menampilkan keadaan kosong, lalu tombol **Semua agenda** mengembalikan kedua assessment. Maestro juga memeriksa tautan sejarah tutorial dan navigasi kembali. [Spec Playwright](../calendar-reference.spec.ts)

```sh
PLAYWRIGHT_BASE_URL=http://calendar-reference.invalid \
bun run test:visual tests/visual/native-parallel/student/calendar-reference.spec.ts --project mobile-380
```

Tangkapan browser menyimpan area 380 × 820 piksel dan 1206 × 2622 piksel. Chrome perangkat, safe area sistem, rasterisasi font dan lapisan shell produk dapat memengaruhi selisih. Bukti Maestro dan hasil perbandingan atas revisi ini masih memerlukan run Android dan iOS.
