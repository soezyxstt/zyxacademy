# Kuis dan tryout akademik native

`AssessmentScreen` memasang halaman kuis Tutor dan Admin academic, hasil serta penilaian kuis Tutor, dan daftar serta isi tryout Admin. Rute tryout Tutor mengganti halaman dengan ikhtisar kursus, sesuai alias web. Fixture mendukung kursus terisi, kosong, di luar penugasan dan kegagalan sementara. Course ID Tutor dan slug Admin dipisahkan di kontrak `AssessmentContext`.

`QuizEditor` menerima `QuizInput`, `BankQuestion[]`, peran, kontrol pemilihan kursus opsional, status penyimpanan, dan callback simpan atau batal. Jalur Operations dapat memasang editor ini pada rute Admin eval dan memakai `quizAuthoringPayload` untuk membentuk input endpoint kuis yang sama. Pemasangan pada rute Admin eval menjadi cakupan jalur Operations.

| Operasi | Transport dan izin | Hasil dan pemulihan |
| --- | --- | --- |
| Daftar kuis dan bank, pratinjau | `GET /api/native/academic-assessment/{role}/{course}/quizzes` dan `preview/{quizId}`. Admin atau Tutor yang ditugaskan, dengan identitas dan kuis dalam kursus tersebut. | Memakai read model dan aksi pratinjau web. Pencatatan pengungkapan soal dilakukan sebelum respons. |
| Buat kuis | `POST /api/quiz/templates`. Sesi dan peran aktif, akses kursus diperiksa lagi di dalam transaksi. Tutor dibatasi pada kuis non-simulasi. | `Idempotency-Key` tetap saat diulang. Input yang sama membaca receipt yang dicatat atomik dengan proyeksi kuis. Input berbeda untuk kunci yang sama menghasilkan konflik. |
| Edit kuis dan status | `PATCH /api/quiz/templates/{id}`. Sama, serta wajib menyertakan kursus asal dan `expectedRevision` dari template yang dibaca. | Row lock melindungi pemeriksaan revisi dan receipt. Data cabang dan pengaturan tambahan tetap tersimpan. Publikasi melanjutkan jalur notifikasi server yang sudah digunakan web. |
| Hasil kuis | `GET /api/native/academic-assessment/tutor/{courseId}/attempts/{quizId}`. Tutor ditugaskan dan template cocok dengan kursus. | Menampilkan status dan jawaban dari snapshot percobaan, termasuk pengungkapan yang dicatat server. |
| Antrean dan detail penilaian | `GET /api/native/academic-assessment/tutor/{courseId}/grading` dan `grading/{attemptId}`. Tutor ditugaskan, percobaan berada di kursus tersebut. | Menggunakan read model penilaian web dengan jawaban yang sudah dikumpulkan. |
| Simpan atau selesaikan penilaian | `POST /api/native/academic-assessment/tutor/{courseId}/grading/{attemptId}`. Tutor aktif dengan sesi dan penugasan yang diperiksa dalam transaksi. | Nilai esai dan isian memakai revisi per jawaban. Kunci dicakup oleh akun, metode, course ID dan percobaan. Percobaan ulang membaca hasil transaksi asli. |
| Daftar tryout, soal, dan pilihan bank | `GET /api/native/academic-assessment/admin/{slug}/tryouts`. Peran Admin aktif. | Mencatat pengungkapan snapshot dan pilihan bank sebelum menampilkan data. Pilihan bank kursus berisi metadata soal Zyx dan contoh ITB yang sudah terbit. |
| Hapus kuis | `DELETE /api/quiz/templates/{id}`. Pemeriksaan sesi, kursus, peran dan revisi di transaksi. | Memakai penghapusan proyeksi web. Receipt tetap dapat diverifikasi setelah kuis dan hasil percobaan terhapus. |
| Buat atau edit metadata draf tryout | `POST /api/native/academic-assessment/admin/{slug}/tryouts` atau `PATCH .../tryouts/{examId}`. Admin aktif dengan sesi dan kursus yang diperiksa di transaksi. | Menyimpan judul, durasi, batas percobaan, waktu buka dan waktu tutup ke exam draf. Edit memakai revisi metadata, mempertahankan pengaturan lain, dan mencatat receipt atomik. |
| Impor dan hapus soal impor pada draf | `POST /api/native/academic-assessment/admin/{slug}/tryouts/{examId}/questions`. Admin aktif, sesi, kursus dan revisi draf diperiksa dalam transaksi. | Impor menambahkan hingga 100 soal dalam urutan pilihan dan melewati soal yang sudah ada. Snapshot menyimpan kunci, pembahasan dan asal soal, dengan verifikasi aset sesuai alur web. Penghapusan melepas snapshot dari draf. Perubahan soal hanya tersedia untuk draf yang belum memiliki pengumpulan. Mutasi dan receipt dicatat secara atomik. |
| Publikasi, kembali ke draf, dan akhiri tryout | Web Admin pada `/admin/courses/{slug}/tryouts`, melalui pilihan status di formulir edit. | Alur berakun Expo mencakup metadata dan bank soal draf. Publikasi serta penarikan memerlukan kontrak perubahan status yang mengoordinasikan pemeriksaan pengumpulan dalam transaksi. |
| Edit isi soal, penghapusan tryout, dan mutasi bank | Gateway fixture. | Penyimpanan berakun untuk aksi ini masih perlu adapter server. |

