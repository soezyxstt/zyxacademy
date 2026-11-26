# Referensi daftar tryout Student

Rute `/courses/[id]/tryout` menampilkan simulasi ujian untuk kelas Kalkulus dasar. Playwright memuat `StudentTryoutsView`, `TryoutListClient`, dan formulir aktivasi produksi. Manifest menyimpan respons fixture native yang diterima browser dan parameter yang dipakai Maestro. Keadaan diterbitkan dan terkunci memakai tryout yang sama dengan tiga soal, batas waktu 60 menit, dan satu dari tiga percobaan terpakai. Saat daftar kosong, aksi Latihan dengan Kuis mengarah ke daftar kuis kelas tersebut. [Spec Playwright](../assessment-lists-reference.spec.ts) · [Flow Maestro](../../../../../.maestro/native-parallel/student/tryout-list.yaml)

| Profil Playwright | Diterbitkan | Terkunci | Kosong | Manifest |
| --- | --- | --- | --- | --- |
| Android, 380 × 820, DPR 1 | [PNG](web/android/tryout-list-published.png) | [PNG](web/android/tryout-list-locked.png) | [PNG](web/android/tryout-list-empty.png) | [Input dan SHA-256](web/android/tryout-list-reference.json) |
| iPhone 17 Pro, 402 × 874, DPR 3 | [PNG](web/ios/tryout-list-published.png) | [PNG](web/ios/tryout-list-locked.png) | [PNG](web/ios/tryout-list-empty.png) | [Input dan SHA-256](web/ios/tryout-list-reference.json) |

Cakupan web adalah isi halaman dengan heading aksesibel. Navigasi akun dan aktivasi token melalui server berada di luar cakupan. Pada lebar ponsel, contoh token di input web terpotong. Web menampilkan jumlah percobaan dari `localStorage` yang diisi sesuai respons fixture. Daftar native saat ini menampilkan informasi soal dan durasi tanpa jumlah percobaan. Tangkapan Maestro aktual pada kedua platform dan pengukuran visual masih tertunda. [Perintah reproduksi Playwright](../quiz-list/README.md)
