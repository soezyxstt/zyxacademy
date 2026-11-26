# Entry native Student

`StudentEntry` menerima satu alamat web Student (path dan query), sesi, transport, slot renderer serta callback navigasi. `matchStudentRoute` memilih pemilik layar dan mendahulukan Tutorial PKA statis. Daftar lengkap dan tiga kasus awal per halaman ada di `packages/native-parity/student/evidence/routes.json`.

Untuk router produk, pasang `VerifiedStudentEntry` di dalam `NativeSessionProvider` dan `NotificationsProvider`. Entry membaca peran dan locale dari `useNativeAccountContext`, menggunakan transport untuk sesi yang sama dan memasok status push perangkat. Layout Expo memasang `AssessmentDraftCleanup` di bawah provider sesi agar logout membersihkan jawaban sementara. Pasang shell shared-ui di host. Teruskan `navigate`, `replace`, `back`, `entryKey`, `initialScrollY`, dan `onScrollY` dari stack. Simpan posisi per entri dan pertahankan key ketika hanya query berubah. Buang stack dan posisi saat akun, origin atau sesi berubah. Tautan HTTPS memakai browser sistem. Host dapat memasang `openExternal` untuk handoff khusus. Daftar bridge tambahan terdapat pada `StudentServices` di `contracts.ts`.

Setelah API detail memastikan akses, `renderMaterial` menerima jenis dokumen, `courseId`, `materialId`, dan posisi opsional `section` atau `page`. Untuk PDF, `webPath` menunjuk ke rute relatif `/courses/[id]/material/[materialId]` pada origin sesi. Jika host belum memasang renderer PDF, tombol **Buka PDF di web** memakai `openExternal`. Halaman web meminta sesi browser dan memeriksa izin bab atau kursus sebelum memuat PDF. Diktat PDF memakai endpoint `/api/courses/[id]/diktats/[diktatId]/pdf` pada web dengan pemeriksaan izin baca, dan izin unduh tambahan untuk `download=1`. Slot native tidak menerima URL storage, URL bertanda tangan, atau kredensial sesi.

Saat perangkat memastikan koneksi terputus, pasang entry yang sama pada rute produk. `VerifiedStudentEntry` menggunakan identitas baca lokal integrator dan menampilkan kelas dan dokumen yang masih ditanggung lease. `/dashboard` dan `/courses` membuka pustaka integrator di `/offline`. Rute materi mempertahankan daftar, Back, dan tab. Setelah API memastikan akses ke artikel yang dibuka lewat slug, entri yang sama memakai ID kanonis dengan parameter dan fragmen awal. Manifest offline menyimpan ID dokumen. Jika perangkat mulai offline pada tautan lama dengan slug, **Bacaan offline** membuka pustaka kursus yang telah diverifikasi agar pengguna dapat memilih dokumennya. Ketika online, pustaka menyediakan unduh dan hapus paket yang diizinkan. Entry memakai locale konteks akun atau locale pada identitas sesi offline yang tersimpan. Prop `offlineLocale` dan default autentikasi berlaku jika keduanya belum tersedia. Cabang ini tidak membuat sesi transport atau memanggil renderer online.

Host dapat memasang `openOfflineMaterial(material: VerifiedOfflineMaterial)` untuk renderer pada `VerifiedStudentEntry`. Entry memuat ulang descriptor SQLite dan memakai `useOfflineReadingPackages().read` untuk paket yang terikat pada origin, akun, sesi, bahasa, bab dan revisi yang sama. Callback menerima `scope`, `resource`, `saved` berisi paket dan aset terverifikasi, `leaseExpiresAt` yang dibatasi oleh sesi, manifest dan paket, serta posisi `section` atau `page` opsional. Renderer harus menutup isi saat lease atau scope berubah dan menggunakan aset lokal dari paket. Pembaca Artikel dan Diktat native tetap merupakan pekerjaan integrasi, dengan pustaka unduhan sudah terpasang.

## Menjalankan fixture lokal

Dari root repo dengan Node 24 dan Bun 1.3.14, pasang dependensi dengan `bun install --frozen-lockfile` dan `npm ci --prefix apps/mobile-native`. Di checkout uji, pasang route fixture sementara sebelum bundling.

```sh
printf '%s\n' 'export { default } from "../features/student/StudentFixtureRoute";' > apps/mobile-native/app/student-fixture.tsx
cd apps/mobile-native
npm run android
```

Untuk simulator macOS, gunakan `npm run ios`. Buka `zyx-native-parity://student-fixture?scenario=enrolled`. Skenario kursus lain adalah `unenrolled`, `revoked`, `offline`, dan `long-content`. Untuk langsung membuka halaman, tambahkan parameter `path` dengan URL encoding. Contohnya `zyx-native-parity://student-fixture?scenario=retry&path=%2Fcourses%2Fnative-assessment-course%2Fquiz%2Fnative-quiz`. Setiap fixture memakai data sintetis lokal. Entry fixture menggunakan Map untuk jawaban selama skenario. Parameter `store=disk` menggunakan repository jawaban produksi pada database SQLite fixture tersendiri untuk menguji pemulihan setelah proses aplikasi ditutup. Entry terverifikasi menggunakan penyimpanan SQLite terikat sesi pada perangkat.

## Verifikasi

```sh
npm run typecheck --prefix apps/mobile-native
bun test packages/native-parity/student/routes.test.ts packages/native-parity/student/transport.test.ts
bun scripts/test-contracts.ts tests/contracts/native-student-session.test.ts tests/contracts/native-student-courses.test.ts tests/contracts/native-student-assessment.test.ts tests/contracts/native-student-learning.test.ts tests/contracts/native-student-learning-postgres.test.ts
```

Lihat `tests/visual/native-parallel/student/` untuk Playwright, `.maestro/native-parallel/student/` untuk interaksi perangkat, dan workflow `Native Student evidence` untuk screenshot serta hasil perbandingan per platform. Kredit visual membutuhkan tiga pasang gambar dengan masukan, ukuran dan density yang sama di masing-masing platform.
