# Entry native Student

Kelima puluh rute Student sudah terpasang pada branch integrasi. Buka aplikasi Expo, masuk dengan akun Murid, lalu buka `/dashboard`. Workflow `Native integration preview` memeriksa rute pada commit induk dan menjalankan alur Murid, Tutor, serta Admin di Android ketika dipicu manual.

`StudentEntry` menerima satu alamat web Student (path dan query), sesi, transport, slot renderer serta callback navigasi. `matchStudentRoute` memilih pemilik layar dan mendahulukan Tutorial PKA statis. Daftar lengkap dan tiga kasus awal per halaman ada di `packages/native-parity/student/evidence/routes.json`.

Untuk router produk, pasang `VerifiedStudentEntry` di dalam `NativeSessionProvider` dan `NotificationsProvider`. Entry membaca peran dan locale dari `useNativeAccountContext`, menggunakan transport untuk sesi yang sama dan memasok status push perangkat. Layout Expo memasang `AssessmentDraftCleanup` di bawah provider sesi agar draf pada sesi tersebut dibersihkan saat logout, kedaluwarsa, atau ditolak saat verifikasi. Pasang shell shared-ui di host. Teruskan `navigate`, `replace`, `back`, `entryKey`, `initialScrollY`, dan `onScrollY` dari stack. Simpan posisi per entri dan pertahankan key ketika hanya query berubah. Buang stack dan posisi saat akun, origin atau sesi berubah. Tautan HTTPS memakai browser sistem. Host dapat memasang `openExternal` untuk handoff khusus. Daftar bridge tambahan terdapat pada `StudentServices` di `contracts.ts`.

Setelah API detail memastikan akses, `renderMaterial` menerima jenis dokumen, `courseId`, `materialId`, dan posisi opsional `section` atau `page`. Untuk PDF, `webPath` menunjuk ke rute relatif `/courses/[id]/material/[materialId]` pada origin sesi. Jika host belum memasang renderer PDF, tombol **Buka PDF di web** memakai `openExternal`. Halaman web meminta sesi browser dan memeriksa izin bab atau kursus sebelum memuat PDF. Diktat PDF memakai endpoint `/api/courses/[id]/diktats/[diktatId]/pdf` pada web dengan pemeriksaan izin baca, dan izin unduh tambahan untuk `download=1`. Slot native tidak menerima URL storage, URL bertanda tangan, atau kredensial sesi.

Latihan kode pada kuis langsung membuka halaman kuis langsung kelas. Peserta masuk dengan akun yang sama di browser dan bergabung kembali menggunakan kode ruang. Tautan hanya memuat rute kelas, tanpa kode ruang, token, atau status soal.

Pengaturan notifikasi browser menampilkan tautan HTTPS dari origin sesi. Peserta membuka tautan di profil browser atau aplikasi web yang menerima notifikasi. iOS menawarkan pembukaan di browser default. Android menyediakan tautan yang dapat disalin agar App Links tidak membuka kembali aplikasi. Host dapat memasang `openBrowserNotifications` untuk memilih profil browser yang didukung atau menangani rute yang sama melalui callback `openExternal` yang disuntikkan. Aplikasi native membuka tujuan. Halaman web menghentikan langganan di profil dan akun browser tersebut.

Saat perangkat memastikan koneksi terputus, pasang entry yang sama pada rute produk. `VerifiedStudentEntry` menggunakan identitas baca lokal integrator dan menampilkan kelas dan dokumen yang masih ditanggung lease. `/dashboard` dan `/courses` membuka pustaka integrator di `/offline`. Rute materi mempertahankan daftar, Back, dan tab. Setelah API memastikan akses ke artikel yang dibuka lewat slug, entri yang sama memakai ID kanonis dengan parameter dan fragmen awal. Manifest offline menyimpan ID dokumen. Jika perangkat mulai offline pada tautan lama dengan slug, **Bacaan offline** membuka pustaka kursus yang telah diverifikasi agar pengguna dapat memilih dokumennya. Ketika online, pustaka menyediakan unduh dan hapus paket yang diizinkan. Entry memakai locale konteks akun atau locale pada identitas sesi offline yang tersimpan. Prop `offlineLocale` dan default autentikasi berlaku jika keduanya belum tersedia. Cabang ini tidak membuat sesi transport atau memanggil renderer online.

Host dapat memasang `openOfflineMaterial(material: VerifiedOfflineMaterial)` untuk renderer pada `VerifiedStudentEntry`. Entry memuat ulang descriptor SQLite dan memakai `useOfflineReadingPackages().read` untuk paket yang terikat pada origin, akun, sesi, bahasa, bab dan revisi yang sama. Callback menerima `scope`, `resource`, `saved` berisi paket dan aset terverifikasi, `leaseExpiresAt` yang dibatasi oleh sesi, manifest dan paket, serta posisi `section` atau `page` opsional. Renderer harus menutup isi saat lease atau scope berubah dan menggunakan aset lokal dari paket. Pembaca Artikel dan Diktat native tetap merupakan pekerjaan integrasi, dengan pustaka unduhan sudah terpasang.

