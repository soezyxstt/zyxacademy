# Peringkat partisipasi

Referensi untuk `/leaderboard` menggunakan komponen web produk `StudentLeaderboardView`, `StudentLeaderboardControls` dan `LeaderboardResults`. Playwright merender respons fixture yang juga digunakan oleh native. Manifest mencatat masukan per skenario dan hash PNG pada 380 × 820 @1 untuk Android dan 402 × 874 @3 untuk iOS.

| Keadaan | Yang diperiksa |
| --- | --- |
| `global` | Dua peserta menampilkan XP dasar. Pemirsa yang memilih tidak ikut tidak memiliki posisi publik. |
| `following` | Filter Diikuti mempertahankan satu peserta yang diikuti. |
| `empty` | Periode Bulan dan cakupan Diikuti menghasilkan keadaan kosong. |

Playwright dan Maestro membuka tab Akademik sesudah keadaan kosong. Kursus dan hasil kuis tampil pada tab Akademik. Kembali ke Rank memulihkan filter yang dipilih sebelumnya. Bukti mempertahankan perbedaan antara XP dasar partisipasi dan hasil akademik. Izin, persetujuan, serta pengelolaan profil mengikuti [kontrak komunitas](../../../../../packages/native-parity/student/community/README.md).

Playwright menjalankan `ranking-reference.spec.ts` di origin virtual `http://student-ranking-reference.invalid`. Maestro menjalankan `participation-ranking.yaml` dan memeriksa hasil dari kedua filter sebelum mengambil screenshot. Referensi menampilkan komponen web di Chromium. Eksekusi Maestro pada perangkat belum diverifikasi dalam pengambilan referensi ini.
