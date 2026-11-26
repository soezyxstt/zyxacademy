# Alur tutor native

Entri native `TutorScreen` berada di `apps/mobile-native/features/academic/tutor/index.tsx`. Gunakan URL produk yang sama dengan web. Rute kuis dan pengelolaan tryout dirutekan ke fitur Assessment. Pratinjau menggunakan akun tutor sintetis `academic-tutor` dengan `academic-course-1` yang berisi, `academic-course-2` yang kosong, dan `academic-course-3` di luar penugasan.

## Operasi terhubung

| Rute aplikasi | Sumber web dan cakupan native |
|---|---|
| `/tutor` | Dashboard, sesi mendatang, tiket menunggu, dan mata kuliah dari `getTutorDashboardReadModel`. |
| `/tutor/[courseId]` | Ringkasan analitik mata kuliah melalui pembacaan snapshot dan data cohort yang sama. Native menampilkan jumlah peserta, konsep dengan distribusi penguasaan, dan intervensi. |
| `/tutor/[courseId]/participants` | Daftar, pencarian, filter jenis akses, kelompok, dan detail peserta dari `getTutorCourseParticipants`. |
| `/tutor/[courseId]/grading` | Antrean dan pembacaan jawaban tryout memakai `readAuthorizedTryoutGrading` dan pencatatan paparan soal yang sama. Web dan native menerbitkan nilai akhir serta catatan tutor melalui `gradeTryoutSubmission`. Unduhan lampiran tersedia di Zyx web. |
| `/tutor/schedule` | Minggu, slot, sesi, tiket, dan kelompok dari `getTutorScheduleReadModel`. Kalender bersama menampilkan agenda per tanggal, dan pratinjau memakai dialog bersama untuk tambah/edit slot. Pengelolaan jadwal dan keputusan tiket tersedia di Zyx web. Pembuatan slot memakai ID server per eksekusi, sehingga membalas permintaan ulang setelah respons hilang membutuhkan kontrak tambahan. |
| `/tutor/discussions`, `/tutor/[courseId]/discussions` | Pencarian, halaman pertanyaan dan pesan, serta jawaban teks melalui katalog, akses channel, `getThread` dan aksi `reply` yang sama. `requestId` dan `Idempotency-Key` cocok. Tampilan membaca kembali ID pesan yang dikembalikan oleh layanan. Aksi tulis memakai sesi, origin tepercaya, dan izin channel. Lampiran, reaksi, sebutan, dan Zyra tersedia di Zyx web. |
| `/tutor/[courseId]/materials` | Judul dan ringkasan dokumen yang tersedia bagi tutor. |
| `/tutor/[courseId]/videos` | Playlist dan video dari `getCourseVideosData`. Aksi Putar meminta URL baru dari endpoint playback dan membuka HTTPS atau YouTube melalui browser sistem. Proxy yang membutuhkan cookie web, unggahan, dan pengelolaan playlist tersedia di Zyx web. |
| `/tutor/[courseId]/live` | Daftar kuis yang layak dan snapshot sesi milik tutor dari sumber data web, dengan gate yang sama. Interaksi realtime dan kontrol hosting tersedia di Zyx web. |
| `/tutor/docs`, `/tutor/docs/[slug]` | Pencarian dan Panduan Tutor ID dari sumber yang juga dipakai web. Diagram web masih dilayani oleh renderer web. |

Tutor support memakai `/api/native/academic/tutor-support/*` melalui `createTutorSupportClient(transport)`. Sesi menentukan akun, role Tutor wajib, dan semua endpoint mata kuliah memeriksa penugasan aktif pada canonical/legacy ID. Respons memakai `Cache-Control: private, no-store`. Jawaban yang pengirimannya belum terkonfirmasi menyimpan isi dan ID yang sama dalam klien terikat sesi. Membuka kembali rute dalam sesi itu mempertahankan percobaan, sedangkan akun atau sesi baru mendapatkan state baru.

Penerbitan nilai memakai `POST /api/native/academic/tutor-support/courses/{courseId}/grading/{submissionId}` dengan nilai bulat 0 sampai 100, catatan maksimal 4.000 karakter, revisi yang dibaca dari antrean, dan header `Idempotency-Key`. Server mengunci pengumpulan dan memeriksa sesi, peran, penugasan, tipe ujian, isi jawaban, serta revisi. Nilai dan bukti penerimaan berada dalam satu transaksi PostgreSQL. ID penerimaan bergantung pada akun, sesi, mata kuliah kanonis, pengumpulan dan ID permintaan. Klien mempertahankan draf atau permintaan yang belum terkonfirmasi selama sesi aplikasi yang sama. Setelah konfirmasi, klien memuat ulang antrean. Konflik membuka tindakan untuk membaca nilai terbaru.

## Verifikasi

- `bun test packages/native-parity/academic/tutor` menguji akses, snapshot lama dan baru, status kosong, retry, serta batas kontrak API. Uji command menyimulasikan respons hilang lalu memeriksa ID yang tetap sama dan pembacaan ID pesan.
- `tests/contracts/tutor-grading-scope.test.ts` memakai PostgreSQL sintetis untuk membuktikan isolasi sesi, pemutaran ulang ID, penolakan lintas kelas dan tipe ujian, konflik setelah perubahan jawaban atau penilaian web, serta rollback ketika pencatatan bukti penerimaan gagal.
- `maestro test .maestro/native-parallel/academic/tutor-assigned.yaml` membuka dashboard, mata kuliah, peserta dan penilaian tryout, termasuk detail dan Back. Flow `tutor-empty-denied.yaml` dan `tutor-retry.yaml` mencakup penugasan yang kosong, penolakan dan pemulihan. Flow `tutor-schedule.yaml` memilih tanggal, membuat slot, membuka dialog edit, lalu kembali ke slot setelah pindah minggu. Jalankan pada build aplikasi dengan skema `zyx-native-parity`.
- Bukti emulator, simulator dan perbandingan piksel masih memerlukan run perangkat. Pratinjau sintetis menjalankan penilaian, jadwal, jawaban diskusi, dan fase kuis langsung dari data milik sesi pratinjau.

## MCP

HTTP native menggunakan sesi aplikasi dan panggilan pembacaan server yang sama. Jawaban diskusi memakai aksi produk `reply` serta idempotensi, penyimpanan dan pengiriman event yang sudah diterapkan layanan diskusi. Katalog operasi mencatat bahwa penilaian tryout memerlukan sesi Tutor produk dan penugasan yang aktif. Tool, scope, consent, capability discovery, playbook, paket skill, prompt host, dan binding eksternal mengikuti kontrak MCP yang sudah ada.
