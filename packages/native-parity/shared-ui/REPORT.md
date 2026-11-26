# Bukti shared-ui

Entry `SharedUiCase({ id })` menjalankan 52 fixture deterministik dalam 17 kelompok. Tiga kelompok layout memakai `FirstSliceExample` dan punya satu kasus lebar tambahan untuk daftar. Kontrak props, ID aksi, dan contoh konsumsi ada di [README](../../../apps/mobile-native/features/shared-ui/README.md) dan [CONTRACTS](../../../apps/mobile-native/features/shared-ui/CONTRACTS.md). Pemetaan pemanggil Student, Tutor, dan Admin beserta batas otorisasinya ada di [inventaris sumber](INVENTORY.md).

## Entry integrasi dan reproduksi

Basis integrasi memasang sepuluh kasus awal pada `zyx-native-parity://internal/shared-ui/<caseId>`. Untuk mengikat semua kasus pada rute itu, integrator dapat mencari ID di `sharedUiCases` dari `packages/native-parity/shared-ui/cases.ts` lalu merender `<SharedUiCase id={fixture.id} />`. Pertahankan perilaku redirect untuk ID yang tidak terdaftar. Halaman produk mengikat callback ke router serta adapter domain masing-masing.

Untuk menguji seluruh galeri sekarang, gunakan checkout uji bersih. Skrip berikut membuat rute lokal `/shared-ui/[id]` dan menolak menimpa berkas yang sudah ada. Jalankan Maestro terhadap binary yang dibangun dari checkout tersebut. [Perintah capture, pemeriksaan geometri, serta diff perangkat](../../../tests/visual/native-parallel/shared-ui/device/README.md)

```sh
bun install --frozen-lockfile
npm ci --prefix apps/mobile-native
node packages/native-parity/shared-ui/install-local-route.mjs
npm --prefix apps/mobile-native run typecheck
npm --prefix apps/mobile-native start
```

Untuk menjalankan referensi, dari root nyalakan `node node_modules/next/dist/bin/next dev tests/visual/native-parallel/shared-ui --hostname 127.0.0.1 --port 3217`. Di terminal kedua jalankan perintah di bawah. Gunakan `CHROMIUM_PATH` jika Chromium berada di luar instalasi Playwright. Skrip capture memakai font Inter dan Lexend aplikasi, locale id-ID, zona Asia/Jakarta, gerakan dikurangi, dan tanggal fixture 2 Maret 2026. Setiap kasus mengambil viewport 380 × 760 CSS px kecuali grid/tabel lebar (768 × 760) dan daftar lebar (1024 × 760).

```sh
PARITY_DPR=1 bun tests/visual/native-parallel/shared-ui/capture.ts
PARITY_DPR=3 bun tests/visual/native-parallel/shared-ui/capture.ts
node --experimental-strip-types tests/visual/native-parallel/shared-ui/interactions.ts
bun test tests/native-parity/shared-ui
python -m unittest discover -s tests/visual/native-parallel/shared-ui/device
```

Untuk iPhone, iPad, atau emulator dengan viewport berbeda, atur `SHARED_UI_BASE_WIDTH` ke kelompok 380, 768 atau 1024, `SHARED_UI_VIEWPORT` ke dimensi area konten aktual, `PARITY_DPR` ke density aktual, dan `SHARED_UI_REFERENCES` ke direktori terpisah. Teruskan direktori hasil `dpr<DPR>` ke opsi `--reference-dir` collector. Ini membuat render web baru pada dimensi perangkat. PNG yang dipotong atau diperbesar dari viewport lain akan memberi pembanding yang keliru.

## Cakupan per item

Manifest menyimpan ID kasus, komponen, tema, dan viewport. Laporan capture menautkan ID ke PNG bernama sama, hasil pemeriksaan overflow dan target fokus pertama. Setiap baris di bawah memiliki implementasi native, fixture dan skenario interaksi. Batas antara komposit dan fungsi domain mengikuti pemanggil web.

