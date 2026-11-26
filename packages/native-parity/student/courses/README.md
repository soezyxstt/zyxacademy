# Dashboard, kursus, dan materi Student

Pemilik kontrak adalah jalur `native-migration/student`. Expo memasang `CourseScreen` melalui `StudentEntry`. `VerifiedStudentEntry` memakai transport yang terikat origin, akun, dan sesi. Layar daftar mengingat query dan posisi gulir pada entri navigasi. Perubahan hak akses diperiksa ulang saat permintaan berikutnya, termasuk saat membuka dokumen setelah daftar ditampilkan.

## Operasi

| Operasi | Rute Student | Sumber web dan layanan | Otorisasi dan hasil Expo |
|---|---|---|---|
| `GET ?view=dashboard` | `/dashboard` | `listStudentEnrollments`, `loadOnboardingData`, `loadPrimaryLearningData`, `loadRecommendedCoursesData` | Identitas dari sesi Student. Entri aktif berasal dari enrollment yang diperiksa ulang. ID, persentase, dan posisi baca dikirim untuk materi yang masih dalam cakupan akses peserta. |
| `GET ?view=dashboard-extras` | `/dashboard` | Rencana harian, intervensi, gamifikasi, refleksi, antrean ulasan, penguasaan dan penilaian dari layanan dashboard web | Memeriksa enrollment aktif lagi. Tautan dan data kelas mengikuti enrollment tersebut, sedangkan ringkasan pencapaian memakai izin gamifikasi yang terpisah. Bagian yang tersendat dapat dimuat ulang tanpa menyembunyikan kelas dan materi utama. |
| `POST /api/student/today/complete` | `/dashboard` | `markRecommendationDone` | Menandai item untuk akun sesi dan hari yang sedang aktif. Layanan mengabaikan pengulangan ID item yang sudah selesai. |
| `POST /api/student/interventions/[id]/dismiss` | `/dashboard` | Handler intervensi Student | Mengubah status intervensi hanya untuk pemilik sesi yang sedang aktif. Pengulangan operasi mempertahankan status yang sama. |
| `GET ?view=catalog` | `/courses` | `loadStudentCourseCatalog`, `getWhatsAppAdminChatHref` | Metadata katalog dan metrik dari helper web yang sama. Hasil personal mengikuti jurusan dan hak akses akun. Bantuan WhatsApp mengikuti konfigurasi server. |
| `GET ?view=course&courseId=…` | `/courses/[id]` | `getCourse`, `getStudentCourseAccess`, `getCourseChapterOutline`, `getCourseOverviewData` | Kebijakan pusat memeriksa identitas kursus dan cakupan kelas. Bab dan aksi lanjutan mengikuti akses peserta. |
| `GET ?view=material-list&courseId=…` | `/courses/[id]/material` | `loadCourseMaterialData`, kebijakan akses konten dan kuis | Metadata materi, diktat, PDF, bank soal dan status kunci. Setiap jenis memakai kebijakan kelas atau cakupan bab sesuai kontrak detailnya. |
| `GET ?view=material-detail&courseId=…&materialId=…` | `/courses/[id]/material/[materialId]` | Kebijakan `canAccessCourseContent`, sumber terbit kanonis dan sumber kompatibilitas pembaca web | Mengikat identitas dokumen ke kursus. Status terkunci membatasi descriptor dan progres pribadi. Konten yang diizinkan diteruskan ke adapter renderer dengan ID kanonis atau legacy yang sudah diperiksa. |
| `POST { token }` | Dashboard, detail kursus, serta materi terkunci | `enrollWithToken` dan `redeemGroupToken` menggunakan konteks `dashboard` | Akun berasal dari sesi yang diperiksa ulang. Token lama tetap diproses oleh transaksi group, kapasitas dan masa akses yang sudah ada. Retry setelah respons hilang memakai token yang sama dan memeriksa ulang akses kelas. |

Proyeksi kelima rute tersebut tersedia melalui `/api/native/student/courses`. Server memeriksa sesi Better Auth, role `murid`, origin, dan kecocokan header akun sebelum membaca atau mengubah data. Rute PKA memakai pemeriksaan enrollment kampanye. Parameter dan token dibatasi oleh skema. Respons bersifat `private, no-store`. Batas akses konten dan URL berkas dikelola oleh kontrak server masing-masing. [Handler](../../../../app/api/native/student/courses/route.ts) · [read model](../../../../lib/student/native-course-data.ts).

