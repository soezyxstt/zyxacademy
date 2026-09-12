# Rencana perbaikan marketing Zyx

Status: `OPEN / IN PROGRESS`
Tanggal: 2026-09-12
Tahap: perencanaan, implementasi belum dimulai.

## Tujuan dan batas pekerjaan

Membuat calon mahasiswa lebih cepat memahami manfaat Zyx, menilai paket, dan mengambil langkah berikutnya. Membuat hirer dapat melihat kualitas produk dan menelusuri kontribusi Adi melalui bukti yang tepat.

Homepage tetap berorientasi pada mahasiswa ITB. Jalur portfolio ditempatkan secara sekunder melalui profil pendiri dan studi kasus. Pertahankan identitas visual dan demo yang sudah berguna; utamakan perbaikan alur, isi, hierarki, dan konsistensi.

Lingkup: `/`, `/plans`, `/about`, `/blog`, `/testimonial`, komponen marketing yang dipakai route tersebut, dan dokumentasi terkait. Tujuan CTA seperti `/sign-up`, `/courses`, dan `/feedback` diperiksa sebagai batas navigasi. Tidak merombak aplikasi Student atau Admin.

Tidak termasuk perubahan harga, formula pricing, hak akses paket, backend pembelajaran, database, provider AI, autentikasi, deployment, publikasi eksternal, atau penambahan analytics vendor. Permintaan saat ini hanya membuat plan. Implementasi, commit, push, dan publikasi belum dilakukan. Kerjakan langsung tanpa AGY sesuai instruksi pengguna.

## Dasar audit dan batas bukti

Audit percakapan 2026-09-12 memeriksa source marketing dan halaman publik Home, Paket, About, Blog, serta navigasi kontak. Screenshot Home dan Paket diperiksa pada viewport 380px; About dan Blog juga diperiksa pada desktop. Halaman Testimoni mandiri hanya diperiksa melalui source karena browser timeout. Semua screenshot itu merupakan observasi awal, bukan sign-off visual atau bukti perilaku backend.

Tidak ada data funnel, pengukuran Core Web Vitals, eksperimen konversi, atau verifikasi lengkap entitlement produk dalam audit ini. Dampak komersial yang diharapkan adalah hipotesis. Temuan harus diperiksa ulang pada checkout implementasi karena source dan deployment dapat berubah.

| ID | Temuan | Bukti awal | Target |
|---|---|---|---|
| M01 | CTA kontak homepage menuju formulir masukan mahasiswa | `components/landing/landing-pricing-preview.tsx`, navigasi publik `/feedback` | Konsultasi paket langsung dan sesuai konteks |
| M02 | Homepage menampilkan total grup tanpa satuan yang jelas; `/plans` menonjolkan harga per orang | `landing-pricing-preview.tsx`, `lib/plan-tiers.ts`, `lib/pricing-constants.ts` | Harga per orang, periode, grup, dan matkul konsisten |
| M03 | Hero menonjolkan platform adaptif; testimoni terutama membuktikan pendampingan tutor | `landing-hero.tsx`, `landing-testimonials.tsx` | Manfaat platform dan tutor terhubung dengan bukti relevan |
| M04 | Profil Adi belum menjelaskan kontribusi pengembangan software | `app/(marketing)/about/about-client.tsx` | Kontribusi konkret dan tautan studi kasus yang benar |
| M05 | Banyak bagian fitur mendahului bukti dan penawaran; penutup CTA dinonaktifkan | `app/(marketing)/page.tsx` | Alur singkat dari manfaat ke bukti dan tindakan |
| M06 | Klaim absolut dan label demo belum didukung bukti dalam audit | `demo/hero-graph-card.tsx`, `landing-demo-flashcards.tsx`, `demo/tutor-chat-demo.tsx` | Klaim sesuai cakupan aktual; simulasi dikenali jelas |
| M07 | About panjang dan memuat generalisasi negatif terhadap tutor center lain | `about/about-client.tsx` | Cerita pendirian singkat dan praktik pembeda yang konkret |
| M08 | Toolbar Paket mobile tinggi; Blog mendahulukan promosi fitur | `plans/plans-client.tsx`, `blog/page.tsx`, screenshot audit | Ruang baca mobile dan hierarki artikel lebih efektif |
| M09 | Deskripsi demo Mahasiswa A menahan Integral, tetapi node Integral berstatus terbuka | `components/landing/demo/mastery-path-demo.tsx` | Deskripsi, status node, dan aturan yang didemokan selaras |

