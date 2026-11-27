# Tugas eksternal: Tutor dan administrasi akademik

Kerjakan implementasi di repo GitHub `soezyxstt/zyxacademy`. Kamu bekerja di mesin eksternal sendiri. Branch tugasmu **`native-migration/academic`**, base PR **`soezyxst/react-native-monorepo`**. Buka satu draft PR ke base tersebut dan tambahkan commit selanjutnya ke PR yang sama. Integrator yang menggabungkan hasil. Staging, main, rilis dan Capacitor di luar target perubahan.

Jika mulai dengan clone baru, jalankan:

```sh
git clone --branch native-migration/academic --single-branch https://github.com/soezyxstt/zyxacademy.git zyx-academic
cd zyx-academic
git remote set-branches --add origin soezyxst/react-native-monorepo
git fetch origin
git status --short --branch
```

Baca **[aturan integrasi dan bukti](README.md)** dan **[daftar rute dengan pemilik](routes.tsv)** di `plans/native-parallel/`, lalu AGENTS.md, docs/mobile-native.md dan docs/native-readiness.md. Gunakan GPT-6.2 Sol Medium untuk eksekusi dan GPT-6.2 Sol High untuk review independen. Penilaian akhir lintas jalur milik integrator.

Kamu memiliki **18 halaman Tutor** dalam `app/(tutor)/` serta **36 halaman Admin academic** dalam `app/(admin)/admin/(academic)/`. Implementasi ada di `apps/mobile-native/features/academic/`. Prioritaskan dashboard dan kursus Tutor, peserta, jadwal, grading, kuis dan tryout; lalu kursus dan analitik Admin, material/review/bundle, grup, pengguna, token dan tutorial PKA. Daftar penuh ada di routes.tsv. Bedakan courseId dan slug, juga hak Tutor, Admin dan peserta.

Irisan pertama: Tutor membuka kursus yang ditugaskan, melihat daftar peserta atau antrean penilaian, membuka detail, lalu kembali. Uji kursus tanpa peserta dan kursus di luar penugasan. Irisan Admin awal: daftar kursus ke detail dan kembali dengan filter tetap benar. Untuk mutasi, uji edit, validasi, batal, konflik revisi, percobaan ulang dan hasil tersimpan pada fixture lokal/CI. Pekerjaan asinkron tetap melalui antrean server.

Gunakan komposit dialog, tabel responsif dan kalender dari shared-ui. Kontrol akademik khusus dan operasi domain ini milikmu. Halaman kuis di grup Admin eval milik jalur operations. Bila kedua grup memakai editor atau read model yang sama, terbitkan ekspor akademik bersama dengan kontrak typed di PR-mu dan cantumkan konsumen operations. Viewer artikel/diktat disediakan integrator di fase akhir.

## Definisi hasil

Serahkan kode berjalan, kontrak ekspor dan entry yang dapat dijalankan, fixture lokal deterministik dan tes. Terapkan urutan primitif → layout → komposit → halaman → renderer kompleks. Ambil referensi dari implementasi web yang sebenarnya dengan Playwright di mesinmu. Untuk menyatakan paritas, bandingkan tiga kasus per item terhadap render native Android dan iOS pada density setara. Simpan referensi, hasil dan diff. Uji interaksi, aksesibilitas, error dan recovery. Pekerjaan yang menunggu perangkat atau dependensi dilaporkan beserta bukti yang sudah ada dan langkah integrasi spesifik.

Gunakan namespace `academic` untuk fixture, skenario dan laporan. PR harus mencantumkan SHA, cakupan selesai/tersisa, operasi backend beserta batas izinnya, dampak MCP, bukti lokal dan perangkat, serta konflik atau dependensi untuk integrator. Kirim **URL PR** sebagai identitas pekerjaan agar dapat ditarik dan diuji bersama. Teruskan pekerjaan di branch tugas sampai cakupanmu terpenuhi.