Alur ini memakai kontrak belajar dan penukaran token UI yang ada. Katalog operasi menandai endpoint khusus UI Student. Tool, scope, discovery, consent, playbook, host prompt, paket, dan binding MCP tetap mengikuti kontraknya sendiri. [Katalog MCP](../../../../lib/admin-mcp/operations-catalog.ts).

## Fixture dan bukti

`fixtures.ts` mengekspor `createCourseFixtureRequest` dan senarai kasus. Skenario `enrolled` menjalankan pemilihan dokumen. `unenrolled` tetap punya bab pratinjau, `revoked` mencabut akses saat dokumen berbayar dibuka, `offline` pulih melalui tombol coba lagi, dan `long-content` mempunyai dokumen ke-24 yang mulai di luar viewport. Skenario tambahan `catalog-parity` memakai lima data kelas, tiga filter, dan tanggal penawaran yang cocok dengan fixture web.

```sh
bun test tests/contracts/native-student-courses.test.ts
bun test tests/unit/native-student-course-data.test.ts
bun test tests/unit/native-student-dashboard-extras.test.ts
bun test tests/unit/native-student-offline-courses.test.ts
bun test tests/unit/native-student-assessment-drafts.test.ts
```

Jalankan setiap berkas tersebut dalam proses Bun terpisah karena kontrak HTTP dan read model memakai mock modul pada tingkat berbeda. Skenario Maestro memasang entry `student-fixture` dan menguji kembali ke baris dokumen pada halaman yang panjang. Hasil Android, iOS, dan diff mengikuti artefak workflow pada commit yang diuji. [Maestro](../../../../.maestro/native-parallel/student) · [Referensi Playwright](../../../../tests/visual/native-parallel/student).

## Integrasi dan pekerjaan tersisa

- Entry renderer menerima `courseId`, `materialId`, dan posisi opsional `section` atau `page`. Artikel, diktat, PDF, rumus, dan ilustrasi interaktif menunggu pemasangan renderer integrator. Entry lokal memakai status yang dapat dibaca saat renderer belum tersedia.
- Dashboard native memakai ringkasan pencapaian dan refleksi yang membuka halaman lengkap. Karya visual peringkat, format matematika pada ringkasan dan rincian presentasi web masih memerlukan verifikasi.
- Ringkasan kursus menampilkan harga, lajur perhatian, daftar bab, aksi baca, kuis dan jadwal, serta pintasan kelas. Tata letak dan semua variasi bahasa masih memerlukan perbandingan perangkat.
- Saat perangkat mengonfirmasi jaringan terputus, `VerifiedStudentEntry` menggunakan scope baca lokal integrator, termasuk saat aplikasi baru dibuka dan sesi HTTPS belum dapat diverifikasi. Dashboard dan katalog membuka pustaka unduhan integrator di `/offline`. Aksi pada daftar dan detail dapat memfokuskan pustaka ke ID kursus dan dokumen. Daftar dan detail hanya memproyeksikan dokumen dengan lease yang aktif. Penolakan akses server dan pencabutan lease menutup metadata. Host dapat memasang renderer melalui `openOfflineMaterial`. Callback menerima paket terverifikasi dari penyimpanan integrator setelah scope, revisi dan lease diperiksa. Renderer Artikel dan Diktat native masih menunggu integrasi. [Kontrak host](../../../../apps/mobile-native/features/student/README.md).
- Urutan, kepadatan, dan metadata tampilan katalog serta dokumen perlu diperiksa terhadap web dan build Android serta iOS. Maestro dan Playwright merupakan sumber bukti interaksi dan tampilan yang berbeda.
- Draft penilaian memakai SQLite Expo dengan kunci origin, akun, sesi, locale dan percobaan. Host memasang `AssessmentDraftCleanup` di bawah provider sesi selama masa hidup aplikasi. Saat sesi baru terverifikasi, penyimpanan membuang draft sesi terdahulu di origin itu. [Penyimpanan](../../../../apps/mobile-native/features/student/assessment-draft-store.ts) · [Hook host](../../../../apps/mobile-native/features/student/assessment-drafts.tsx).