## Keputusan awal sebelum implementasi

Lakukan pemeriksaan berikut dalam CP0. Hanya keputusan yang belum diketahui yang perlu dikembalikan kepada pemilik produk; lanjutkan bagian independen yang sudah jelas.

1. Verifikasi tujuan WhatsApp publik dari konfigurasi yang sudah dipakai `/plans`. Gunakan helper yang tersedia, hindari nomor baru atau nomor fallback contoh. Tidak mengirim pesan saat pengujian.
2. Verifikasi akses gratis dan berbayar dari entitlement aktual sebelum menulis ulang hero, FAQ, atau daftar fitur. Jangan mengubah entitlement untuk menyesuaikan copy.
3. Konfirmasi atribusi kontribusi Adi, kontribusi anggota tim, dan URL studi kasus final. Label peran yang ada bukan bukti ownership software. Jangan mengganti jabatan atau mengklaim pembangunan seluruh produk tanpa dasar.
4. Inventarisasi bukti yang tersedia: kutipan testimoni asli, izin penggunaan foto/kutipan, foto tutorial, materi contoh, dan sumber klaim. Bila tidak tersedia, gunakan aset yang sudah disetujui dan copy faktual; jangan membuat testimoni atau metrik pengganti.
5. Rekomendasi: perbaikan kontak, satuan harga, copy, dan konsistensi demo selalu aktif tanpa flag baru. Sebelum membangun kapabilitas baru atau perubahan perilaku material, seperti demo terpadu atau FAQ interaktif baru, konfirmasi pilihan always-on atau flag sesuai aturan repo. Plan ini tidak menambah atau menghapus `FEATURE_*`.

## CP0. Kunci cakupan dan baseline

- Periksa `git status --short` dan pertahankan pekerjaan lain.
- Periksa instruksi repository, source route terkait, komponen sejenis, token, helper pricing, dan dokumen kontrak yang relevan.
- Baca panduan lokal Next.js yang relevan sebelum menulis kode. Jika perubahan menyentuh server atau environment, baca `db/schema.ts` dan `lib/env.ts` terlebih dahulu.
- Catat baseline tiap route: hero, CTA dan tujuannya, konteks harga, urutan bagian, klaim produk, dan keadaan mobile.
- Siapkan data lokal deterministik atau lingkungan nonproduksi yang secara eksplisit diizinkan untuk validasi. Hindari data pribadi dan kredensial produksi dalam screenshot.
- Susun daftar klaim dengan status: terverifikasi, perlu bukti, atau perlu diperbaiki. Catat setiap materi dan keputusan pemilik produk yang masih kurang.

Kriteria selesai: M01 sampai M09 memiliki lokasi source terkini, target perubahan, dan jalur validasi. Lingkungan uji diketahui. Ketergantungan konten tidak menghalangi CP1 yang independen.

## CP1. Perbaiki hambatan keputusan dan kepercayaan

### M01: tujuan kontak

- Ganti CTA kontak di kartu homepage dengan konsultasi paket menggunakan `getWhatsAppPlanUrl` dan konfigurasi paket yang ditampilkan.
- Gunakan label jelas seperti `Tanya paket via WhatsApp`. Jangan memindahkan formulir feedback atau mengubah fungsinya.
- Pastikan parameter paket, jumlah orang, dan daftar matkul sesuai. Tidak membuat pengiriman otomatis.

### M02: konteks harga

- Gunakan sumber kalkulasi yang sama untuk homepage dan `/plans`, tanpa mengubah formula, default, atau nilai harga.
- Tampilkan harga utama per orang per semester. Tambahkan konteks grup dan matkul serta total grup sebagai informasi sekunder.
- Contoh baseline, bukan angka hard-coded baru: Minimal Rp390.000/orang/semester untuk grup 3 orang dan 3 matkul, total Rp1.170.000.
- Bila default atau formula berubah saat implementasi, semua tampilan harus mengikuti sumber aktual.

### M06 dan M09: kejujuran klaim dan demo

