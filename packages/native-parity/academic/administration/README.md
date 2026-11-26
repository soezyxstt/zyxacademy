# Administrasi akademik di Expo

Gunakan `AdministrationProvider` untuk membungkus navigator fixture dan `AdministrationScreen` untuk merender rute yang dikelola. Provider mengikat fixture ke ID akun, peran dan skenario. `useAdministrationSnapshot` memasok perubahan bundle ke daftar review mata kuliah. `administrationCases` di `routes.ts` memuat 57 ID dari 19 pola rute, masing-masing dengan kasus terisi, kosong dan gagal. Rute kompatibilitas mengganti entri navigasi dengan halaman tujuan. Skenario kosong atau error pada alias mengikuti langkah lanjut di tujuan jika alias dapat diselesaikan.

`AdministrationLiveScreen` menerima transport akun aktif. GET pada `/api/native/academic-administration/` memakai sesi yang sama dengan web, memproyeksikan bidang untuk UI native, dan menolak peran selain Admin setelah memeriksa identitas kanonik. Pembacaan meminta ulang data saat gagal, mengikat hasil ke route dan akun aktif, serta mengirim respons `private, no-store`.

| Alur | Pembacaan produksi | Aksi fixture |
| --- | --- | --- |
| Pengguna, kelompok dan token | `getAdminUsersData`, `getAdminStudyGroups`, `getEnrollmentTokens` | Ubah peran atau status, buat atau edit kelompok, kelola anggota, buat atau hapus token |
| Jadwal | `getAdminScheduleData`, termasuk periode, slot, jadwal akademik terbit, tutor, tiket dan audit | Buat atau edit jadwal, ketersediaan, penugasan, relokasi dan pembatalan sesi, sertifikasi tutor |
| Notifikasi | `getNotificationHistoryAction` | Komposisi, audiens, pratinjau, konfirmasi dan pencocokan hasil pengiriman fixture |
| Tutorial PKA | `getPkaRegistrationsAction`, `getPkaAnnouncementsAction`, `getPkaSchedulesAction` | Cari atau lihat status bukti, kelola pengumuman, buat atau edit jadwal PKA |
| Review materi | `resolveCourseIdentity`, `getIdeaBundleImport`, `getProductBundleImport` | Review item dan bundle, revisi konten, terbit, tarik, hapus |
| PDF Diktat | `POST /api/admin/bundles/product/{id}/pdf` mengantrekan pekerjaan, GET hasil permintaan dan GET detail bundle memberi status dari server | Antrean fixture dan perubahan status |

Aksi PDF tersedia pada Diktat dari draf Product V2/V3 yang diotorisasi saat pembacaan. Setelah konfirmasi, Expo membuat UUID dan mengikat percobaan ke revisi serta produk. Percobaan ulang POST menggunakan UUID yang sama dan membutuhkan draf permintaan dalam sesi serta target yang masih ditampilkan server. Tautan pemulihan URL hanya dapat memeriksa status. Bukti yang ditampilkan harus sesuai dengan ID percobaan yang diterima. Rute server menolak origin luar dan mengharuskan tipe konten JSON. PDF V4 mengikuti verifikasi tepercaya yang sudah ada.

Pemetaan produksi mencakup pembacaan dan antrean PDF. Form administrasi, pengiriman dan publikasi berjalan pada data fixture. Preview file bukti PKA, renderer konten lengkap dan unduhan PDF tetap merupakan dependensi integrasi. PKA tetap di luar katalog MCP. Pembacaan native dan PDF V2/V3 tercatat sebagai aksi UI. Alat authoring, scopes, consent, discovery, playbook, skill, host prompt dan binding lingkungan MCP mengikuti kontrak saat ini. Tidak ada migrasi database atau perubahan deployment.

Jalankan cek domain dan adapter dengan `node_modules/.bin/tsx --test packages/native-parity/academic/administration/administration.test.ts`. Skenario Maestro `administration-conflict.yaml` dan `administration-bundle.yaml` berada di `.maestro/native-parallel/academic/`. Perbandingan piksel Playwright, Android dan iOS serta hasil antrean eksternal memerlukan verifikasi lanjutan.
