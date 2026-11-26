# Entry native Student

`StudentEntry` menerima satu alamat web Student (path dan query), sesi, transport, slot renderer serta callback navigasi. `matchStudentRoute` memilih pemilik layar dan mendahulukan Tutorial PKA statis. Daftar lengkap dan tiga kasus awal per halaman ada di `packages/native-parity/student/evidence/routes.json`.

Untuk router produk, pasang `VerifiedStudentEntry` di dalam `NativeSessionProvider` dan `NotificationsProvider`. Entry membaca peran dan locale dari `useNativeAccountContext`, menggunakan transport untuk sesi yang sama dan memasok status push perangkat. Tempatkan `AssessmentDraftCleanup` di bawah provider sesi selama masa hidup aplikasi agar logout membersihkan jawaban sementara. Pasang shell shared-ui di host. Teruskan `navigate`, `replace`, `back`, `entryKey`, `initialScrollY`, dan `onScrollY` dari stack. Simpan posisi per entri dan pertahankan key ketika hanya query berubah. Buang stack dan posisi saat akun, origin atau sesi berubah. Route yang dikelola Tutor atau browser memakai `openExternal` dari host. Renderer artikel/diktat menerima courseId, materialId serta section/page setelah hak akses diperiksa. Daftar bridge tambahan terdapat pada `StudentServices` di `contracts.ts`.

## Menjalankan fixture lokal

Dari root repo dengan Node 24 dan Bun 1.3.14, pasang dependensi dengan `bun install --frozen-lockfile` dan `npm ci --prefix apps/mobile-native`. Di checkout uji, pasang route fixture sementara sebelum bundling.

```sh
printf '%s\n' 'export { default } from "../features/student/StudentFixtureRoute";' > apps/mobile-native/app/student-fixture.tsx
cd apps/mobile-native
npm run android
```

Untuk simulator macOS, gunakan `npm run ios`. Buka `zyx-native-parity://student-fixture?scenario=enrolled`. Skenario kursus lain adalah `unenrolled`, `revoked`, `offline`, dan `long-content`. Untuk langsung membuka halaman, tambahkan parameter `path` dengan URL encoding. Contohnya `zyx-native-parity://student-fixture?scenario=retry&path=%2Fcourses%2Fnative-assessment-course%2Fquiz%2Fnative-quiz`. Setiap fixture memakai data sintetis lokal. Entry fixture menggunakan Map untuk jawaban selama skenario. Entry terverifikasi menggunakan penyimpanan SQLite terikat sesi pada perangkat.

## Verifikasi

```sh
npm run typecheck --prefix apps/mobile-native
bun test packages/native-parity/student/routes.test.ts packages/native-parity/student/transport.test.ts
bun scripts/test-contracts.ts tests/contracts/native-student-session.test.ts tests/contracts/native-student-courses.test.ts tests/contracts/native-student-assessment.test.ts tests/contracts/native-student-learning.test.ts tests/contracts/native-student-learning-postgres.test.ts
```

Lihat `tests/visual/native-parallel/student/` untuk Playwright, `.maestro/native-parallel/student/` untuk interaksi perangkat, dan workflow `Native Student evidence` untuk screenshot serta hasil perbandingan per platform. Kredit visual membutuhkan tiga pasang gambar dengan masukan, ukuran dan density yang sama di masing-masing platform.