- Ganti klaim menyeluruh yang tidak terbukti dengan penjelasan contoh yang spesifik.
- Labeli demo scripted sebagai simulasi. Pertahankan klaim asal sesi nyata hanya bila ada bukti yang layak digunakan.
- Periksa angka cohort, skor, timer, dan streak ilustratif agar tidak terbaca sebagai traction atau hasil customer.
- Selaraskan status Integral dan narasi Mahasiswa A berdasarkan aturan yang benar-benar hendak didemokan. Jangan mengubah backend pembelajaran untuk membenarkan mockup.
- Pertahankan demo kuis, flashcard, grafik, dan jalur belajar yang sudah ada; gunakan komponen yang sama.

Kriteria selesai: tidak ada CTA pembelian menuju feedback; harga homepage dan Paket cocok untuk konfigurasi sama; seluruh klaim yang diubah memiliki bukti atau batas yang jelas; tidak ada kontradiksi narasi/status demo.

## CP2. Perjelas cerita dan jalur konversi homepage

Menangani M03 dan M05 setelah CP1. Susunan target:

1. Hero: sasaran mahasiswa ITB, manfaat belajar terarah, dan pilihan pendampingan tutor sesuai paket.
2. Bukti singkat: satu kutipan asli yang relevan, konteks mahasiswa, dan foto yang telah disetujui bila tersedia.
3. Alur belajar: materi, latihan, feedback, dan langkah berikutnya melalui demo yang ada.
4. Pendampingan tutor: jelaskan kapan dan bagaimana tutor membantu, tanpa menyiratkan layanan tutor termasuk akses gratis.
5. Katalog ringkas, lalu testimoni tambahan dan paket.
6. FAQ pembelian yang menjawab keputusan, lalu CTA penutup.

Arahan isi dan interaksi:

- Headline final ditulis setelah verifikasi entitlement. Draft arah: `Pahami materi kuliah ITB, dengan latihan terarah dan tutor yang mendampingi.`
- CTA utama dapat memakai `Mulai gratis` hanya jika pengalaman tujuan dan batas gratis sesuai. CTA sekunder `Coba demo` mengarah ke demo yang sudah ada pada halaman, tanpa backend atau pengalaman onboarding baru.
- Perkecil pengulangan antara learning loop dan bagian demo. Ringkas bagian tutor/kelas dengan tetap menjaga bukti kualitas produk yang relevan.
- Gunakan FAQ untuk batas gratis, perbedaan paket, satuan harga, kelompok, durasi/frekuensi tutorial, lokasi atau format, dan langkah aktivasi. Hanya tampilkan jawaban yang sudah diketahui; jangan menciptakan SLA, cicilan, refund, atau jaminan hasil.
- Gunakan primitive yang sudah tersedia untuk FAQ. Keputusan gating untuk kapabilitas baru ditutup sebelum implementasinya.
- Gunakan CTA penutup yang sudah tersedia sebagai dasar, sesuaikan dengan alur final. Jangan menumpuk tombol dengan tujuan sama.

Kriteria selesai: manfaat, sasaran, dan tindakan utama jelas pada mobile; akses gratis dan tutor berbayar tidak tercampur; bukti muncul sebelum rangkaian fitur panjang; setiap CTA mempunyai tujuan yang sesuai dan tersedia bagi pengunjung.

## CP3. Perbaiki About dan jalur bukti untuk hirer

Menangani M04 dan M07. Dapat berjalan setelah CP0 bersamaan dengan pekerjaan homepage bila materi faktual telah tersedia.

- Ringkas About menjadi alasan pendirian, cara Zyx membantu, bukti kegiatan, dan orang yang bertanggung jawab.
- Hapus generalisasi negatif terhadap kompetitor. Ganti dengan praktik Zyx yang dapat diverifikasi, bukan janji generik.
- Pisahkan biografi singkat dari kontribusi pada produk. Berikan atribusi spesifik kepada setiap anggota tim sesuai fakta.
- Pada profil Adi, tambahkan kontribusi software yang sudah dikonfirmasi dan tautan berlabel `Studi kasus pengembangan Zyx` ke halaman yang benar.
- Periksa URL publik secara read-only sebelum memasang tautan. Bila studi kasus belum tersedia, catat dependency; jangan membuat link rusak atau menerbitkan klaim sementara.
- Siapkan brief studi kasus: masalah pengguna, lingkup kontribusi, keputusan desain/teknis dan tradeoff, contoh perubahan, validasi, hasil terukur bila ada, dan keterbatasan. Implementasi atau publikasi situs portfolio di repository lain di luar scope plan ini.
- Gunakan diagram arsitektur publik yang aman dan bukti produk relevan bila memang tersedia. Hindari credential, endpoint internal sensitif, data mahasiswa, serta daftar teknologi tanpa penjelasan keputusan.

