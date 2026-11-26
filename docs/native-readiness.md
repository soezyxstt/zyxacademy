# Audit kesiapan aplikasi Expo

**Baseline 26 November 2026. Sasaran 95% belum tercapai.** Audit membandingkan klien Expo dengan web Zyx pada commit `fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f`. Entry Expo membuka `ParityGallery` tanpa rute produk, sesi, atau klien data LMS. Aplikasi Capacitor memiliki jalur distribusi dan implementasi tersendiri. Bukti pengujian bersumber dari CI PR 511 pada commit tersebut. Perubahan lokal setelah commit ini memerlukan bukti baru. [PR 511](https://github.com/soezyxstt/zyxacademy/pull/511), [entry Expo](https://github.com/soezyxstt/zyxacademy/blob/fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f/apps/mobile-native/App.tsx), [aplikasi Capacitor](../apps/mobile/README.md).

| Sumbu | Cakupan pada baseline | Bukti Expo yang lulus | Ambang |
|---|---|---|---|
| Komponen | 668 modul UI TSX di luar halaman dan fixture. Satu modul dapat memuat beberapa komponen. 44 modul di `components/ui` termasuk di dalamnya. | 1/668 modul (0,15%) memiliki tiga kasus visual lulus di kedua platform. 0/668 memiliki bukti seluruh kontrak. | Minimal 635/668 modul pada baseline, dan minimal 95% komponen individual setelah semua ekspor dan komponen lokal dipetakan. |
| Halaman | 151 dari 168 pola rute awal masuk cakupan Expo. 17 pola publik tetap di browser. 59 rute `visual-fixtures` dicatat terpisah. | Baseline: 0/151 (0%). Galeri internal dapat dijalankan oleh CI. | Minimal 144/151 pola dengan navigasi, data dan state yang telah diverifikasi. |
| Fungsi backend yang dibutuhkan klien | 222 kandidat metode HTTP setelah pemilahan awal, 246 Server Actions, serta pembacaan langsung dari Server Components dan operasi dinamis. Inventaris fungsi produk masih terbuka. | 0 operasi terintegrasi dan teruji melalui Expo (0%). | Setelah pemetaan dan deduplikasi, minimal `ceil(0.95 × jumlah operasi produk relevan)`. |

Ketiga ambang berlaku sendiri-sendiri. Persentase komponen terhadap jumlah berkas hanya membantu menemukan celah. Modul dengan lima komponen baru mendapat kredit modul ketika kelimanya lulus. Sebelum keputusan akhir, buat entri per komponen dengan ID berkas dan simbol, termasuk komponen di halaman atau renderer, subkomponen, variasi aksesibel dan alias. Catat alasan untuk modul utilitas, ekspor ulang atau implementasi desktop yang dilayani oleh padanan mobile. Laporkan juga item belum dipetakan, sebab item tersebut masih masuk lingkup audit.

## Cakupan pengukuran saat ini

Inventaris sumber pada branch integrasi mencakup 168 pola halaman Next.js. Seluruh 145 pola produk memiliki tujuan Expo, terdiri dari 122 layar dan 23 alias. Sebanyak 18 pola publik dibuka di web, termasuk situs publik, formulir dan Meet. Dua halaman khusus browser menangani persetujuan OAuth dan pengaturan token push browser. Dua pola untuk pertukaran autentikasi dan satu alat verifikasi authoring melengkapi inventaris. Pembukaan aplikasi tanpa tautan menggunakan entry Expo. [Audit rute terpasang](../scripts/native-readiness/product/route-coverage.ts)

Target berikutnya adalah menyelesaikan semua tindakan pengguna di rute produk. Audit memisahkan tindakan yang telah tersambung di kode, pengujian terhadap backend, dan alur yang berhasil di Android. Jumlah rute terpasang belum mengukur persentase fungsionalitas. Penyempurnaan UI dilanjutkan setelah cakupan fungsi selesai. [Pemetaan tindakan Student bersesi](../packages/native-parity/student/evidence/signed-action-crosswalk.md) mencakup 50 pola Student dan tindakan yang dipakai bersama oleh shell.

## Bukti Android setelah baseline

Prioritas verifikasi harian adalah Android. Workflow `Native component parity` memakai Next.js di Android WebView pada emulator yang sama sebagai acuan utama galeri komponen, sesuai mesin web di Capacitor. Chromium dan selisih piksel eksak tersedia sebagai pembanding diagnostik Android. Opsi `include_ios` menambahkan pengukuran eksak iOS terhadap Chromium dan WKWebView. Alur produk iOS tetap menjalani smoke test navigasi.

Pada `1587768e8`, 20 alur interaksi Maestro lulus di Android, termasuk pemilihan tunggal dan jamak, kotak masuk, serta formulir. Ketiga kasus Separator cocok persis dengan kedua referensi Android. Pada Progress, keadaan penuh masih berbeda 28 piksel terhadap WebView. [Hasil perangkat Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45867381115/job/140074591471).

Pada `f2c2fb262`, checkout gabungan empat branch menjalankan alur login PKCE dengan identitas browser sintetis, akses dashboard Student, perubahan status baca milik penerima, pemeriksaan isolasi akun lain, dan pencabutan sesi terhadap handler Next.js serta PostgreSQL di runner. Pengujian itu berjalan pada tingkat protokol. [Kontrak sesi dan otorisasi](https://github.com/soezyxstt/zyxacademy/actions/runs/45867603711/job/140075317358).

### Selisih referensi Button dan Label di Android

Pada `ecf50dd0f`, perbandingan RGB tanpa resize pada DPR 1 menemukan selisih antara Chromium dan Android WebView pada 51 dari 54 crop komponen. Ketiga crop Separator identik. Kecocokan serentak pada kedua mesin memerlukan referensi yang identik. [Capture Android dan WebView](https://github.com/soezyxstt/zyxacademy/actions/runs/45870855525/artifacts/15144358376), [referensi Chromium](https://github.com/soezyxstt/zyxacademy/actions/runs/45870855525/artifacts/15143076949).

| Kasus | Expo ke WebView | Expo ke Chromium | WebView ke Chromium |
| --- | ---: | ---: | ---: |
| Button aktif terang | 379 | 510 | 546 |
| Button nonaktif gelap | 360 | 509 | 541 |
| Button ikon terang | 144 | 110 | 152 |
| Label kosong terang | 553 | 737 | 831 |
| Label panjang gelap | 2.004 | 3.094 | 3.350 |
| Label nonaktif terang | 1.272 | 1.463 | 1.654 |

Pada baris tengah isi tombol teks, warna tombol Expo membentang dari x=125 sampai x=195. Kedua referensi web berhenti di x=194. Tombol ikon memiliki lebar yang sama pada ketiga mesin. Shaping label `Simpan` pada 14 px menghasilkan advance 50,169 px untuk TTF Inter Medium native dan WOFF2 web pada bobot 500. Pengukuran intrinsik teks React Native Android memakai lebar layout dalam piksel fisik utuh. Mekanisme pembulatan ini konsisten dengan selisih lebar satu piksel yang teramati. [Kode pengukuran React Native 0.88.1](https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactAndroid/src/main/java/com/facebook/react/views/text/TextLayoutManager.kt).

Piksel label Button yang kontras mulai di y=44 pada Expo dan Chromium, serta y=43 pada WebView. Simulasi geser area teks ke atas satu piksel mengubah selisih crop teks Expo terhadap WebView dari 301 ke 222 dan dari 300 ke 219. Selisih terhadap Chromium naik dari 412 ke 471 dan dari 411 ke 464. Untuk tiga kasus Label, posisi saat ini menghasilkan selisih terkecil dari pergeseran vertikal bulat yang diuji, dari minus dua sampai plus dua piksel. Hasil ini mendukung mempertahankan pengukuran teks dan posisi label saat ini. Kasus Button dan Label masih terbuka pada gerbang piksel.

### Gerbang visual relatif Android WebView

Setiap kasus galeri memakai tiga bukti identitas: marker komponen, ukuran crop DPR 1 sesuai manifest, dan revisi ekspor Next.js yang sama dengan checkout. Android menunggu dua pengambilan crop berturut-turut yang stabil untuk Expo dan WebView. Setiap komponen membutuhkan ketiga kasus dengan pengukuran yang valid.

- SSIM luminans BT.709 dihitung pada jendela 7 × 7 dengan crop pada posisi asli. Rata-rata untuk seluruh frame dan untuk jendela yang menyentuh konten di salah satu gambar masing-masing harus mencapai 0,98. Pengukuran mempertahankan ukuran dan posisi piksel.
- Warna kanvas ditentukan dari warna paling sering di tepi crop. Area konten memakai selisih minimal 12 dari kanvas pada salah satu kanal RGB, minimal delapan piksel per crop, serta toleransi selisih area 20%. Batas konten pada tiap sisi boleh bergeser paling banyak 2 dp. Selisih kanvas maksimum 8 per kanal.
- Jika lingkungan 3 × 3 bersifat datar pada kedua gambar (rentang kanal maksimal 8), paling banyak delapan piksel dalam setiap jendela 7 × 7 boleh berbeda lebih dari 12 per kanal. Untuk kontur dengan rentang kanal minimal 32, gambar pembanding perlu memiliki 65% dari kontras lokal dalam radius satu piksel. Kedua arah diukur. Lebih dari delapan piksel kontur yang kehilangan pasangan dalam satu jendela 7 × 7 menggagalkan kasus.

Kalibrasi ulang terhadap run `ecf50dd0f` meluluskan 18 dari 54 kasus visual. Separator, Skeleton, Switch, Progress dan Slider meluluskan ketiganya. Button ikon lulus. Kedua Button teks mencapai SSIM di atas 0,98 pada frame penuh, tetapi area konten berada di bawah ambang. Frame kotak masuk tidak memiliki marker native yang dapat dipakai untuk kalibrasi. Kasus sintetis memeriksa toleransi antialiasing, crop kosong atau salah ukuran, hilangnya ikon kecil meski kedua SSIM tinggi, pergeseran geometri, warna dengan luminans serupa, dan hilangnya kontras.

Gerbang ini berlaku untuk galeri komponen Android. Pemeriksaan aksi pengguna, nama aksesibel, status, dan hasil operasi tetap memerlukan bukti tersendiri. Cakupan 95% mengikuti inventaris per komponen, halaman, dan operasi. Penerapan pada Shared UI dan halaman memerlukan crop Expo dan WebView pada perangkat yang sama, anchor konten per layar, serta verifikasi perilaku dan otorisasi sesuai peran. [Kebijakan ukuran](../scripts/native-parity/relative_policy.py), [perhitungan visual](../scripts/native-parity/relative_visual.py).

### Review independen atas 54 crop galeri Android

GPT-6.2 Sol High menilai 54 pasangan crop Expo dan Android WebView pada DPR 1 untuk sumber dan build `81f25dcdaba4be3ed9abb56d31413edb5d490dff`. Review visual meluluskan 50/54 kasus dan 16/18 komponen dengan ketiga kasus lulus. Tiga kasus kotak masuk gagal karena perbedaan ikon dan pembungkusan waktu relatif pada keadaan campuran. Teks Textarea nonaktif terang gagal karena warna `#ccc` di Expo dan `#999` di WebView. Pergeseran sekitar 3 px pada baseline teks tanggal masih diterima pada review ini. [Putusan per kasus](../packages/native-parity/evidence/android-webview-review-45877794715.json), [crop berpasangan](https://github.com/soezyxstt/zyxacademy/actions/runs/45877794715/artifacts/15147365402).

Gerbang relatif otomatis pada run yang sama meluluskan 18/54 kasus dan 5/18 komponen. Status CI tetap gagal. Bukti ini berlaku untuk crop galeri dalam run tersebut. Verifikasi berkas memeriksa SHA-256 manifest kasus, setiap pasangan crop, dan laporan mentah, serta mencocokkan revisi sumber dan build pada laporan. [Hasil CI](https://github.com/soezyxstt/zyxacademy/actions/runs/45877794715), [pengukuran mentah](https://github.com/soezyxstt/zyxacademy/actions/runs/45877794715/artifacts/15147360525).

```sh
gh run download 45877794715 -n android-parity -n android-measurements -D /tmp/zyx-review-45877794715
python3 scripts/native-parity/verify-android-webview-review.py \
  packages/native-parity/evidence/android-webview-review-45877794715.json \
  /tmp/zyx-review-45877794715/android-parity \
  /tmp/zyx-review-45877794715/android-measurements
```

Pada `81b9cd096`, review independen meluluskan seluruh 51 pasangan Expo dan Android WebView yang stabil, termasuk ketiga keadaan kotak masuk setelah perbaikan ikon dan waktu relatif. Sebanyak 17 dari 18 komponen memiliki tiga kasus yang lulus review. Ketiga kasus Textarea belum memiliki pasangan stabil. Gerbang otomatis meluluskan 18 dari 54 target dan lima komponen. Maestro meluluskan 17 alur interaksi. [Review per SHA dan provenance](../packages/native-parity/evidence/android-webview-review-45882580656.md)

Pada `83a0d6585`, reviewer Sol 6.2 high meluluskan **54/54 pasangan tampilan dan 18/18 komponen dasar Android**. Seluruh 51 pasangan dari review sebelumnya mempertahankan hash gambar yang sama. Tiga pasangan Textarea yang baru stabil menunjukkan posisi teks Expo sekitar 1 hingga 2 piksel lebih rendah dan penanda resize kecil pada acuan web. Maestro meluluskan 17/17 alur interaksi. Gerbang visual otomatis meluluskan 18/54 kasus dan 5/18 komponen. Pengukuran ini mencakup galeri komponen dasar. [Laporan per kasus](../packages/native-parity/evidence/android-webview-review-45885365744.md), [hasil CI](https://github.com/soezyxstt/zyxacademy/actions/runs/45885365744).

## Review integrasi 26 November 2026

Reviewer independen GPT-6.2 Sol High memeriksa revisi induk `be5e5e13`. Empat branch dapat digabung di checkout CI sementara. Generator memasang 153 entry kanonik dari inventaris eksternal: 50 halaman Student, 54 Academic, 36 Admin Operations dan 13 publik. Tipe Expo gabungan gagal pada implementasi formulir publik dan dua atribut pada baris daftar bersama. Angka 153 mengukur pemasangan rute di checkout tersebut. Gerbang halaman tetap membutuhkan navigasi, otorisasi dan data yang teruji melalui entry produk di perangkat. [Uji gabungan](https://github.com/soezyxstt/zyxacademy/actions/runs/45808986956).

| Sumbu | Temuan reviewer | Bukti berikutnya |
| --- | --- | --- |
| Komponen | Referensi Next untuk tiga kasus direktori tersedia. Android dan iOS dilewati setelah typecheck gagal. Satu modul separator mempunyai bukti visual historis pada tabel baseline. | Capture berpasangan, hasil piksel dan interaksi per komponen pada SHA yang sama. |
| Halaman | Review belum menambahkan kelulusan halaman. Ada celah pemeriksaan ulang akses kursus saat Back, pemisahan riwayat navigasi ketika berganti akun, dan sambungan shell serta renderer. | Uji dua akun dengan peran yang sama, pencabutan akses kursus dalam satu sesi, dan tiga keadaan halaman pada kedua platform. |
| Operasi backend | Review belum menambahkan operasi end-to-end terverifikasi. Sebagian adapter sudah memiliki tes terfokus. Inventaris operasi produk yang sudah dideduplikasi masih terbuka. | Tautkan setiap operasi dengan aksi pengguna, izin, efek server, identitas retry dan hasil pada klien. |

Penilaian 95% masih terbuka untuk ketiga sumbu. Hasil review ini berlaku pada SHA yang tercantum. Perbaikan berikutnya memerlukan bukti pada revisinya sendiri. [CI referensi dan perangkat](https://github.com/soezyxstt/zyxacademy/actions/runs/45808986811).

## Bukti visual pada commit baseline

Run 45784124155 membandingkan separator horizontal terang, vertikal terang dan horizontal gelap. Masing-masing mencatat 0 piksel berbeda pada emulator Android dan simulator iOS. Implementasi web juga menerima `decorative={false}`, sementara komponen Expo di commit tersebut selalu tersembunyi dari pembaca layar. Belum ada bukti semantik untuk varian itu atau pengujian perangkat fisik. Skeleton yang tersedia di working tree saat audit belum tercakup dalam run ini. [Hasil Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45784124155/job/139786898021), [hasil iOS](https://github.com/soezyxstt/zyxacademy/actions/runs/45784124155/job/139786897915), [kontrak Separator web](https://github.com/soezyxstt/zyxacademy/blob/fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f/components/ui/separator.tsx), [implementasi Expo saat diuji](https://github.com/soezyxstt/zyxacademy/blob/fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f/apps/mobile-native/components/Separator.tsx).

### Hasil pengujian gabungan berikutnya

Pada induk `a6c60e56`, CI memasang 153 rute dari empat jalur, meluluskan typecheck Expo dan menghasilkan bundle Android 6.960.978 byte serta iOS 6.957.402 byte. Job perangkat memakai salinan sumber yang cocok dengan Git tree hasil pemasangan. Pengujian tamu membuka `/murid`, `/tutor` dan `/admin` melalui tautan kanonik dan memeriksa tindakan masuk. Gerbang halaman juga membutuhkan sesi terautentikasi, operasi data dan tiga kasus visual. [Job integrasi](https://github.com/soezyxstt/zyxacademy/actions/runs/45812972858/job/139885305251).

Reviewer GPT-6.2 Sol High memeriksa artefak Android dan iOS pada `f4ed84dc`. Android menghasilkan tiga kecocokan piksel untuk Separator. Delapan kontrol lain yang diukur memiliki perbedaan. Tangkapan iOS tidak menghasilkan tiga area pembanding yang valid, sehingga tidak ada tambahan komponen yang lulus pada pasangan ini. Bukti historis Separator pada `fa3ce04e` tetap tercatat di baseline. [Artefak berpasangan](https://github.com/soezyxstt/zyxacademy/actions/runs/45796391363).

Reviewer juga memeriksa transport kotak masuk Student, pembatasan akun dan peran, serta pencabutan bacaan offline. Pada `ed469032`, penolakan eksplisit dari manifest, resource, dan aset mengunci kedua bahasa. Saat itu respons sukses sinkronisasi yang memuat `allowed: false` masih dapat menyisakan akses dalam bahasa lain. Verifikasi berikutnya perlu menguji respons ini pada dua bahasa dan dua kursus, serta menguji pergantian akun saat kotak masuk sedang dibuka. [Revisi offline yang diperiksa](https://github.com/soezyxstt/zyxacademy/commit/ed469032).

### Verifikasi integrasi rute dan sesi

Pada `14e95ce3`, empat jalur kembali dapat digabung dengan pemasangan 153 entry fisik. Typecheck dan bundling Expo Android serta iOS lulus. Pada build yang lebih awal, Android lulus pembukaan dingin `/admin` dan pengalihan ketiga peran ke login saat belum ada sesi. Pada iOS, pembukaan hangat ketiga rute telah lulus di build sebelumnya. Uji ini berakhir di layar login. [Build gabungan](https://github.com/soezyxstt/zyxacademy/actions/runs/45843783636/job/139992039618), [uji masuk Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45814669718/job/139892061323), [uji masuk iOS](https://github.com/soezyxstt/zyxacademy/actions/runs/45812142193).

Review lanjutan pada `aa006de8` memeriksa pencabutan lintas bahasa untuk respons `allowed: false`, hilangnya materi dari manifest lengkap, dan pengurangan hak sebagian bab. Pada `1e5f85ed`, tautan dari notifikasi push diperoleh dari baris kotak masuk pengguna yang terverifikasi. Hasil lama dibuang saat sesi berubah. Pengiriman push pada perangkat fisik dan sinkronisasi offline setelah aplikasi dibuka kembali masih memerlukan pengujian. [Pencabutan akses](https://github.com/soezyxstt/zyxacademy/commit/aa006de8), [pengalihan push](https://github.com/soezyxstt/zyxacademy/commit/1e5f85ed).

Pada jalur Shared UI `4805e7d1`, reviewer memeriksa 52 tangkapan Android dengan geometri yang valid. Seluruh 52 masih memiliki selisih piksel. Sebelas dari 12 alur interaksi lulus setelah retry, dan uji teks besar lulus. Percobaan tersisa kehilangan koneksi ADB sebelum memeriksa daftar pada layar lebar. Bukti ini belum menambah komponen yang lulus tiga keadaan di kedua platform. [Artefak Shared UI Android](https://github.com/soezyxstt/zyxacademy/actions/runs/45837732023/artifacts/15129611377).

Pada induk `c7fddf65`, kelima kelompok uji kontrak backend lulus pada gabungan empat jalur. Untuk kotak masuk, klien Expo memanggil handler Next.js melalui transport bersesi. Pengujian memeriksa dua akun terhadap database uji, termasuk isolasi riwayat dan efek menandai pesan sebagai dibaca. Kelompok lain menguji otorisasi dan cursor offline, pembelajaran dan sesi langsung Murid, jadwal dan tryout Academic, serta handler Admin. Alur masuk hingga layar produk pada perangkat dan penilaian per operasi masih berjalan. [Hasil lima kelompok](https://github.com/soezyxstt/zyxacademy/actions/runs/45846036130/job/140001017502).

## Inventaris per permukaan

| Permukaan web | Jumlah | Bukti yang diperlukan untuk lulus |
|---|---:|---|
| Komponen dalam `components/` | 467 | Tiga kasus per komponen dengan web pembanding, termasuk renderer artikel, formula, media atau interaksi jika relevan. |
| Komponen dalam `features/` | 31 | Kontrak yang digunakan fitur, termasuk bentuk desktop dan mobile, state dan perilaku yang relevan. |
| Modul UI lokal dalam `app/` selain halaman dan fixture | 170 | Termasuk 23 layout dan 78 tampilan loading. Periksa shell, navigasi, safe area, Back dan pemulihan. |
| Halaman Student | 50 | Dashboard, kursus dan materi, pembaca, kuis atau tryout, diskusi, jadwal, profil. Uji peserta berhak dan akses yang dicabut. |
| Halaman Tutor | 18 | Kursus yang ditugaskan, peserta, penilaian, jadwal dan diskusi. Uji penolakan pada kursus di luar penugasan. |
| Halaman Admin | 72 | Pengguna, kursus, konten, analitik, operasi dan aksi dengan konfirmasi. Uji otorisasi server, pengiriman berulang serta konsekuensi aksi. |
| Halaman marketing | 16 | Termasuk login, daftar, logout, blog, formulir, demo dan rute publik. |
| Halaman bersama dan rute lain | 12 | Termasuk dua rute handoff auth, dua halaman MCP, kompatibilitas Murid, preview authoring, formulir publik, meet, offline, tautan dan v4. |

Hitung satu pola dinamis sebagai satu halaman. Uji parameter yang valid, hilang dan ditolak melalui navigasi yang benar. Untuk halaman alias, rekam tujuan aktual dan Back. Untuk halaman yang dilayani browser sistem, rekam handoff, izin dan kembalinya pengguna ke Expo. Setiap halaman memerlukan keadaan berisi, kosong/loading dan error/pemulihan bila berlaku. Catat tema, bahasa, teks panjang dan penggunaan dengan teknologi bantu pada kontrol terkait. [Peta fitur](features.md), [urutan migrasi dan kasus per komponen](mobile-native.md).

## Batas hitung backend

Terdapat 179 modul `app/api/**/route.ts` dengan 247 pasangan metode dan pola rute. Pemilahan awal memisahkan 14 metode milik cron, queue internal, transport MCP, schema authoring atau callback layanan live, serta 11 metode dari delapan berkas yang mengembalikan respons authoring pensiun. Tersisa 222 kandidat untuk dicocokkan dengan alur produk. Pada `app`, `lib`, `components`, dan `features`, 47 modul berawalan `use server` mengekspor 245 fungsi. Satu tindakan inline tambahan adalah `disconnect` pada halaman koneksi MCP. Di luar `app/api` terdapat sembilan Route Handlers, termasuk App/Universal Links, metadata OAuth, runtime coding dan tautan pendek. Tinjau pemakaian masing-masing pada alur terkait.

Satu unit fungsi produk adalah satu operasi dengan input, hasil atau efek dan aturan otorisasi yang dapat diuji dari sebuah alur. Hubungkan ID operasi ke pemanggil web, peran, kontrak server dan pemanggil Expo. Satukan alias setelah efek dan batas izin dicocokkan. Pecah rute catch-all seperti Better Auth dan `/api/murid/[...path]` menurut operasi yang dipakai. Tambahkan pembacaan implisit dari Server Components. Contohnya, dashboard Admin melakukan query server, dashboard Tutor memanggil read model, dan dashboard Student menyatukan sesi, enrollment serta bagian yang dimuat menggunakan Suspense. Pemindahan query ke klien harus mempertahankan otorisasi di server. [Dashboard Admin](<../app/(admin)/admin/page.tsx>), [dashboard Tutor](<../app/(tutor)/tutor/page.tsx>), [dashboard Student](<../app/(student)/dashboard/page.tsx>).

Simpan operasi internal, pensiun, duplikat dan operasi khusus web beserta alasannya. Untuk fungsi asinkron, verifikasi aksi pengguna sampai hasil job, termasuk status, retry dan pemulihan. Bukti Expo untuk operasi aktif memerlukan panggilan terhadap kontrak server yang sama, respons sukses, penolakan izin, validasi dan pemulihan yang relevan. Uji identitas ulang untuk mutasi, pembatalan dan putus koneksi untuk stream, serta lease, cursor, perubahan hak dan pergantian akun untuk offline. Jumlah 222 dan 246 tidak dapat langsung dijumlahkan menjadi target fungsi akhir. [Kontrak offline](operations/offline-data-sync.md), [stream Zyra](../app/api/zyra/chat/route.ts), [katalog operasi MCP](../lib/admin-mcp/operations-catalog.ts).

## Autentikasi dan perangkat

| Gerbang | Status Expo saat baseline | Bukti untuk keputusan kesiapan |
|---|---|---|
| Sesi dan peran | 0 dari 3 peran memiliki alur login hingga halaman berotorisasi pada kedua platform. | Untuk Student, Tutor dan Admin, uji login, pembatalan, sesi kedaluwarsa, logout, ganti akun dan pembukaan ulang dengan sesi tersimpan. Buktikan penolakan peran lain, hak per kursus dan isolasi cache. |
| Tautan dan identitas aplikasi | Konfigurasi galeri menggunakan ID terpisah `com.zyx.academy.nativeparity`. | Uji callback melalui browser sistem dan deep link saat aplikasi tertutup/terbuka, tujuan awal sesudah login, dan binding scheme, origin serta signing pada lingkungan yang diuji. |
| Perangkat | Bukti CI tersedia pada satu emulator Android dan satu simulator iOS untuk galeri. 0 dari 2 platform memiliki bukti alur produk pada perangkat fisik yang diperiksa dalam audit ini. | Sertakan model, versi OS, build, skala, font, tema, safe area, ukuran teks, TalkBack/VoiceOver, gestur dan perilaku kembali. Jalankan alur terkait notifikasi, kamera dan pemulihannya, share/file, haptik, offline, suspend/resume serta pembaruan pada perangkat nyata. |

Pisahkan keputusan kelulusan produk dari keputusan rilis. Bukti distribusi mencakup instalasi dan pembaruan aplikasi bertanda tangan, pemisahan nightly/staging dan stable/production, migrasi akun, serta rollback ke Capacitor. Commit, run, artefak dan hasil tiap platform perlu dicatat untuk setiap kredit. Peninjau utama memeriksa gambar yang disyaratkan sesuai proses visual repositori. Tidak ada build lokal, pengujian perangkat fisik, publikasi, perubahan MCP atau deployment dalam audit ini. [Konfigurasi galeri](../apps/mobile-native/app.json), [kontrak autentikasi dan rilis](mobile-native.md).

## Mengulang hitungan sumber

Jalankan dari root checkout. Perintah berikut hanya membaca objek Git di commit baseline. Daftar `ui`, `pages`, `methods` dan `actions` dapat dicetak untuk melihat ID sumber. Saat mengaudit commit berikutnya, periksa kembali bentuk ekspor, direktif inline, ekstensi baru, lokasi fixture dan perubahan daftar eksklusi.

```python
import re
import subprocess
from collections import Counter

ref = "fa3ce04ed78181810b31ff1b3bf5852c24f6ec5f"

def git(*args):
    return subprocess.check_output(["git", *args]).decode()

files = git("ls-tree", "-r", "--name-only", ref).splitlines()
app = [p for p in files if p.startswith("app/") and "/visual-fixtures/" not in p]
pages = [p for p in app if p.endswith("/page.tsx")]
ui = [p for p in files if p.endswith(".tsx") and
      (p.startswith(("components/", "features/")) or (p in app and p not in pages))]
print("UI", Counter(p.split("/")[0] for p in ui))
print("Pages", Counter(p.split("/")[1] for p in pages))

methods = {}
for p in files:
    if p.startswith("app/api/") and p.endswith("/route.ts"):
        src = git("show", f"{ref}:{p}")
        group = "candidate"
        if p.startswith(("app/api/cron/", "app/api/internal/", "app/api/mcp/",
                         "app/api/authoring/contracts/")) or p == "app/api/live/callback/route.ts":
            group = "service, agent or schema"
        if "retiredAdminAuthoringResponse" in src or "BROWSER_MANUAL_AUTHORING_RETIRED" in src:
            group = "retired"
        for verb in re.findall(r"^export (?:async )?(?:function|const) (GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\b", src, re.M):
            methods[p, verb] = group
print("HTTP", Counter(methods.values()))

roots = ["app", "components", "lib", "features"]
directive = r"""^[[:space:]]*["']use server["'];"""
hits = git("grep", "-n", "-E", directive, ref, "--", *roots).splitlines()
actions = []
for hit in hits:
    _, path, line, _ = hit.split(":", 3)
    if line == "1":
        src = git("show", f"{ref}:{path}")
        actions.extend((path, name) for name in re.findall(r"^export async function (\w+)", src, re.M))
    else:
        print("Inspect inline action", path, line)
print("Exported actions", len(actions))
```
