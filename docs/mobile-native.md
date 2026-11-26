# Roadmap mobile native Expo dan Next.js

Status: **prototipe lokal dan rencana, belum menjadi kontrak runtime atau rilis**. Next.js tetap melayani web dan backend; aplikasi Expo React Native yang diusulkan adalah klien tambahan dalam repositori yang sama. Migrasi dilakukan bertahap dan Capacitor tetap menjadi jalur mobile sampai setiap alur penggantinya lolos verifikasi dan keputusan rilis dibuat. Status deployment dan perilaku aktif tetap mengikuti [arsitektur](ARCHITECTURE.md), [fitur](features.md), dan [prosedur rilis](DEPLOYMENT.md).

## Kondisi yang ada

- `apps/mobile` adalah Capacitor 7 alpha yang memuat origin Next.js jarak jauh dalam WebView. Konfigurasi memisahkan aplikasi dan origin nightly/staging dan stable/production. `www/index.html` menguji koneksi lalu membuka aplikasi online. Saat offline, Android menampilkan pustaka dan reader lokal. iOS menyediakan tampilan coba lagi. Paket bacaan mengikat akun, origin, bahasa, masa akses, dan hak bab. Klien Expo perlu menggunakan [kontrak sinkronisasi yang sudah ada](operations/offline-data-sync.md).
- Bridge dan kode `lib/native/` mencakup notifikasi push dan pengingat lokal, kamera dan pemulihan hasil kamera, share dan berkas, haptik, status jaringan dan lifecycle, refresh, deep link, serta pembaruan. Android memiliki plugin `ZyxGoogleAuth`, `ZyxOfflineStore`, dan `ZyxAppUpdater`. Reader offline menyimpan bacaan berdasarkan akun dan dibersihkan saat keluar atau berganti akun. Kehadiran kode dan dependensi bukan bukti konfigurasi atau keberhasilan perangkat di lingkungan yang berjalan.
- Android App Links memerlukan fingerprint penandatangan yang cocok; Universal Links iOS memerlukan Apple team ID. Login Android menggunakan Credential Manager saat tersedia dengan fallback browser; iOS menggunakan browser. Akun tersimpan, izin, dan cache perlu dipertahankan perilakunya. Rincian serta batas verifikasi ada di [README mobile](../apps/mobile/README.md).
- UI web memakai DOM, CSS, Radix dan komponen Next.js. Komponen tersebut tidak otomatis menjadi komponen React Native. Logika domain murni, skema dan token dapat dibagi setelah memisahkan dependensi server dan browser; rendering dan interaksi native perlu implementasi sendiri.
- `apps/mobile-native` adalah scaffold Expo lokal untuk galeri separator dengan fixture `packages/ui-parity` dan alat perbandingan `scripts/native-parity`. Ini belum menjadi klien LMS, dan keberadaan fixture tidak membuktikan paritas piksel atau perilaku perangkat. Petunjuk menjalankan ada di [README prototipe](../apps/mobile-native/README.md).
- Root memakai Bun dan saat ini tidak mendeklarasikan workspace; scaffold memiliki lockfile npm sendiri. Penambahan workspace bersama merupakan keputusan lanjutan. [Expo mendukung monorepo Bun](https://docs.expo.dev/guides/monorepos/), tetapi versi dan resolusi modul native harus diuji bersama.

## Urutan dan gerbang paritas

1. Bangun inventaris komponen web dan token dari `app/globals.css` dan `components/ui/`. Buat padanan native terisolasi dan galeri untuk pemeriksaan. **Setiap komponen memiliki tiga kasus yang diperiksa satu per satu** terhadap referensi web dengan viewport, skala, font, tema dan state yang ditentukan. Kasus awal separator adalah horizontal light, vertikal light, dan horizontal dark. Catat ukuran, warna, posisi dan hasil perbandingan piksel untuk tiap kasus; perbedaan font rasterization, density dan platform perlu dicatat, bukan diam-diam dianggap identik. Lanjut hanya setelah ketiganya memenuhi paritas piksel yang diminta dan interaksinya terverifikasi bila ada.
2. Susun layout dari komponen yang lolos, lalu komposit: dialog, grid, tabel, kalender, list, navbar, dan bottom navigation. Terapkan tiga kasus serta pemeriksaan fokus, pembaca layar, sentuhan, ukuran teks, safe area, Back, state kosong dan konten panjang sesuai relevansi. Jangan menandai komposit selesai hanya karena komponen penyusunnya lolos.
3. Susun halaman dari komposit yang lolos dan verifikasi alur serta state terhadap web. Setelah itu kerjakan renderer artikel dan diktat, termasuk formula, gambar, tabel, visual dan konten interaktif, hak akses, bacaan tersimpan dan pemulihan offline. Komponen, layout, komposit, halaman dan renderer memiliki bukti serta gerbang masing-masing; belum ada klaim paritas penuh atau rilis hanya karena scaffold tersedia.

Untuk setiap tahap simpan sumber referensi, versi/commit, perangkat atau emulator, dimensi dalam piksel dan density, tema, tiga kasus, screenshot, hasil perbandingan, selisih yang diketahui, dan keputusan lulus/gagal. Jalankan juga pada Android dan iOS nyata sebelum rilis. Paritas gambar tidak menggantikan pengujian perilaku, aksesibilitas, keamanan, atau data.

## Checklist inventaris dan urutan migrasi

Urutan ini adalah backlog, bukan bukti implementasi atau paritas. Setiap kotak mencakup **masing-masing** komponen yang disebut, dengan tiga kasus pada barisnya sebagai titik awal, bukan batas pengujian. Referensi adalah penggunaan web atau fixture lokal yang ditemukan, bukan jaminan komponen cocok dipindahkan langsung. P0 mendahulukan alur bersama dan pembelajaran, P1 mencakup kontrol dan peran lain, P2 mencakup permukaan khusus. Untuk setiap kasus tetapkan dimensi, density, font dan tema, lalu ikuti gerbang di atas. Nama berkas tanpa direktori pada tabel pertama berada di `components/ui/`.

### 1. Primitif, P0 lalu P1

| Prioritas | Checklist dan referensi | Tiga kasus per komponen |
|---|---|---|
| P0 | [x] `separator` dekoratif, [artefak Android dan iOS](https://github.com/soezyxstt/zyxacademy/actions/runs/45784124155) | Horizontal light; vertikal light; horizontal dark. |
| P0 | [ ] `button`, `components/pull-to-refresh.tsx` | Default aktif; disabled; ikon dengan nama aksesibel. |
| P0 | [ ] `input`, `textarea`, `label`, `components/forms/form-presets.tsx` | Kosong; berisi teks panjang; disabled. |
| P0 | [ ] `checkbox`, `switch`, `components/forms/admin-forms-builder.tsx` | Tidak dipilih; dipilih; disabled. |
| P0 | [ ] `radio-group`, `app/(student)/courses/[id]/flashcard/flashcard-client.tsx` | Belum dipilih; satu opsi dipilih; disabled. |
| P0 | [ ] `select`, `components/student-leaderboard-controls.tsx` | Tertutup tanpa pilihan; terbuka; pilihan panjang terpilih. |
| P0 | [ ] `badge`, `components/course/dashboard-weak-concepts.tsx` | Default; sekunder; teks panjang. |
| P0 | [ ] `avatar`, `components/auth/sidebar-account-menu.tsx` | Gambar tersedia; gambar gagal dengan fallback; inisial panjang. |
| P0 | [ ] `skeleton`, `components/course/quiz-player.tsx` | Baris pendek; blok multiline; dark dengan reduced motion. |
| P0 | [ ] `card`, `components/admin/bundle-importer-tab.tsx` | Default; varian alternatif; konten panjang. |
| P0 | [ ] `alert`, `features/admin-home/ui/mobile/admin-home-mobile.tsx` | Default; destructive; deskripsi panjang. |
| P0 | [ ] `formatted-date`, `components/student-reflections-view.tsx` | Tanggal valid Indonesia; tanggal valid Inggris; tanggal tidak valid. |
| P1 | [ ] `slider`, `components/course/interactive-scene-renderer.tsx` | Nilai minimum; tengah; maksimum. |
| P1 | [ ] `toggle-group`, `components/landing/landing-subject-showcase.tsx` | Tanpa pilihan; satu pilihan aktif; kontrol disabled. |
| P1 | [ ] `clamped-marquee`, `components/admin/material-review-detail.tsx` | Teks muat; teks melampaui lebar; reduced motion saat aktif. |
| P1 | [ ] `section-heading`, `components/landing/landing-pricing-preview.tsx` | Tier hero; tier primary; tier secondary dengan judul panjang. |
| P1 | [ ] `feature-card`, `step-card`, definisi lokal `components/ui/` | Default; varian dark atau active sesuai komponen; konten panjang. Belum ditemukan pemakaian aplikasi langsung saat inventaris ini. |

### 2. Layout dan komposit, setelah primitif terkait

| Prioritas | Checklist dan referensi | Tiga kasus per komponen atau pola |
|---|---|---|
| P0 | [ ] `form-field-wrapper`, `input-field`, `select-field`, `checkbox-field`, `components/ui/file-upload-field.tsx` dan `app/(marketing)/forms-playground/page.tsx` | Default; nilai terisi atau dipilih; error validasi. |
| P0 | [ ] `search-bar`, `components/course/material-viewer.tsx` | Kosong; query berisi; hasil kosong dengan query tetap terlihat. |
| P0 | [ ] `dialog`, `sheet`, `components/course/material-viewer.tsx` dan `components/command-menu-dialog.tsx` | Tertutup; terbuka dengan konten panjang; tutup dengan Back dan fokus kembali. Sertakan perilaku `dialog-history-runtime` dari `app/layout.tsx`. |
| P0 | [ ] `popover`, `dropdown-menu`, `tooltip`, `components/student-leaderboard-controls.tsx` dan `components/student-sidebar.tsx` | Tertutup; terbuka dengan pilihan panjang; dismiss dan fokus kembali. Tooltip substantif memerlukan padanan yang dapat disentuh. |
| P0 | [ ] `tabs`, `components/student-leaderboard-controls.tsx` | Tab pertama aktif; tab lain aktif; overflow dengan tab aktif. Sertakan style bersama `tab-styles`. |
| P0 | [ ] `collapsible`, `accordion`, `components/sidebar-shell.tsx` dan `components/landing/landing-faq.tsx` | Tertutup; terbuka; konten panjang terbuka. |
| P0 | [ ] `table`, `components/tutor/watchlist-table.tsx` | Kosong; satu baris; banyak baris dengan label panjang. Periksa susunan mobile dan pagination. |
| P0 | [ ] `toast` dan `sonner`, `components/app-toaster.tsx` dan `components/language-menu.tsx` | Sukses; error dengan pemulihan; beberapa notifikasi berurutan. `toast` mengekspor ulang `sonner`, bukan sistem terpisah. |
| P0 | [ ] Shell dan header, `components/application-shell.tsx`, `components/page-header.tsx`, `components/navigation/desktop-sidebar-shell.tsx` | Halaman biasa; header dengan aksi atau Back; teks panjang dan safe area. Periksa `page-transition`, `reveal`, dan `page-ornaments` pada normal, reduced motion, dan dark. |
| P0 | [ ] Navbar dan bottom navigation, `components/mobile-navbar.tsx` dan `components/navigation/{student,tutor,admin}/` | Rute utama aktif; rute kursus aktif; alur yang menyembunyikan bottom navigation. Uji ketiga peran, Back, tautan langsung dan safe area. |
| P0 | [ ] State bersama, `components/admin/state-panels.tsx` | Kosong; error dengan retry; pesan panjang. |
| P0 | [ ] Statistik, `components/admin/stat-card.tsx` | Nilai nol; nilai terisi; label dan caption panjang. |
| P0 | [ ] Tabel admin, `components/admin/table.tsx` | Tanpa baris; satu baris; banyak baris dengan label panjang. |
| P0 | [ ] Badge status, `components/admin/status-badges.tsx` | Status normal; status peringatan; status error. |
| P0 | [ ] Konfirmasi, `components/admin/confirm-dialog.tsx` | Tertutup; terbuka; aksi sedang diproses atau disabled. |
| P1 | [ ] `file-upload-field`, `app/(marketing)/forms-playground/page.tsx` | Kosong; unggahan berjalan; gagal dan coba lagi. Pertahankan batas berkas. |
| P1 | [ ] `scientific-input`, `features/student-assessment/ui/shared/quiz-player-parts.tsx` | Kosong; formula valid dengan palet; input tidak valid atau disabled. |
| P1 | [ ] Kalender, `components/schedule/schedule-calendar-view.tsx` | Tidak ada slot; slot tersedia; slot dipilih atau detail terbuka. |
| P1 | [ ] Composer diskusi, `components/discussions/composer.tsx` dan `components/course/zyra-composer-input.tsx` | Draft kosong; teks dan lampiran; unggahan gagal dengan pemulihan. Pertahankan seleksi, IME dan identitas retry. |
| P2 | [ ] `carousel`, definisi `components/ui/carousel.tsx` | Item pertama; item tengah; item terakhir. Belum ditemukan pemakaian aplikasi langsung saat inventaris ini. |

### 3. Halaman, setelah komposit terkait

- [ ] P0, identitas dan shell: login, sesi kedaluwarsa, serta logout atau ganti akun. Acuan `components/auth/` dan layout Student, Tutor, Admin. Uji pembatasan per peran dan callback lingkungan.
- [ ] P0, Student: dashboard, daftar kursus dan quiz. Untuk setiap halaman periksa data tersedia, kosong atau loading, dan error atau pemulihan; pada quiz sertakan progres, submit dan pemulihan draft.
- [ ] P1, Tutor: dashboard atau kursus, peserta dan jadwal. Untuk setiap halaman periksa data tersedia, kosong atau loading, dan error atau pemulihan; pertahankan cakupan kursus yang ditugaskan.
- [ ] P1, Admin: dashboard, pengguna dan kursus. Untuk setiap halaman periksa data tersedia, kosong atau loading, dan error atau pemulihan; pertahankan otorisasi dan konsekuensi aksi.
- [ ] P1, diskusi bersama peran: daftar kosong, thread aktif, serta pengiriman gagal atau status tidak pasti. Acuan `components/discussions/discussion-workspace.tsx`; uji audiens, akses dan retry.
- [ ] P2, marketing dan publik: halaman publik, formulir dan blog. Untuk setiap halaman periksa konten tersedia, loading atau kosong, dan error atau tautan tidak tersedia.

### 4. Renderer kompleks, terakhir

- [ ] Artikel dan diktat: teks dan formula; gambar, tabel dan visual interaktif; akses dibatasi atau bacaan offline yang kedaluwarsa. Acuan `components/course/structured-article-reader.tsx`, `markdown-renderer.tsx`, `article-parts.tsx` dan `components/offline/offline-reading-library.tsx`.
- [ ] Visual dan coding: grafik atau diagram normal; interaksi dan input; kegagalan atau fallback yang dapat diakses. Acuan `components/course/markdown/`, `interactive-scene-renderer.tsx` dan `components/coding/`.

## Batas data, identitas dan MCP

- SSR dan hidrasi tetap berjalan pada alur web Next.js. Layar React Native merender data terstruktur dari API HTTPS. Expo mengakses operasi yang sah melalui API HTTPS Next.js dengan kontrak tervalidasi dan otorisasi server per permintaan. Server Actions, RSC, cookie browser dan akses langsung database tidak diasumsikan bekerja sebagai API native. Tambah Route Handler khusus hanya jika diperlukan, dengan validasi, batas respons dan uji kontrak. [Route Handler adalah endpoint publik](https://nextjs.org/docs/app/guides/backend-for-frontend), sehingga tetap perlu autentikasi dan otorisasi.
- Pertahankan Better Auth, RBAC, akun tersimpan dan isolasi sesi. Evaluasi integrasi resmi [Better Auth untuk Expo](https://better-auth.com/docs/integrations/expo), penyimpanan sesi di SecureStore, browser sistem, PKCE dan callback yang dibatasi per lingkungan. Verifikasi login, batal, expiry, logout, pergantian akun dan deep link pada perangkat, termasuk kompatibilitas sesi Capacitor yang sudah terpasang. Expo Go tidak cukup untuk menguji redirect OAuth dengan scheme aplikasi; gunakan [development build](https://docs.expo.dev/guides/authentication/). Jangan menyimpan secret provider dalam aplikasi.
- Gunakan kontrak POST dan stream Zyra di `app/api/zyra/chat/route.ts` serta parser `lib/zyra/stream-consumer.ts` sebagai acuan, termasuk `requestId`, pembatalan, `text-replace`, error dan `[DONE]`. Evaluasi Expo Fetch untuk pembacaan inkremental terautentikasi dan uji pada perangkat Android dan iOS sebelum mengandalkannya.
- Ikuti `lib/offline/sync-contract.ts`, `lib/offline/sync-client.ts` dan `docs/operations/offline-data-sync.md` untuk identitas akun, origin dan bahasa, lease akses, cursor, manifest serta penggantian paket lengkap. Stream hanya memberi petunjuk; sinkronisasi memulihkan perubahan yang terlewat. Verifikasi penghapusan akses dan isolasi saat logout atau ganti akun.
- Pertahankan PostgreSQL sebagai sumber kebenaran server, bucket privat dan URL terotorisasi; penyimpanan lokal hanyalah cache atau data offline yang dibatasi akun, bukan replika database otoritatif. Rancang kedaluwarsa, penghapusan saat logout/switch, batas ukuran, migrasi, konflik dan hak akses ulang. Jangan mengantre mutasi offline tanpa kontrak idempotensi dan pemulihan yang eksplisit.
- Migrasi tampilan saja tidak menambah tool MCP. Per perubahan alur, periksa [katalog operasi](operations/admin-mcp.md), tool, scope, consent, discovery, playbook, skill terkemas, host prompt, klien dan binding lingkungan; perbarui kontrak serta pemeriksaan terkait bila kapabilitas atau semantik berubah. Pertahankan operasi yang khusus UI dalam katalog cakupan. Perubahan lokal tidak berarti paket MCP dipublikasikan atau server dideploy.

## Pilihan library per tahap

Scaffold saat ini memakai Expo SDK 58, React Native 0.88 dan React 19.3. Galeri dibuka melalui `index.ts` dengan `registerRootComponent`, dan separator memakai komponen inti React Native. Hermes mengikuti default Expo karena `app.json` tidak mengatur `jsEngine`. React Compiler dan WebView Expo DOM tercatat sebagai dependensi transitif, sementara galeri belum mengaktifkan compiler atau memakai `'use dom'`. Opsi lain di bawah belum menjadi dependensi langsung atau layanan aktif. [Manifest](../apps/mobile-native/package.json), [lockfile](../apps/mobile-native/package-lock.json), [konfigurasi Expo](../apps/mobile-native/app.json), [panduan Hermes](https://docs.expo.dev/guides/using-hermes/).

| Tahap | Pilihan | Kapan dipakai dan apa yang perlu diuji |
|---|---|---|
| Galeri | Hermes sebagai default | Pertahankan engine bawaan dan ukur waktu buka serta memori pada build rilis. Perubahan versi Hermes memerlukan pemeriksaan kompatibilitas bytecode dengan runtime pembaruan. [Panduan Hermes](https://docs.expo.dev/guides/using-hermes/). |
| Galeri | Uniwind sebagai kandidat styling | Mulai dengan style React Native dan token fixture. Coba Uniwind versi gratis (MIT) bila kelas Tailwind membantu pemetaan token lintas komponen. Verifikasi konfigurasi Metro, cakupan kelas, tema, font dan ukuran pada kedua platform. Uniwind Pro menambah biaya lisensi dan lapisan native. [Kelas Uniwind](https://docs.uniwind.dev/class-names), [versi gratis dan Pro](https://docs.uniwind.dev/pro-version). |
| Komposit | Expo UI untuk kontrol native tertentu | Coba `@expo/ui` untuk kontrol seperti pemilih atau switch saat perilaku sistem diperlukan. Gunakan API Universal bila sesuai. SwiftUI dan Jetpack Compose bisa menghasilkan tampilan berbeda, jadi periksa paritas, fokus dan pembaca layar pada tiap platform. [Expo UI SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/ui/). |
| Komposit | React Native Reusables untuk komponen bergaya Zyx | Evaluasi satu komponen yang dapat disalin dan dirawat di repo, misalnya dialog. Pilih satu jalur styling sesuai hasil evaluasi Uniwind. Audit dependensi komponen, slot, state, fokus, dan tema. Lisensi MIT mencakup kode library, dengan biaya pemeliharaan atas salinan lokal. [React Native Reusables](https://github.com/founded-labs/react-native-reusables). |
| Komposit | Reanimated untuk gestur dan animasi kompleks | Mulai dengan animasi bawaan untuk transisi sederhana. Tambahkan Reanimated beserta Worklets saat interaksi seperti swipe atau sheet memerlukannya. Cocokkan versi dengan SDK dan uji gestur, frame serta preferensi reduced motion. [Reanimated SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/reanimated/). |
| Halaman | Expo Router untuk navigasi | Pilihan utama saat klien memerlukan beberapa layar dan tautan langsung. Migrasi entry galeri ketika menambah struktur rute. Uji Back, deep link saat aplikasi tertutup atau terbuka, serta pemulihan rute setelah login. Otorisasi tetap diperiksa di API. [Expo Router](https://docs.expo.dev/router/introduction/), [instalasi pada proyek yang ada](https://docs.expo.dev/router/installation/). |
| Halaman | React Compiler sebagai optimasi opt-in | Ukur render pada halaman yang representatif, lalu coba memoization otomatis pada cakupan kecil. Periksa Rules of React, perilaku dan hasil profil sebelum memperluas cakupan. [React Compiler di Expo](https://docs.expo.dev/guides/react-compiler/), [adopsi bertahap](https://react.dev/learn/react-compiler/incremental-adoption). |
| Halaman | Legend List untuk daftar besar | Gunakan `FlatList` sebagai baseline. Coba Legend List pada daftar dengan tinggi baris dinamis atau pagination dua arah jika hasil ukur menunjukkan kendala. Bandingkan frame, memori, posisi scroll dan state baris saat daur ulang item. [Legend List](https://github.com/LegendApp/legend-list). |
| Renderer | Skia untuk visual 2D khusus | Evaluasi untuk grafik atau visual interaktif yang memerlukan canvas. Ukur biaya ukuran binary, memori dan GPU. Sediakan teks dan kontrol yang dapat diakses untuk informasi atau interaksi dalam canvas. [Skia SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/skia/). |
| Renderer | Expo DOM sebagai jembatan per komponen | Coba `'use dom'` untuk bagian artikel atau diktat yang membutuhkan renderer HTML, formula atau visual web yang sudah ada. WebView memiliki konteks JavaScript tersendiri dan komunikasi asinkron. Pilih data yang boleh diteruskan dari native, lalu uji startup, aksesibilitas, navigasi, offline dan pembersihan cache menurut akun. [Expo DOM](https://docs.expo.dev/guides/dom-components/). |
| Rilis | Observabilitas dengan satu layanan terlebih dahulu | Mulai dengan pengukuran lokal pada build internal. Evaluasi Sentry untuk pelaporan error dan crash atau Expo Observe untuk metrik startup dan navigasi. Pelaporan error Expo Observe masih preview. Tetapkan sampling, retensi dan penyaringan token, identitas serta isi materi sebelum mengirim data. Uji pelaporan crash, source map dan simbol native per rilis. Kedua layanan memiliki kuota gratis dan biaya sesuai paket atau pemakaian. [Sentry di Expo](https://docs.expo.dev/guides/using-sentry/), [harga Sentry](https://sentry.io/pricing/), [crash Expo Observe](https://docs.expo.dev/eas/observe/errors/), [kuota Expo Observe](https://docs.expo.dev/eas/observe/introduction/). |
| Rilis | Expo Updates sebagai pilihan OTA | Evaluasi `expo-updates` setelah build internal stabil untuk kode JavaScript dan aset yang kompatibel dengan runtime. Uji channel terpisah, `runtimeVersion`, rollout bertahap dan rollback sebelum distribusi. Kuota EAS Update mencakup pengguna aktif bulanan yang mengunduh update, bandwidth, dan penyimpanan. Server sendiri memerlukan implementasi protokol dan pemeliharaan. Perubahan modul native atau Hermes tetap memerlukan binary baru. [Expo Updates SDK 58](https://docs.expo.dev/versions/v58.0.0/sdk/updates/), [rollout dan rollback](https://docs.expo.dev/eas-update/deployment/), [kuota Expo](https://expo.dev/pricing). |

Evaluasi satu perubahan pada satu waktu di Android dan iOS. Untuk setiap kandidat, catat versi yang cocok dengan SDK, hasil paritas atau profil, biaya pengembangan dan operasional, serta pilihan kembali ke baseline. Untuk modul native, ukur juga perubahan ukuran unduhan pada build rilis.

## Performa, perangkat dan rilis

- Ukur cold/warm start, waktu interaktif, frame drop saat scroll, memori, ukuran unduhan dan jumlah request pada perangkat kelas rendah serta koneksi lambat sebelum memilih target dan optimasi. Gunakan navigasi native, pemuatan bertahap, daftar tervirtualisasi, thumbnail dan pagination. [FlatList](https://reactnative.dev/docs/optimizing-flatlist-configuration) memiliki kompromi memori, respons dan area kosong yang perlu diukur pada data sebenarnya.
- Pertahankan kunci TanStack Query yang terikat akun, kebijakan freshness dan invalidasi sesuai [kontrak fetching](data-fetching.md). Pertimbangkan `expo-image` untuk cache memori/disk dan prefetch terbatas, tetapi tentukan perlakuan gambar privat, URL kedaluwarsa, kuota dan pembersihan lintas akun sebelum mengaktifkan cache persisten. SecureStore untuk kredensial kecil, bukan konten besar. SQLite atau filesystem dapat dievaluasi untuk bacaan offline dengan kontrol privasi dan migrasi; tidak menggantikan PostgreSQL server.
- Untuk suara materi, evaluasi pemutaran, interupsi audio dan pilihan keluaran dengan [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/). Minta izin mikrofon saat pengguna memilih merekam.
- Petakan dan uji fitur satu per satu: push FCM/APNs, izin dan token perangkat, pengingat lokal, kamera dan pemulihan, share/file, haptik, konektivitas, refresh, link, safe area, browser login, pembaruan serta offline. Pilih modul Expo atau modul native kustom sesuai kebutuhan, dan rencanakan migrasi token serta kompatibilitas perangkat lama. Ketersediaan modul bukan bukti paritas.
- Pisahkan konfigurasi, identifier, signing, origin, kredensial push dan callback nightly/staging dari stable/production. Pertahankan rollback ke Capacitor dan rencana migrasi instalasi, deep link dan sesi sebelum mengganti aplikasi rilis. Uji pembaruan dan instalasi nyata di kedua platform, termasuk jalur store untuk binary baru.

Dokumen ini hanya mencatat rencana dan inventaris lokal. Build, pengujian perangkat, perubahan layanan, penerbitan paket, staging dan production belum dibuktikan oleh dokumen ini.