Kriteria selesai: pembaca bisa membedakan kontribusi Adi dan tim; jalur ke bukti software jelas; tidak ada klaim hasil atau ownership tanpa sumber. Dependency studi kasus yang belum selesai dilaporkan terpisah dan M04 tidak ditandai tuntas penuh sebelum bukti tersedia.

## CP4. Rapikan Paket, Blog, dan Testimoni

Menangani M08 serta konsistensi route pendukung.

### Paket

- Kurangi tinggi konfigurator mobile dengan mengelompokkan kontrol ringkas dan menghilangkan judul/helper yang berulang. Pertahankan keterbacaan 14px pada kontrol dan target interaksi yang layak.
- Evaluasi sticky pada 380px. Jika perlu, batasi sticky ke ringkasan ringkas atau desktop agar harga dan tombol tetap memperoleh ruang baca.
- Pertahankan perilaku pilihan matkul, batas jumlah orang, konfigurasi harga, dan isi link WhatsApp. Jangan membuat varian kalkulator baru.
- Uji panel matkul terbuka/tertutup, minimum/maksimum, dan kondisi saat scroll.

### Blog

- Dahulukan identitas Blog dan artikel unggulan; pindahkan promosi fitur ke posisi sekunder yang relevan.
- Pertahankan pencarian/filter/kategori yang memang sudah ada dan aturan publikasi artikel. Jangan merombak server pengambilan konten dalam pekerjaan visual ini.
- Perbaiki hierarki heading dan landmark yang relevan: root Blog saat ini dibuka dengan h2 dan mempunyai main di dalam main.
- Hindari mengulang dua artikel yang sama di banyak bagian bila isi katalog masih sedikit. Pilih komposisi yang menyesuaikan jumlah artikel.
- CTA fitur harus menjelaskan tujuan sebenarnya; jangan memakai `Lihat detail` jika semua link hanya menuju katalog umum.

### Testimoni

- Pertahankan kutipan asli dan konteks mahasiswa. Kutipan ringkas harus tetap setia pada sumber dan memberi akses ke cerita lengkap.
- Bedakan bukti kualitas tutor dari bukti manfaat platform. Jangan menyimpulkan keberhasilan fitur adaptif dari testimoni les.
- Tambahkan CTA relevan setelah kumpulan cerita bila sesuai alur CP2.
- Verifikasi ulang tampilan live atau nonproduksi, gambar, fallback, kutipan panjang, dan mobile. Audit awal belum memberikan sign-off visual route ini.

Kriteria selesai: konfigurator tidak mendominasi layar mobile; artikel menjadi isi utama Blog; testimoni memberi bukti yang tepat dan langkah lanjut yang jelas; komponen dan tipografi mengikuti design system.

## CP5. Validasi dan penutupan

Validasi proporsional. Tidak menjalankan lint, typecheck, atau build untuk penulisan plan ini. Saat implementasi, full lint/typecheck hanya untuk perubahan yang ternyata substansial atau lintas sistem; build hanya bila diminta atau menyentuh batas build/runtime.

### Pemeriksaan perilaku terfokus

- Harga: homepage sama dengan konfigurasi default `/plans`; harga per orang dikalikan ukuran grup sama dengan total; nilai formula tetap sama sebelum dan sesudah perubahan.
- CTA: tautan gratis, demo, katalog, WhatsApp, dan studi kasus menuju tujuan yang sesuai. Periksa isi link tanpa mengirim pesan atau mendaftar.
- Demo: grafik, jawaban benar/salah/reset, flashcard depan/belakang/rating, profil A/B, dan replay chat bekerja sesuai state yang diubah. Simulasi tidak memakai quota AI atau menulis data.
- Paket: tombol batas minimum/maksimum, pilihan matkul, harga dan link konsultasi mengikuti konfigurasi.
- Konten: tidak ada klaim absolut, angka traction, jabatan, atribusi, testimonial baru, atau janji layanan tanpa dasar.

