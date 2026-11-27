# Peringkat kelas

Referensi untuk `/courses/matematika-1/leaderboard` menggunakan komponen web produk `StudentCourseLeaderboardContent`, `TabNav` dan `CoursePageShell`. Playwright merender komponen dari fixture sintetis bersama dengan font Inter dan Lexend dari aset native. Manifest mencatat masukan per skenario dan hash PNG pada 380 × 820 @1 untuk Android dan 402 × 874 @3 untuk iOS.

| Keadaan | Yang diperiksa |
| --- | --- |
| `quiz` | Tiga nama podium dengan rata-rata nilai dan statistik soal. Pemirsa membaca peringkat 5 dari 5. |
| `simulation` | Tab Tryout mengubah jenis hasil menjadi simulasi. Pemirsa melihat total 0 dan status belum ada skor. |
| `unranked` | Podium kuis tetap sama dan totalnya 5. Pemirsa yang belum pernah mengikuti kuis membaca status belum ada skor. |

Daftar fiktif juga memuat nama pada peringkat empat dan lima. Pemeriksaan memastikan dua nama tersebut tidak ada di tampilan web dan payload native. Hanya identitas publik yang lolos proyeksi fixture membuka profil dari podium. Akses enrollment dan izin profil tetap dikelola operasi produk yang didokumentasikan pada [kontrak komunitas](../../../../../packages/native-parity/student/community/README.md).

Playwright menjalankan `ranking-reference.spec.ts` di origin virtual `http://student-ranking-reference.invalid`. Maestro menjalankan `course-ranking.yaml` dengan skenario yang sama dan memeriksa tab, ringkasan, serta nama sebelum mengambil screenshot. Referensi menampilkan komponen web di Chromium. Eksekusi Maestro pada perangkat belum diverifikasi dalam pengambilan referensi ini.

Tab Akademik pada papan peringkat gabungan merangkum hingga 10 baris skor per kelas aktif. Halaman peringkat kelas mengambil 3 baris teratas, peringkat akun sendiri, dan total peserta. Tab Rank memakai XP partisipasi serta menghormati pilihan peserta untuk tampil, visibilitas profil, dan blokir. [Kontrak ranking](../../../../../packages/native-parity/student/community/README.md)

Jika akses peringkat kelas ditolak karena enrollment, aksi Aktifkan kelas membuka formulir token kelas yang sama. Flow Maestro terpisah membuka podium, masuk kembali dengan fixture yang memberi 403, memeriksa bahwa nama podium dan peringkat pribadi sudah hilang, lalu membuka formulir aktivasi. Flow juga memeriksa bahwa gangguan jaringan dapat dicoba ulang. Pada iOS, pembukaan ulang melalui peluncur fixture memulai proses baru dengan penyimpanan aplikasi dipertahankan. [Flow pemulihan](../../../../../.maestro/native-parallel/student/course-ranking-access.yaml)
