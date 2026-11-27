# Kalender Student pada Android

Maestro menyelesaikan skenario `Student calendar reference inputs and category states` pada checkout `ccfeb5809bb8da43b2fc2973ad34a6546d9a1d17`, hasil merge PR head `bdae1785d8e95d542df36c6b7ee2bbcb500f3859`. Jejak 47 langkah alur cocok dengan YAML pada checkout tersebut, termasuk pengelompokan berdasarkan tanggal Jakarta, pemilahan Tutorial, navigasi dan kembali, serta reset kategori kosong. Job Android berstatus gagal secara keseluruhan. Job iOS dibatalkan. [Run](https://github.com/soezyxstt/zyxacademy/actions/runs/45824831032) · [Job Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45824831032/job/139927769797) · [Artefak Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45824831032/artifacts/15121682481) · [Verifikasi dan SHA-256](comparison.json)

Referensi Playwright berasal dari commit `bad59272474ebb712cc7494012799d8ef2195b18`. Manifest dan ketiga PNG identik pada commit tersebut, PR head, dan checkout perangkat. Artefak web run ini mencakup suite kalender lain. Pengukuran di bawah memakai referensi yang disimpan di Git untuk ukuran perangkat. [Referensi web yang dipatok](https://github.com/soezyxstt/zyxacademy/tree/bad59272474ebb712cc7494012799d8ef2195b18/tests/visual/native-parallel/student/calendar/web/android)

Emulator memakai Android API 35, densitas 160 dpi, dan skala font 1. Browser memakai DPR 1. Kedua fixture memakai data yang sama, tema terang, lokal Indonesia, zona waktu Asia/Jakarta untuk agenda, serta font Inter dan Lexend. Selisih menghitung piksel RGB yang berubah pada seluruh gambar 380 × 820, termasuk bilah sistem Android, tanpa penskalaan atau pemotongan. Ketiga pasangan berbeda secara visual.

| Keadaan | Piksel berbeda dari 311.600 | Tangkapan Maestro | Selisih RGB |
|---|---:|---|---|
| Semua agenda | 32.176 (10,326%) | [PNG](student-calendar-all.png) | [PNG](calendar-all-diff.png) |
| Tutorial | 16.870 (5,414%) | [PNG](student-calendar-tutorial.png) | [PNG](calendar-tutorial-diff.png) |
| Kategori kosong | 14.020 (4,499%) | [PNG](student-calendar-empty-filter.png) | [PNG](calendar-empty-filter-diff.png) |