### Matriks visual wajib untuk implementasi

Primary agent menjalankan Playwright dan membuka setiap screenshot. Gunakan viewport 380x844 dan 1536x864 untuk seluruh route/state yang berubah. Tambahkan breakpoint lain bila layout yang diubah membutuhkan pemeriksaan khusus.

| Route | State yang harus ditangkap bila terdampak |
|---|---|
| `/` | Hero, susunan bagian, demo grafik, kuis idle/benar/salah/reset, flashcard depan/belakang/rating, jalur A/B, chat berjalan/selesai/replay, FAQ tertutup/terbuka, CTA akhir |
| `/plans` | Default, konfigurasi berubah, batas minimum/maksimum, panel matkul terbuka/tertutup, toolbar saat scroll |
| `/about` | Narasi dan profil, foto/fallback bila diubah, tautan kontribusi |
| `/blog` | Artikel tersedia/kosong, kategori terpilih/kosong, judul panjang, gambar/fallback yang diubah |
| `/testimonial` | Kumpulan cerita, kutipan panjang, foto/fallback yang diubah, CTA akhir |

- Jalankan `VISUAL_CHECK_PATHS=/,/plans,/about,/blog,/testimonial bun run test:visual` dengan sintaks environment shell yang sesuai. Gunakan spec interaksi terfokus untuk state di atas; screenshot default saja tidak cukup.
- Gunakan `PLAYWRIGHT_BASE_URL` hanya untuk server uji yang sudah berjalan dan diizinkan. Jangan menggunakan production sebagai lingkungan screenshot pengujian ini.
- Periksa light/dark bila token atau warna berubah, serta fokus keyboard dan reduced motion untuk interaksi/animasi yang tersentuh.
- Wajib tidak ada overflow horizontal tingkat dokumen, clipping tak disengaja, redirect tak diharapkan, respons HTTP >=400, page error, atau console error yang terkait perubahan. Kegagalan yang sudah ada dicatat terpisah.
- Simpan screenshot/report di ignored `artifacts/visual-quality/`. Catat command, exit code, route/state, viewport, file screenshot yang diperiksa, dan batas yang belum terverifikasi.
- Jalankan `git diff --check`, tinjau seluruh diff, dan pastikan perubahan tetap di scope.

### Dokumentasi dan pengukuran

- Perbarui `docs/features.md` bila alur pengguna berubah, dan selalu perbarui `docs/README.md` bersama perubahan markdown pada `docs/` atau `plans/`.
- Catat status CP0 sampai CP5 dan M01 sampai M09. Status selesai memerlukan implementasi dan bukti validasi, bukan hanya perubahan source.
- Jika pengukuran funnel yang sesuai sudah tersedia, bandingkan interaksi demo, CTA gratis, CTA konsultasi, dan kunjungan studi kasus sebelum/sesudah pada traffic yang sebanding. Verifikasi instrumentasi terlebih dahulu; klik WhatsApp bukan bukti pesan terkirim atau penjualan.
- Jika analytics belum tersedia, laporkan batas pengukuran. Penambahan tracking atau vendor merupakan keputusan terpisah, tidak otomatis masuk implementasi.
- Handoff lokal memuat perubahan, pengujian, dependency konten, dan batas deployment. Jangan mengklaim dampak konversi, penerimaan hirer, atau production sudah berubah tanpa bukti.

## Urutan pelaksanaan dan kondisi selesai

Urutan utama: CP0, CP1, CP2, CP3, CP4, CP5. Pekerjaan About yang sudah memiliki fakta dapat dikerjakan independen setelah CP0; dependency konten yang belum tersedia tidak menghalangi perbaikan kontak dan harga.

Plan ditutup hanya setelah seluruh temuan dalam scope diperbaiki dan diverifikasi. Bila materi kontribusi atau studi kasus belum tersedia, pisahkan item tersebut sebagai dependency terbuka. Jangan menyatakan seluruh plan selesai. Deployment dan publikasi portfolio tetap memerlukan otorisasi terpisah sesuai tujuan dan lingkungan aktual.
