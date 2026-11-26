# Bukti shared-ui

Entry `SharedUiCase({ id })` menjalankan 52 fixture deterministik dalam 17 kelompok. Tiga kelompok layout memakai `FirstSliceExample` dan punya satu kasus lebar tambahan untuk daftar. Kontrak props, ID aksi, dan contoh konsumsi ada di [README](../../../apps/mobile-native/features/shared-ui/README.md) dan [CONTRACTS](../../../apps/mobile-native/features/shared-ui/CONTRACTS.md). Pemetaan pemanggil Student, Tutor, dan Admin beserta batas otorisasinya ada di [inventaris sumber](INVENTORY.md).

## Entry integrasi dan reproduksi

Sejak commit integrator `68931f55`, kedua entry host dapat membuka semua 52 kasus. Deep link utama adalah `zyx-native-parity://internal/shared-ui/<caseId>`. Host juga menerima alias `zyx-native-parity://shared-ui/<caseId>`. Contoh untuk menguji retry adalah `zyx-native-parity://internal/shared-ui/shared-ui-list-error-light`. Host memvalidasi ID terhadap `sharedUiCases`, mengembalikan ID asing ke galeri, dan memuat `SharedUiCase` setelah font dan SafeAreaProvider siap. Halaman produk mengikat callback ke router serta adapter domain masing-masing.

Dari checkout bersih, pasang dependensi dan jalankan host. Pada emulator/simulator, gunakan binary yang dibangun dari SHA uji yang sama untuk menjalankan Maestro. [Perintah capture, pemeriksaan geometri, serta diff perangkat](../../../tests/visual/native-parallel/shared-ui/device/README.md)