Perintah kuis native menyertakan `actingRole` dari ruang Tutor atau Admin yang sedang aktif. Server memeriksa peran kanonis serta penugasan Tutor dalam transaksi. Percobaan ulang dengan kunci yang sama menggunakan peran, kursus dan isi perintah awal.

Gateway menyimpan perubahan kuis dan draf tryout yang sedang menunggu kepastian selama sesi native yang sama. Ketika layar dibuka lagi, upaya pemulihan menggunakan isi dan identitas permintaan awal. Pesan sukses daftar dikonsumsi dari hasil yang dimiliki sesi.

Web Admin menyimpan status bersama metadata melalui `saveTryoutAction`. Alur itu belum mendefinisikan transisi berdasarkan revisi atau pengumpulan yang sudah ada. Alur Murid `submitTryoutAction` memeriksa status dan membaca soal sebelum transaksi penyimpanan, sehingga pengumpulan yang sudah lolos pemeriksaan dapat masuk setelah status berubah. Kontrak publikasi baru memerlukan koordinasi jalur Admin dan Murid agar keduanya mengunci tryout yang sama dan memeriksa status di dalam transaksi. Uji konkurensi perlu mencakup penarikan bersamaan dengan pengumpulan, revisi lama, dan pengiriman ulang. Notifikasi publikasi kuis memakai domain template kuis tersendiri. [Aksi Admin dan Murid](../../../../app/actions/tutor-management.ts), [notifikasi kuis](../../../../lib/notifications/send.ts).

Perakitan kuis dan revisi bank melalui MCP tetap memakai alat, scope dan playbook authoring yang sudah ada. `quiz.create`, `quiz.update`, dan `quiz.set_questions` tetap menggunakan jalur proyeksi kanonis. Penilaian jawaban Tutor memakai alur produk. Perubahan ini menambah kompatibilitas transaksi dan transport native, tanpa perubahan skema penyimpanan, scope OAuth, aturan persetujuan MCP atau jalur antrean.

```sh
node_modules/.bin/tsx --test packages/native-parity/academic/assessment/*.test.ts
bun scripts/test-contracts.ts tests/contracts/tutor-quiz-native.test.ts tests/contracts/tutor-quiz-api-access.test.ts tests/contracts/tutor-quiz-manual-grading.test.ts
bun scripts/test-contracts.ts tests/contracts/native-tryout-draft.test.ts tests/contracts/tryout-question-visual-import.test.ts
bun test tests/gamification/question-disclosure-calls.test.ts
```

Skenario Maestro untuk edit, penilaian dan impor fixture tersedia di `.maestro/native-parallel/academic/`. Referensi Playwright web tersedia di `tests/visual/native-parallel/academic/web/`. Bukti Android, iOS dan komparasi piksel masih terbuka. Lampiran penilaian hanya menampilkan nama berkas. Rendering rumus kompleks dan dokumen interaktif mengikuti integrasi renderer bersama.

Uji HTTP lokal memakai sesi Admin dan Tutor sintetis, Next.js, dan PostgreSQL. Uji ini mencakup cakupan pilihan bank, pengungkapan soal, urutan impor, pemulihan permintaan yang dikirim bersamaan, dan penghapusan snapshot. [Fixture dan perintah uji lokal](../local/README.md).
