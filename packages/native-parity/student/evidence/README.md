# Bukti migrasi Student

`routes.json` dan [routes.md](routes.md) mencatat 50 pola sumber dari `plans/native-parallel/routes.tsv`, screen native, ID operasi, kasus fixture, jumlah assertion yang direncanakan, referensi web, bukti HTTP dan hasil perangkat jika tersedia. `generated_not_executed` berarti flow ada tetapi belum dibuktikan berjalan. Alias tetap memerlukan verifikasi tujuan dan Back. Rute dinamis memerlukan parameter valid, hilang atau ditolak sesuai relevansinya.

`tests/visual/native-parallel/student/web-reference.spec.ts` mengambil referensi dari fixture web yang memakai komponen produksi dan data sintetis untuk katalog, kalender, dan quiz player. Hasil ini hanya memeriksa komponen di fixture pada viewport dan tema yang dijalankan. Fixture tidak membuktikan halaman server, data nyata, otorisasi, atau kesetaraan aplikasi native.

Contoh menjalankan satu proyek pada server lokal terpisah:

```sh
SKIP_ENV_VALIDATION=1 DATABASE_URL=postgresql://localhost:1/fixture BETTER_AUTH_SECRET=fixture-only-secret-not-used-for-auth NEXT_PUBLIC_APP_URL=http://127.0.0.1:3127 ./node_modules/.bin/next dev --webpack -p 3127
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3127 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium ./node_modules/.bin/playwright test tests/visual/native-parallel/student/web-reference.spec.ts --project=mobile-380
```

Playwright menulis capture ke direktori hasil pengujian yang dikonfigurasi di root. Untuk setiap hasil yang ingin dikreditkan, catat commit, kasus, sumber dan versi fixture, tema, locale, viewport, density, font, platform, artefak, selisih, dan interaksi. Tiga screenshot web bukan bukti tiga kasus native: kelulusan visual memerlukan capture React Native sesungguhnya pada Android dan iOS, perbandingan nol piksel berbeda dengan referensi sepadan, dan bukti perilaku terpisah. Periksa juga login, hak kursus dan pencabutan, pergantian akun, deep link, aksesibilitas, offline, serta kesalahan dan pemulihan sesuai halaman. Lihat `docs/native-readiness.md` dan `plans/native-parallel/README.md`.

Workflow `native-student-evidence.yml` dibatasi ke PR branch Student menuju branch integrasi. Workflow memasang fixture route sementara, menangkap skenario Maestro, dan menyimpan screenshot serta laporan terpisah untuk kedua platform. Tiga kasus katalog `all`, `tpb`, dan `pka` memakai lima rekaman, harga dan waktu sintetis yang sama, bahasa Inggris, serta tema gelap. `verify-catalog-input.ts` memeriksa data sebelum capture. Pembanding mensyaratkan marker pemeriksaan dan dimensi gambar yang sama, tanpa resize. Shell dan safe area tetap berada di gambar dan berkontribusi pada selisih; kesamaan data bukan kesamaan implementasi. Status `different`, `not_comparable`, dan `missing` bukan kelulusan paritas. Pasangan dashboard dan katalog yang berbeda dicatat sebagai tidak sepadan.

Pada pemeriksaan lokal 26 November 2026, Chromium dengan viewport 380 × 844, DPR 1, locale `en-GB`, tema gelap dan reduced motion menghasilkan tiga capture katalog serta tiga capture quiz player. Hasil berada di `artifacts/student-evidence/local-web/`, bukan artefak CI yang permanen. Checkout sedang berubah selama pengujian, sehingga hasil ini tidak membuktikan commit tertentu. Pengujian kalender sempat gagal pada hidrasi dan perlu diulang. Tidak ada bukti Android, iOS atau perangkat fisik dari run lokal ini. Rujukan web produk yang dikomit memiliki provenance dan SHA server tersendiri dalam `product/web/web.json`.

`generate-smoke.ts` menggabungkan daftar rute Student dengan kasus yang benar-benar dideklarasikan modul courses, assessment, learning dan community. Hasil `manifest.json` mencatat semua 50 sumber, nama fixture, path konkret, tema, assertion dan alasan kasus yang belum dapat dijalankan. Kasus tanpa assertion yang memeriksa konten atau kontrol ditandai `blocked`; generator tidak menghasilkan hasil lulus. CI memakai satu build per platform, lalu menjalankan flow per area pada perangkat yang sama. `smoke-summary.json` menggabungkan JUnit dan capture yang benar-benar ditemukan, dengan status `not_run` dan `passed_missing_capture` bila bukti tidak lengkap. Kasus ini adalah pemeriksaan smoke, bukan perbandingan piksel atau bukti backend. Handoff browser, renderer yang belum tersedia, dan pembuktian Back atau query alias tetap memiliki batas yang tercatat pada manifest.

Kasus assessment kini memeriksa akses terkunci, isi soal panjang lewat alur terkait, serta kegagalan dan retry pada transport offline. Kasus community mencakup penyimpanan, hasil pengiriman yang tidak pasti, dan pemulihan jadwal. Kasus-kasus ini memakai transport sintetis; pengujian fixture terfokus memeriksa input dan responsnya, sedangkan pelaksanaan flow dan screenshot Android/iOS masih memerlukan hasil perangkat. Tiga kasus tetap diblokir: handoff host live saat offline dan dua keadaan notifikasi browser, karena fixture tidak menyediakan browser sistem beserta status izinnya. Status blocked tidak dikreditkan sebagai lulus.

Untuk memperbarui inventaris dari fixture dan capture yang ada:

```sh
bun tests/visual/native-parallel/student/generate-smoke.ts
bun tests/visual/native-parallel/student/generate-report.ts
```

Generator laporan membaca summary yang ditunjuk `device-runs/index.json`, atau `artifacts/student-evidence/{android,ios}/smoke/smoke-summary.json` jika tidak ada entri indeks. Untuk sumber lain, berikan `--android=<path>` atau `--ios=<path>`. Summary asli dipertahankan; `provenance.json` di sampingnya mengikat artefak lama yang belum memuat SHA atau URL run. ID kasus tanpa hasil yang cocok tetap `not_recorded` atau `not_in_summary`. Penghasil laporan tidak menyatakan lulus paritas berdasarkan screenshot atau test fixture saja.

Jika manifest capture assessment, learning atau community tersedia, generator membacanya otomatis. Entri dengan error tetap `failed`; PNG hanya dilaporkan sebagai capture lulus bila manifest menyatakan berhasil dan berkas tersedia, dengan checksum diperiksa jika manifest menyediakannya. Ketidakcocokan atau berkas yang hilang dicatat terpisah. [Riwayat CI](ci-history.json) adalah snapshot bertanggal, bukan indikator status langsung.