```sh
bun install --frozen-lockfile
npm ci --prefix apps/mobile-native
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
| NativeCompactShell | Back dokumen, judul panjang, slot atas/bawah | ApplicationShell, ApplicationPage, MobileTopNavbar dan daftar dokumen Student. Slot memakai callback lokal. Inset Android tercatat pada artefak perangkat di bawah. |
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

## Hasil GitHub Actions pada emulator dan simulator

| Eksekusi | Interaksi dan ukuran teks | Capture dan diff |
| --- | --- | --- |
| Android pertama, `3af97f85` | 8 dari 12 alur interaksi lulus, termasuk grid/tabel tablet. Empat alur menemukan galeri alih-alih tujuan deep link. Alur Maestro nama kontrol pada ukuran teks besar lulus. Pemeriksaan pemulihan pengaturan ukuran teks gagal. | Bukti awal mencakup log, JUnit, dan tangkapan layar diagnostik. [Run 45805093064](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064) · [Artefak Android 15110262845](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064/artifacts/15110262845) |
| iOS pertama, `3af97f85` | Dialog sistem `Open in “Zyx Academy Native”?` menahan deep link di iPhone. | Capture terhalang di tahap persiapan fixture. [Run 45805093064](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064) · [Artefak iOS 15116065483](https://github.com/soezyxstt/zyxacademy/actions/runs/45805093064/artifacts/15116065483) |
| Android kedua, `3f7c3b6c` | Alur grid/tabel tablet dan daftar lebar lulus. Transport emulator terputus pada 10 alur ponsel. Alur ukuran teks besar beserta pemeriksaan pemulihan pengaturan lulus (`accessibilityExit: 0`). | Semua 52 referensi web tersedia. Sebanyak 46 capture native lolos verifikasi geometri dan berstatus `different`. Enam capture ponsel berstatus `invalid` karena transport emulator terputus. Terdapat 0 `match`. [Run 45809686564](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564) · [Artefak Android 15115345846](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564/artifacts/15115345846) |
| Android ketiga, `0df02760` | 11 dari 12 alur interaksi lulus. Pada alur yang gagal, tombol Simpan memang nonaktif dan tercatat di hierarki dengan nama `Simpan, busy`. Pemeriksaan ukuran teks besar lulus. | Semua 52 capture native lolos verifikasi geometri. Seluruhnya berstatus `different`, dengan 0 `match`. [Run 45816593879](https://github.com/soezyxstt/zyxacademy/actions/runs/45816593879) · [Artefak Android 15117921833](https://github.com/soezyxstt/zyxacademy/actions/runs/45816593879/artifacts/15117921833) |

Pada run kedua, grup ponsel menghasilkan 43 dari 49 capture pada 380 × 752 dp dan DPR 2. Grup tablet menghasilkan 2 dari 2 pada 768 × 792 dp dan DPR 2. Grup lebar menghasilkan 1 dari 1 pada 1024 × 784 dp dan DPR 1. Job iOS pada run kedua dibatalkan sebelum menghasilkan artefak. [Run 45809686564](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564)

Pada `shared-ui-pagination-pending`, pagination native masih menampilkan `2 / 5` dan memakai tombol panah, sedangkan pagination web menyembunyikan hitungan saat sibuk dan menampilkan tombol berlabel. Referensi web juga menyertakan filter peran dan status dari halaman Admin di sekeliling pagination. Ketiganya berkontribusi pada diff viewport. [PNG native, referensi web dan diff Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45809686564/artifacts/15115345846)

Pada Android run ketiga, tombol dialog tampil bertumpuk dan memenuhi lebar panel. Posisi popover saat pertama dibuka masih bervariasi 24 dp. [PNG native dan diagnostik](https://github.com/soezyxstt/zyxacademy/actions/runs/45816593879/artifacts/15117921833)

Perbaikan setelah run pertama menunggu galeri siap, memeriksa lebar konten fisik, dan menerima representasi numerik yang ekuivalen saat memverifikasi pemulihan ukuran teks. Sejak run ketiga, flow dan collector menangani dialog pembuka iOS dan menyimpan diagnostik preflight iPhone. Android mengulang kegagalan transport yang terdeteksi dengan batas percobaan dan menyimpan log tiap percobaan. Perbandingan tetap gagal pada perbedaan piksel mentah. [PR #517](https://github.com/soezyxstt/zyxacademy/pull/517)

Alur ukuran teks besar memeriksa label melalui Maestro. Pengujian TalkBack/VoiceOver langsung, IME, perpindahan fokus keyboard fisik, dan paritas piksel Android+iOS masih terbuka. React Native versi ini membatasi fokus imperatif pada view non-input melalui flag internal. Host dapat memakai `onAfterDismiss` untuk fokus native. [Alur Maestro](../../../.maestro/native-parallel/shared-ui/)

## Hasil verifikasi lokal

Pengujian bundle menggunakan base `840d3f303da55e4b93048c58eb3faea6b8b0a3c0`. Typecheck host dan tes komponen dijalankan kembali sesudah sinkronisasi base `e20b6456389f0352c4ef6a826786160e9b7dca6b`. Integrator dapat menjalankan fixture melalui galeri atau melalui deep link tanpa memasang launcher sementara.

| Pemeriksaan | Hasil pada checkout tugas |
| --- | --- |
| Referensi web dari komponen aplikasi | Chromium 154.0.8037.57 menghasilkan 52 PNG pada DPR 1 dan 52 pada DPR 3. Semua ID muncul sekali per density. Seluruh PNG berisi render dan ukurannya sesuai viewport × DPR. Seluruh capture lulus pemeriksaan overflow horizontal. [Manifest DPR 1](../../../tests/visual/native-parallel/shared-ui/references/dpr1/results.json) · [Manifest DPR 3](../../../tests/visual/native-parallel/shared-ui/references/dpr3/results.json) |
| Interaksi Playwright | 11 lulus. Meliputi validasi dialog dan pemulihan fokus lewat Escape, fokus sheet, judul aksesibel, edit dan hapus pencarian, retry dan reset daftar, pilihan tanggal/tab, nama panjang pada 380 px, pembesaran teks dan input sentuh. [Skenario](../../../tests/visual/native-parallel/shared-ui/interactions.ts) |
| Kontrak native | 9 tes model Bun dan 4 tes komponen dengan React test renderer lulus. TypeScript untuk seluruh ekspor shared-ui dan TypeScript serta ESLint harness referensi lulus. [Tes](../../../tests/native-parity/shared-ui/) |
| Collector perangkat | 10 tes Python lulus, mencakup penolakan frame kosong, identitas kasus keliru, metadata build yang hilang dan perbedaan geometri. [Tes collector](../../../tests/visual/native-parallel/shared-ui/device/) |
| Typecheck host penuh | `npm --prefix apps/mobile-native run typecheck` lulus setelah integrator menambahkan `revalidating` pada snapshot sesi awal di `390c8f59`. |
| CI native-contracts | Pada merge uji `8e8b074b` langkah TypeScript lulus, sedangkan langkah kontrak device/session/transport/offline gagal. Reproduksi lokal tanpa dependensi web menghasilkan 99 lulus dan satu kegagalan saat Bun mengimpor sintaks Flow `import typeof` milik React Native melalui `tests/unit/native-browser-login.test.ts`. Integrator dapat menjalankan tes tersebut dengan Bun sesudah `npm ci` di aplikasi dan mengisolasi binding platform untuk tes login. [Job CI](https://github.com/soezyxstt/zyxacademy/actions/runs/45803695549/job/139853233025) |

Ekspor Hermes untuk kedua platform berhasil pada host tersebut setelah pengujian lokal memakai `config.transformer.assetRegistryPath = require.resolve("react-native/asset-registry")` di konfigurasi Metro aplikasi. Pada instalasi npm terisolasi, Metro mencoba menyelesaikan modul itu dari luar root aplikasi ketika membundel `public/founders/adi.jpeg`. Integrator dapat mereproduksi dengan `npx --no-install expo export --platform all --clear` dari `apps/mobile-native` dan menetapkan resolusi registry dari root aplikasi. Penyesuaian Metro hanya digunakan saat eksperimen lokal. SHA-256 bundle Android adalah `c49812f4b07ca619b2b8c8c29564a9f2d2f2eaa759f328f9c91d82f746b96ca9`, dan iOS `16e6a6427fad9faf9f1208c9fd13966dfa066c150f1b89d4a18bd10d86b8b927`.

Collector memerlukan identitas kasus, geometri konten, density dan identitas build sebelum membuat diff. Untuk memverifikasi SHA PR terbaru, gunakan hasil dari 12 alur Maestro per OS dan 52 screenshot per OS pada geometri referensi yang diukur. [Langkah dan format bukti perangkat](../../../tests/visual/native-parallel/shared-ui/device/README.md)