## Menjalankan fixture lokal

Dari root repo dengan Node 24 dan Bun 1.3.14, pasang dependensi dengan `bun install --frozen-lockfile` dan `npm ci --prefix apps/mobile-native`. Di checkout uji, pasang route fixture sementara sebelum bundling.

```sh
printf '%s\n' 'export { default } from "../features/student/StudentFixtureRoute";' > apps/mobile-native/app/student-fixture.tsx
cd apps/mobile-native
npm run android
```

Untuk simulator macOS, gunakan `npm run ios`. Buka `zyx-native-parity://student-fixture?scenario=enrolled`. Skenario kursus lain adalah `unenrolled`, `revoked`, `offline`, dan `long-content`. Parameter `path` memilih halaman. Tulis parameter halaman pada tautan fixture sebagai `query_<nama>` dan enkode setiap nilai sebagai parameter URL. Misalnya, `zyx-native-parity://student-fixture?scenario=catalog-parity&path=/courses&query_jurusan=tpb&query_q=no-match` membuka `/courses?jurusan=tpb&q=no-match` pada fixture. Bentuk datar ini memungkinkan Expo membaca setiap parameter setelah Android mendekode tautan. [Parser tautan fixture](fixture-location.ts)

`student-fixture` adalah rute diagnostik yang dipasang di checkout uji dan CI. Fixture katalog dan dashboard menampilkan dialog berisi tujuan tautan eksternal. Pada entry Student terverifikasi, tujuan HTTPS yang lolos validasi dibuka melalui browser sistem.

Workflow bukti iOS memasang pemilih fixture sebagai halaman awal pada build uji. Pemilih meneruskan parameter skenario awal ke rute fixture, lalu keluar dari layar sebelum asersi dan pengambilan gambar. Probe wajib membuka katalog dan memeriksa baris kursus. Peralihan fixture di tengah flow membuka ulang proses aplikasi tanpa menghapus data, termasuk draf SQLite. Flow ini mengukur layar Student dan pemulihan draf setelah proses dibuka ulang. Izin SpringBoard dan penerimaan URL ketika aplikasi sudah terbuka memerlukan pemeriksaan perangkat terpisah. [Kompilasi flow iOS](../../../../tests/visual/native-parallel/student/compile-ios-fixtures.py)

Untuk mereproduksi build bukti iOS, gunakan checkout uji dengan `student-fixture.tsx` terpasang. Pasang PyYAML 6.0.3, lalu jalankan dari root repo.

```sh
bun tests/visual/native-parallel/student/generate-smoke.ts
launcher=artifacts/student-evidence/ios/launcher
python tests/visual/native-parallel/student/compile-ios-fixtures.py \
  .maestro/native-parallel/student artifacts/student-evidence/generated "$launcher"
cp "$launcher/cases.json" apps/mobile-native/features/student/ios-evidence-cases.json
cp tests/visual/native-parallel/student/ios-evidence-menu.tsx.in apps/mobile-native/app/index.tsx
```

Bangun aplikasi Expo iOS konfigurasi Release pada simulator yang sudah menyala. Jalankan `bash tests/visual/native-parallel/student/run-maestro.sh ios "$STUDENT_SIMULATOR_UDID"`, lalu `bash tests/visual/native-parallel/student/run-generated-smoke.sh ios "$STUDENT_SIMULATOR_UDID"`.

Fixture memakai data sintetis lokal. Entry fixture menggunakan Map untuk jawaban selama skenario. Parameter `store=disk` menggunakan repository jawaban produksi pada database SQLite fixture tersendiri untuk menguji pemulihan setelah proses aplikasi ditutup. Entry terverifikasi menggunakan penyimpanan SQLite terikat sesi pada perangkat.

## Verifikasi

```sh
npm run typecheck --prefix apps/mobile-native
bun test packages/native-parity/student/routes.test.ts packages/native-parity/student/transport.test.ts
bun scripts/test-contracts.ts tests/contracts/native-student-session.test.ts tests/contracts/native-student-courses.test.ts tests/contracts/native-student-assessment.test.ts tests/contracts/native-student-learning.test.ts tests/contracts/native-student-learning-postgres.test.ts
```

Lihat `tests/visual/native-parallel/student/` untuk Playwright, `.maestro/native-parallel/student/` untuk interaksi perangkat, dan workflow `Native Student evidence` untuk screenshot serta hasil perbandingan per platform. Kredit visual membutuhkan tiga pasang gambar dengan masukan, ukuran dan density yang sama di masing-masing platform.

Jika langkah Maestro mandiri di Android gagal, CI hanya mengulang kasus dengan bukti kegagalan transport ADB. Setiap kasus diulang maksimal sekali. Artefak `report.xml`, `results/`, dan log awal tetap tersedia. `standalone-retry/` menyimpan bukti percobaan ulang. `standalone-attempts.json` memilih hasil efektif setiap kasus sehingga perbandingan gambar dan pemeriksaan posisi gulir memakai laporan serta tangkapan dari percobaan yang sama. [Runner Android](../../../../tests/visual/native-parallel/student/retry-android-standalone.py)