| Ekspor | Tiga kondisi utama | Referensi dan batas perbandingan |
| --- | --- | --- |
| NativeCompactShell | Back dokumen, judul panjang, slot atas/bawah | ApplicationShell, ApplicationPage, MobileTopNavbar dan daftar dokumen Student. Slot memakai callback lokal. Inset menunggu perangkat. |
| NativePageHeader | Aksi aktif, aksi terkunci/sibuk, judul aksesibel | PageHeader dengan Button web. Judul aksesibel diuji terpisah dari judul navbar. |
| NativeResponsiveList | Berisi, kosong/reset, gagal/retry; tambahan mode lebar | UsersDashboard, ParticipantsClient dan panel status Admin. NativeListRow, NativeStatusPanel, SharedUiActionButton teruji di dalam komposisi ini. Native menerima representasi baris dari halaman. |
| MobileNavbar | Student dengan Home, Tutor dengan pengganti kelas, Admin dengan Back | MobileTopNavbar serta grup aksi sesuai peran. Query, autentikasi dan navigasi diikat oleh host. |
| RoleBottomNavigation | Tujuan Student dengan badge, kelas Tutor aktif, editor Admin menyembunyikan nav | MobileBottomNav dengan model label per peran. Keluar editor memperlihatkan nav Admin. |
| NavigationTabs | Tab pertama, pilihan akademik, daftar melebihi lebar | StudentLeaderboardControls dan Tabs. Native menyediakan menu overflow terukur dan callback pilihan terkontrol. |
| SharedDialog | Pemicu tertutup, validasi alasan, alasan panjang | Dialog web dengan isi fixture jadwal. Buka, submit kosong, Escape dan fokus ke pemicu diuji di Chromium. |
| SharedSheet | Pemicu tertutup, outline pendek, outline panjang/Back | Sheet web dan isi fixture outline. Gestur, Back dan keyboard fisik pada modal memerlukan perangkat. |
| SharedPopover | Tertutup, filter periode, pilihan kelas panjang | StudentLeaderboardControls mengatur popover web. Native mengukur anchor dan menerima ref pemicu untuk pemulihan fokus. |
| ResponsiveGrid | Sempit, lebar, judul panjang | DocumentListClient mode grid. Ambang dokumen 464/704/944/1184 dp. Halaman memasok isi kartu. |
| ResponsiveTable | Kosong, nama panjang di 380 px, multibaris lebar | WatchlistTable Tutor; teks panjang, label kolom, format tanggal relatif dan cabang stacked/tabel. |
| Calendar | Hari kosong, hari beragenda, detail terpilih | StudentScheduleMobile. Konten detail fixture ditentukan pemanggil; minggu/tanggal/agenda dapat diikat ke data berizin milik tiap peran. |
| Pagination | Halaman awal, halaman tengah, permintaan berikut tertunda | TutorQuizForm dan UsersDashboard. Saat tertunda, Admin web menyembunyikan hitungan lama dan mengunci kedua tombol; native menampilkan status sibuk. |
| SharedUiSearch | Tertutup, query terisi, query sedang diproses | SearchBar. Input, hapus, submit dan kembali ke pemicu memakai callback lokal. |
| SharedUiStatus | Sedang memuat, kosong dengan aksi, gagal dengan retry | AdminEmptyState, AdminErrorState dan indikator loading berlabel. |
| SharedUiToolbar | Ringkas, pilihan yang membungkus, aksi tertunda | QuestionBankTabs/QuestionBankToolbar dan kontrol fixture. Halaman menentukan aksi sekunder. |
| SharedUiComposer | Draft kosong, lampiran terpilih, pemulihan draft gagal | DiscussionComposer dengan adapter sintetis. Composer native memiliki slot alat/lampiran tanpa renderer konten kompleks. Adapter mengikat ID permintaan asli untuk hasil kirim yang belum pasti. |

## Bukti dan batas izin

Jalur ini menambah **0 operasi backend**. Fixture tidak memerlukan sesi, akses kursus, kamera, filesystem perangkat, atau scope MCP. Permintaan halaman berikut yang dipicu UsersDashboard pada kasus pending ditahan di Playwright sebelum mencapai server. Penggantian akun, pengiriman diskusi, moderasi, unggah, pencarian server dan pemesanan jadwal tetap menggunakan otorisasi masing-masing adapter. Repo tidak mengubah tool, scope, consent, katalog operasi atau deployment MCP dalam diff jalur ini.

Status Android dan iOS untuk seluruh baris adalah **menunggu pengujian perangkat**. Build/bundle dan tes host menguji kompilasi serta callback. Bukti orientasi sentuhan, IME, TalkBack/VoiceOver, perpindahan fokus keyboard pada Pressable, font scale sistem dan pixel diff native membutuhkan emulator/simulator atau perangkat nyata. React Native versi ini membatasi fokus imperatif pada view non-input melalui flag internal. Host dapat memakai `onAfterDismiss` untuk fokus native. Alur Maestro berada di [.maestro/native-parallel/shared-ui](../../../.maestro/native-parallel/shared-ui/), termasuk jalur tablet terpisah. Checkout Linux yang menjalankan capture web tidak menyediakan adb, /dev/kvm, xcrun atau Maestro. CI native pusat memiliki galeri sendiri. Belum ada item yang mendapat kredit paritas piksel Android+iOS.
