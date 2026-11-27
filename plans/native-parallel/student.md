# Tugas eksternal: Student, kursus dan alur belajar

Kerjakan implementasi di repo GitHub `soezyxstt/zyxacademy`. Kamu bekerja di mesin eksternal sendiri. Branch tugasmu **`native-migration/student`**, base PR **`soezyxst/react-native-monorepo`**. Buka satu draft PR ke base tersebut dan tambahkan commit selanjutnya ke PR yang sama. Integrator yang menggabungkan hasil. Staging, main, rilis dan Capacitor di luar target perubahan.

Jika mulai dengan clone baru, jalankan:

```sh
git clone --branch native-migration/student --single-branch https://github.com/soezyxstt/zyxacademy.git zyx-student
cd zyx-student
git remote set-branches --add origin soezyxst/react-native-monorepo
git fetch origin
git status --short --branch
```

Baca **[aturan integrasi dan bukti](README.md)** dan **[daftar rute dengan pemilik](routes.tsv)** di `plans/native-parallel/`, lalu AGENTS.md, docs/mobile-native.md dan docs/native-readiness.md. Gunakan GPT-6.2 Sol Medium untuk eksekusi dan GPT-6.2 Sol High untuk review independen. Penilaian akhir lintas jalur milik integrator.

Kamu memiliki **seluruh 50 halaman Student** dalam `app/(student)/`. Implementasi ada di `apps/mobile-native/features/student/`. Mulai dari dashboard, daftar kursus, detail kursus dan materi; lanjutkan progress/mastery, video, flashcard, kuis/tryout, hasil, jalur belajar, diskusi, jadwal, tutorial PKA, profil, leaderboard, pengaturan dan notifikasi. Gunakan routes.tsv untuk cakupan lengkap.

Irisan pertama: masuk dashboard dengan sesi Student dari adapter terinjeksi, buka kursus, pilih materi dan kembali ke daftar pada posisi yang sama. Siapkan fixture untuk peserta terdaftar, akun tanpa enrollment, akses dicabut, jaringan terputus dan konten panjang. Untuk penilaian, buktikan penyimpanan jawaban, submit/retry, hasil dan otorisasi memakai kontrak asli. Untuk ranking, pertahankan perbedaan partisipasi global dan hasil akademik per kursus.

Kamu memiliki alur halaman, adapter domain Student, komposit khusus Student dan binding ke operasi backend. Shell navigasi, kalender dan list reusable berasal dari jalur shared-ui. Gunakan entry renderer, sesi, push dan pustaka offline dari integrator. Untuk halaman yang menunggu renderer artikel/diktat, selesaikan loading, identitas materi, hak akses dan recovery lalu catat dependensinya. API atau operasi yang dipakai lintas peran dicatat dengan satu pemilik kontrak.

## Definisi hasil

Serahkan kode berjalan, kontrak ekspor dan entry yang dapat dijalankan, fixture lokal deterministik dan tes. Terapkan urutan primitif → layout → komposit → halaman → renderer kompleks. Ambil referensi dari implementasi web yang sebenarnya dengan Playwright di mesinmu. Untuk menyatakan paritas, bandingkan tiga kasus per item terhadap render native Android dan iOS pada density setara. Simpan referensi, hasil dan diff. Uji interaksi, aksesibilitas, error dan recovery. Pekerjaan yang menunggu perangkat atau dependensi dilaporkan beserta bukti yang sudah ada dan langkah integrasi spesifik.

Gunakan namespace `student` untuk fixture, skenario dan laporan. PR harus mencantumkan SHA, cakupan selesai/tersisa, operasi backend beserta batas izinnya, dampak MCP, bukti lokal dan perangkat, serta konflik atau dependensi untuk integrator. Kirim **URL PR** sebagai identitas pekerjaan agar dapat ditarik dan diuji bersama. Teruskan pekerjaan di branch tugas sampai cakupanmu terpenuhi.
