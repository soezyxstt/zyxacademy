# Tugas eksternal: Admin operasional, konten dan publik

Kerjakan implementasi di repo GitHub `soezyxstt/zyxacademy`. Kamu bekerja di mesin eksternal sendiri. Branch tugasmu **`native-migration/operations`**, base PR **`soezyxst/react-native-monorepo`**. Buka satu draft PR ke base tersebut dan tambahkan commit selanjutnya ke PR yang sama. Integrator yang menggabungkan hasil. Staging, main, rilis dan Capacitor di luar target perubahan.

Jika mulai dengan clone baru, jalankan:

```sh
git clone --branch native-migration/operations --single-branch https://github.com/soezyxstt/zyxacademy.git zyx-operations
cd zyx-operations
git remote set-branches --add origin soezyxst/react-native-monorepo
git fetch origin
git status --short --branch
```

Baca **[aturan integrasi dan bukti](README.md)** dan **[daftar rute dengan pemilik](routes.tsv)** di `plans/native-parallel/`, lalu AGENTS.md, docs/mobile-native.md dan docs/native-readiness.md. Gunakan GPT-6.2 Sol Medium untuk eksekusi dan GPT-6.2 Sol High untuk review independen. Penilaian akhir lintas jalur milik integrator.

Kamu memiliki **36 halaman Admin di luar grup academic** dan **13 halaman marketing selain sign-in, sign-up, sign-out**, total 49 halaman. Semua path ditandai operations di routes.tsv. Implementasi ada di `apps/mobile-native/features/operations/`. Cakupan mencakup Admin home, eval, content, blog, formulir, media, dokumentasi, meet, diskusi, harga, tautan, Ops/analitik serta halaman publik landing, blog, plans, download, demo, formulir, kebijakan, testimonial dan unsubscribe.

Irisan awal: Admin home ke analitik web, rentang dengan data dan kosong, filter serta akses ditolak; jalur publik terpisah dari daftar blog ke detail dan kembali. Lanjutkan alur authoring lokal, draft/revisi dan konfirmasi aksi berisiko sesuai urutan kontrak web. Jaga batas atribusi analitik, status job dan pemisahan harga publik dari tindakan Admin. Verifikasi rute lama/alias menurut perilaku aktual, termasuk redirect atau status pensiun.

Gunakan proyeksi publik dan otorisasi Next.js yang sama. Halaman responsive marketing dapat memakai komponen visual khusus domain. Otorisasi, telemetri native global, renderer konten kompleks dan root router milik integrator. Editor kuis/domain akademik lintas grup berasal dari jalur academic, sedangkan rute Admin eval dan binding-nya tetap milikmu. Produksi, pengiriman pesan, publikasi, pembelian dan perubahan akun nyata berada di luar pengujian ini.

## Definisi hasil

Serahkan kode berjalan, kontrak ekspor dan entry yang dapat dijalankan, fixture lokal deterministik dan tes. Terapkan urutan primitif → layout → komposit → halaman → renderer kompleks. Ambil referensi dari implementasi web yang sebenarnya dengan Playwright di mesinmu. Untuk menyatakan paritas, bandingkan tiga kasus per item terhadap render native Android dan iOS pada density setara. Simpan referensi, hasil dan diff. Uji interaksi, aksesibilitas, error dan recovery. Pekerjaan yang menunggu perangkat atau dependensi dilaporkan beserta bukti yang sudah ada dan langkah integrasi spesifik.

Gunakan namespace `operations` untuk fixture, skenario dan laporan. PR harus mencantumkan SHA, cakupan selesai/tersisa, operasi backend beserta batas izinnya, dampak MCP, bukti lokal dan perangkat, serta konflik atau dependensi untuk integrator. Kirim **URL PR** sebagai identitas pekerjaan agar dapat ditarik dan diuji bersama. Teruskan pekerjaan di branch tugas sampai cakupanmu terpenuhi.
