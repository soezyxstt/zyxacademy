# Tugas eksternal: Layout dan komponen tingkat tinggi lintas peran

Kerjakan implementasi di repo GitHub `soezyxstt/zyxacademy`. Kamu bekerja di mesin eksternal sendiri. Branch tugasmu **`native-migration/shared-ui`**, base PR **`soezyxst/react-native-monorepo`**. Buka satu draft PR ke base tersebut dan tambahkan commit selanjutnya ke PR yang sama. Integrator yang menggabungkan hasil. Staging, main, rilis dan Capacitor di luar target perubahan.

Jika mulai dengan clone baru, jalankan:

```sh
git clone --branch native-migration/shared-ui --single-branch https://github.com/soezyxstt/zyxacademy.git zyx-shared-ui
cd zyx-shared-ui
git remote set-branches --add origin soezyxst/react-native-monorepo
git fetch origin
git status --short --branch
```

Baca **[aturan integrasi dan bukti](README.md)** dan **[daftar rute dengan pemilik](routes.tsv)** di `plans/native-parallel/`, lalu AGENTS.md, docs/mobile-native.md dan docs/native-readiness.md. Gunakan GPT-6.2 Sol Medium untuk eksekusi dan GPT-6.2 Sol High untuk review independen. Penilaian akhir lintas jalur milik integrator.

Kamu memiliki **layout dan komposit reusable lintas peran** di antara primitif dan halaman. Implementasi ada di `apps/mobile-native/features/shared-ui/`. Mulai dari audit `components/navigation/`, `components/sidebar-shell.tsx`, `components/page-header.tsx`, `components/ui/{dialog,sheet,tabs,table,popover}.tsx`, list responsif dan kalender yang benar-benar dipakai. Temukan pemanggil Student, Tutor, dan Admin untuk menetapkan kontrak publiknya.

Irisan pertama: shell compact dengan safe area dan tombol Back, header dengan actions, serta list responsif dengan state berisi/kosong/gagal. Berikutnya buat navbar dan bottom nav berbasis peran, tab dan overflow, dialog/sheet/popover dengan pemulihan fokus dan Back, grid, tabel/stacked rows, kalender, pencarian, pagination, status/empty/recovery, toolbar dan composer shell. Tentukan tiga kasus independen per layout/komposit dan verifikasi perilaku keyboard, pembaca layar, ukuran teks dan sentuhan. Contoh dialog: buka dari trigger, validasi saat submit, tutup dengan fokus kembali. Contoh tabel: isi normal, nol hasil, nama panjang pada 380 px.

Primitif `apps/mobile-native/components/`, router dan registri global milik integrator. Komposisikan ekspor yang sudah ada dan catat gap primitif melalui PR integrasi. Untuk navigator, implementasikan presentasi controlled dan callback typed; root router mengikat route aktual. Terbitkan daftar props, ID aksi dan minimal satu contoh konsumsi sejak commit awal sehingga tiga agen halaman bisa bekerja paralel. Kamu memiliki kompositnya; para agen fitur memiliki route dan adapter datanya. Tunda renderer artikel/diktat/rumus ke jalur integrasi terakhir.

## Definisi hasil

Serahkan kode berjalan, kontrak ekspor dan entry yang dapat dijalankan, fixture lokal deterministik dan tes. Terapkan urutan primitif → layout → komposit → halaman → renderer kompleks. Ambil referensi dari implementasi web yang sebenarnya dengan Playwright di mesinmu. Untuk menyatakan paritas, bandingkan tiga kasus per item terhadap render native Android dan iOS pada density setara. Simpan referensi, hasil dan diff. Uji interaksi, aksesibilitas, error dan recovery. Pekerjaan yang menunggu perangkat atau dependensi dilaporkan beserta bukti yang sudah ada dan langkah integrasi spesifik.

Gunakan namespace `shared-ui` untuk fixture, skenario dan laporan. PR harus mencantumkan SHA, cakupan selesai/tersisa, operasi backend beserta batas izinnya, dampak MCP, bukti lokal dan perangkat, serta konflik atau dependensi untuk integrator. Kirim **URL PR** sebagai identitas pekerjaan agar dapat ditarik dan diuji bersama. Teruskan pekerjaan di branch tugas sampai cakupanmu terpenuhi.
