# Bukti hasil asesmen Student dengan sesi bertanda tangan

Pengujian ini memisahkan riwayat `/my-results`, review `/my-results/[submissionId]`, diagnosis `/my-results/[submissionId]/summary`, dan ringkasan `/quiz/[quizId]/summary/[attemptId]`. PostgreSQL menyimpan percobaan dan pengumpulan sintetis milik peserta pertama. Peserta kedua memiliki akses penuh ke kelas yang sama. Riwayatnya kosong dan permintaan native untuk membuka hasil milik peserta pertama mendapat 404. [Sumber data](assessment-results-seed.ts) · [Pengujian HTTP dan browser](assessment-results-proof.ts)

| Keadaan | Yang diperiksa |
| --- | --- |
| Kuis pemilik dengan pembahasan rilis | Review menampilkan skor 85 dan jawaban benar. Kedua endpoint ringkasan mengembalikan metrik percobaan yang sama. |
| Tryout pemilik menunggu penilaian | Skor akhir dan catatan pengajar kosong. Jawaban pilihan ganda yang telah diperiksa tetap terlihat. |
| Tryout pemilik sudah dinilai | Review memuat skor 95 dan catatan pengajar yang tersimpan. |
| Kuis dengan pembahasan belum rilis | Review native memuat skor 60 dengan daftar pembahasan kosong. API web menghapus kunci dan penjelasan. Web mengarahkan halaman ringkasan kuis ke hasil percobaan. |
| Kuis dengan nilai esai tertunda | API ringkasan native mengembalikan status menunggu dan tanpa diagnosis. Halaman ringkasan khusus kuis memiliki pesan penilaian yang cocok untuk dibandingkan. |
| Analitik gagal | Kedua endpoint ringkasan native mengembalikan status gagal tanpa metrik. Pengujian browser memeriksa keadaan diagnosis belum tersedia. |
| Pemirsa lain atau anonim | Pengujian memeriksa penolakan terpisah. |

Kontrak HTTP dijalankan melalui Next.js 16.3.0 dan PostgreSQL 16.13 loopback dengan 49 migrasi. Pada checkout sebelum perbaikan, endpoint summary native mengembalikan 503 karena konstruktor NextRequest mencoba menyalin Request dari konteks runtime yang berbeda. Regresi memakai sesi nyata dan memverifikasi status 200 serta metrik yang sama untuk dua rute setelah rilis. Sebelum rilis, POST memberi 403. Pemilik yang diizinkan menerima 202 dan GET berikutnya mengembalikan status `processing`. Mode `QUEUE_PROVIDER=noop` menjaga pengujian tetap lokal. Bukti tersebut mencakup pengakuan permintaan dan perubahan status, sementara eksekusi worker serta hasil diagnosis baru belum diverifikasi. [Regresi HTTP](assessment-http.ts)

Fixture Maestro memainkan ulang respons GET pemilik yang direkam dari endpoint native pada database sintetis. Jalur lain dan mutasi mendapat 404. Bukti otorisasi berasal dari permintaan HTTP dan rute web bersesi. Gambar web Android memakai Chromium dengan 380 × 820, DPR 1, locale id-ID, zona Asia/Jakarta, dan tema terang. Skrip mengambil PNG setelah isi yang diharapkan terlihat. Skrip mencatat pengalihan dan penolakan sebagai keputusan rute. Bila hidrasi shell gagal, skrip merekam kegagalan pada manifest dan melewati PNG kasus itu. Tangkapan Android native dan pengukuran piksel masih tertunda. [Snapshot native](../../../../../packages/native-parity/student/assessment/signed-results-responses.json) · [Flow review](../../../../../.maestro/native-parallel/student/assessment-result-review.yaml)

## Reproduksi lokal

Gunakan database kosong `student_evidence` pada loopback dan environment sintetis seperti pada [petunjuk produk](README.md). Jalankan Next dengan `QUEUE_PROVIDER=noop` pada proses server. Seed tambahan menjadikan akun kedua peserta aktif untuk memeriksa kepemilikan. Gunakan database uji yang baru untuk matriks ini.

```sh
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-seed.ts
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-results-seed.ts
bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-http.ts

STUDENT_SERVER_SHA=$(git rev-parse HEAD) \
  bun --env-file=.env.local tests/visual/native-parallel/student/product/assessment-results-proof.ts
```

Jalankan dengan `STUDENT_ASSESSMENT_RESULTS_HTTP_ONLY=1` untuk memeriksa kontrak saja. Profil bawaan Android. Gunakan `STUDENT_ASSESSMENT_RESULTS_PROFILES=android,ios` untuk kedua profil dan `STUDENT_ASSESSMENT_RESULTS_CASES` untuk daftar ID kasus browser yang diulang. Arahkan `STUDENT_CAPTURE_DIR` ke direktori baru untuk menyimpan manifest, snapshot, dan tangkapan dari setiap pengujian.
