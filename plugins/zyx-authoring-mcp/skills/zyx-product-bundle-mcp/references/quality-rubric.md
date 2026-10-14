# Rubrik mutu Artikel dan Diktat

Gunakan rubrik ini bersama matriks [derivation-audit.md](derivation-audit.md) pada setiap Product Bundle. Ini catatan preflight di luar ZIP, bukan field contract, nilai kelulusan otomatis, atau pengganti review ahli.

## Status dan bukti

Untuk grafik geometri, periksa skala kedua sumbu agar lingkaran tidak tampak sebagai elips. Gunakan `equalAxisScale: true` bila contract `function_plot` aktif mendukungnya. Titik yang termasuk domain harus memakai penanda penuh, bukan lingkaran kosong; bedakan kurva melalui label dan gaya garis selain warna.

- `PASS`: bukti yang disebut menunjukkan kriteria terpenuhi.
- `FAIL`: bukti menunjukkan ada kesalahan atau kekurangan yang harus diperbaiki sebelum submit.
- `NOT_APPLICABLE`: kriteria kondisional memang tidak relevan; catat alasan dan tujuan yang diperiksa.
- `NOT_TESTED`: perlu pemeriksaan ahli, mahasiswa, browser, perangkat, atau pembaca PDF yang belum dilakukan. Status ini tidak berarti lulus.
- `NOT_RENDERED` tetap status khusus bukti PDF sebelum render; PDF belum siap.

Untuk setiap status, catat artifact checksum/versi serta lokasi section, block, source locator, halaman, atau hasil uji yang mendukungnya. Jangan membuat sumber, kutipan, hasil uji, skor, atau klaim review. Skor per aspek boleh dicatat hanya jika metodenya jelas dan buktinya ada; skor rata-rata tidak pernah menutup hard fail.

## Gate mutu

| Aspek | PASS jika | Gagal jika |
|---|---|---|
| Scope dan tujuan | Setiap tujuan resmi dan primary Idea dipetakan ke penjelasan dan cek yang sesuai. Prasyarat yang menentukan dijelaskan atau dirujuk ke materi yang benar-benar tersedia. | Tujuan inti atau prasyarat penting hilang, atau materi di luar scope dipakai diam-diam. |
| Akurasi dan sumber | Fakta, definisi, simbol, satuan, kondisi, contoh, jawaban, dan kesimpulan ditopang sumber berkualitas yang dapat ditelusuri. Rujukan tercatat melalui field/format yang didukung. Hitungan dan transformasi matematis diperiksa ulang secara independen. Versi/tanggal dicatat untuk materi yang berubah. | Ada kesalahan konsep/hitung, asumsi atau batas yang mengubah jawaban dihilangkan, dua bagian bertentangan, sumber penting tidak dapat diverifikasi, atau klaim melampaui bukti. |
| Artikel sebagai belajar pertama | Urutan bergerak dari prasyarat dan intuisi ke definisi/formalitas, hubungan, penerapan, dan cek. Istilah dan simbol dijelaskan sebelum dipakai. Setiap tujuan memiliki penjelasan, contoh bila penerapan diperlukan, serta cek dengan jawaban dan pembahasan. | Mahasiswa harus menebak langkah/alasan, membuka sumber lain untuk mencapai tujuan, atau hanya menghafal tanpa bisa menggunakan konsep yang menjadi tujuan. |
| Beban belajar dan keterlibatan | Pecah konsep sulit menjadi langkah yang wajar, mulai dari pengetahuan awal yang tersedia, tambah kesulitan bertahap, dan gunakan masalah/contoh yang langsung membantu tujuan. Sediakan remediasi atau pendalaman hanya bila contract dan alur produk mendukungnya. | Artikel menganggap prasyarat yang tidak tersedia, mencampur terlalu banyak konsep sekaligus, menambah detail/analogi yang mengalihkan, atau menggolongkan mahasiswa berdasarkan “gaya belajar”. |
| Contoh dan latihan | Contoh menyatakan data/masalah, alasan pemilihan metode, langkah penting, dan pemeriksaan hasil. Cek/latihan mengukur tujuan, termasuk pemahaman atau transfer bila tujuan menuntutnya. Jawaban dan umpan balik membetulkan kesalahan secara spesifik. | Contoh hanya memberi hasil, soal menilai kemampuan yang berbeda dari tujuan, jawaban/pembahasan salah, atau cek membocorkan kunci sebelum mahasiswa mencoba. |
| Bahasa dan alur | Bahasa Indonesia baku yang alami, langsung, konsisten, dan dapat dipahami mahasiswa sasaran. Istilah teknis/singkatan dikenalkan; paragraf dan instruksi menyampaikan gagasan atau tindakan dengan jelas. | Istilah tanpa arti, kalimat kabur/panjang, logika antarbagian hilang, jargon pipeline tampil ke mahasiswa, atau pengulangan/filler mengganggu belajar. |
| Visual dan representasi | Visual dipakai bila memberi informasi yang sulit dipahami lewat teks; label, skala, unit, sumber, dan caption akurat bila relevan. Persamaan terhubung ke penjelasan, gambar penting memiliki deskripsi teks/fallback, dan warna bukan satu-satunya pembeda. | Grafik/diagram menyesatkan atau tak berlabel, visual dekoratif mengganggu, visual membawa fakta yang bertentangan dengan teks, atau informasi penting hilang saat fallback. |
| Navigasi dan akses | Identitas mata kuliah/topik/cakupan dan tujuan jelas. Heading dan penanda konsisten; istilah, rumus, syarat, contoh, dan pembahasan mudah ditemukan. Gunakan tautan prasyarat/lanjutan, daftar isi, serta nomor halaman bila relevan dan didukung format. Konten tidak mengandalkan warna, animasi, atau satu modalitas saja. | Informasi penting sulit ditemukan, teks tidak konsisten, atau visual penting tidak memiliki alternatif teks yang bermakna. |
| Diktat sebagai review | Setiap konsep inti memiliki ringkasan yang cukup untuk mengingat kembali, satu pertanyaan recall/penerapan yang menguji penalaran sesuai tujuan, serta jawaban yang dapat diperiksa dan alasan ringkas. Definisi, rumus, notasi, domain, asumsi, syarat, satuan, dan pengecualian tetap konsisten dengan Artikel. Konsep pendukung dipadatkan; materi tambahan tidak menggeser isi inti. | Diktat mengajarkan fakta baru, hanya menamai konsep tanpa membantu mengingat/menerapkan, menghilangkan kondisi yang mengubah hasil, atau memuat cek tanpa jawaban yang dapat diperiksa. |
| Flashcard | Satu kartu menguji satu recall target penting yang sudah diajarkan, dengan front spesifik, back tepat, dan tidak duplikatif. | Kartu menjadi mini-Artikel, memuat fakta baru, atau meminta penalaran/keluaran bebas yang tidak atomic. |

### Prioritas materi

Tandai konsep dan unsur sebagai `WAJIB`, `PENDUKUNG`, atau `TAMBAHAN` berdasarkan tujuan resmi dan bukti, bukan panjangnya sumber atau preferensi penulis. `WAJIB` langsung memenuhi tujuan atau menjaga kebenaran keputusan. `PENDUKUNG` menjelaskan prasyarat, hubungan, contoh, atau kesalahan yang diperlukan untuk memahami konsep wajib. `TAMBAHAN` berguna untuk pendalaman tetapi tidak dibutuhkan untuk tujuan scope.

Pertahankan seluruh primary Idea yang diwajibkan contract. Di Diktat, semua konsep wajib tetap mendapat pengingat dan cek; padatkan pendukung tanpa menghapus hubungan yang diperlukan; hilangkan tambahan hanya bila bukan bagian coverage wajib. Jangan menyelesaikan konflik halaman dengan menghapus konsep, contoh pembeda, asumsi, atau syarat kebenaran.

### Profil bidang yang relevan

Periksa profil sesuai isi dan tujuan. Tandai yang tidak berlaku dengan alasan; jangan menambah unsur hanya untuk memenuhi daftar.

- **Matematika:** definisi formal dan makna, domain/syarat teorema, arti simbol, langkah pemilihan metode, contoh hitung yang representatif, kasus batas, kaitan aljabar-grafik bila membantu, dan pemeriksaan hasil.
- **Fisika/teknik:** besaran dan satuan, model/asumsi, arah atau diagram sistem, kondisi rumus, cek dimensi/tanda/kewajaran, serta batas model ideal bila menentukan jawaban.
- **Kimia/biologi/kesehatan:** struktur atau proses berlabel, tingkat pengamatan/model, arah dan kondisi reaksi, hubungan mekanisme dengan hasil, dan sumber resmi mutakhir bila klaim sensitif atau berubah.
- **Statistika/data:** jenis data, pemilihan metode, asumsi, ketidakpastian, interpretasi, batas kesimpulan, serta beda asosiasi dan sebab-akibat.
- **Komputasi:** input/output, langkah atau invariants algoritma, contoh jejak, kasus batas, dan biaya/kinerja bila termasuk tujuan.
- **Hukum, kebijakan, sosial, ekonomi, sejarah, dan humaniora:** konteks waktu/yurisdiksi bila relevan, pembedaan fakta dengan tafsir, bukti dan asumsi, alternatif atau keberatan penting, serta batas kesimpulan.

## Keterbacaan dan bukti teknis

Pemeriksaan author hanya dapat menilai konten dan payload yang ditulis. Jangan menyatakan materi telah diuji pada mahasiswa, divalidasi ahli, memenuhi WCAG, berfungsi di browser, atau dapat diakses pembaca layar tanpa bukti aktual. Catat hal tersebut `NOT_TESTED` bila relevan.

Untuk Diktat PDF, gunakan A4 dengan body font tetap 10.5 pt tanpa auto-shrink. Tujuan editorialnya paling ringkas yang tetap lengkap dan mudah dibaca, maksimal 4 halaman, tanpa target minimum atau filler. Contract menerima 1 sampai 4 halaman; hasil 1 halaman dapat lulus bila lengkap, terbaca, dan semua pemeriksaan readiness selesai. Jangan menurunkan ukuran teks untuk mencapai batas halaman.

`VERIFIED` membutuhkan Diktat dengan checksum yang sama, renderer dan print profile tercatat, jumlah halaman terukur, serta inspeksi setiap halaman. Periksa rumus/glyph, pemotongan, urutan dan pemisahan konten, footer, teks yang dapat dipilih/dicari, dan tampilan pada layar/cetak jika perangkat uji tersedia. Jika tag PDF, bookmark, kontras, navigasi, atau cetak fisik tidak benar-benar diuji, tandai `NOT_TESTED`; jangan mengklaimnya dari render layar saja.

Pemeriksaan responsif, tautan/navigasi aktual, keyboard, pembaca layar, kontras WCAG, metadata PDF bertag, dan fallback saat konten interaktif gagal merupakan bukti terpisah dari author preflight. Uji mahasiswa yang sah mengamati mahasiswa dengan pengetahuan awal berbeda, belajar mandiri, mengerjakan soal baru, dan diuji lagi setelah jeda; catat metode serta hasil jika tersedia. Uji mahasiswa, review ahli, dan hasil belajar yang belum dilakukan berstatus `NOT_TESTED`. Nilai efektivitas tidak dapat disimpulkan dari mutu tulisan, kepuasan, rasa percaya diri, jumlah halaman, atau satu kali review.

## Hard fail dan siklus perbaikan

Jangan submit jika terdapat kesalahan akademik penting, tujuan wajib tidak tercakup, prasyarat penentu tidak tersedia, pertentangan tanpa penjelasan, jawaban/pembahasan menyesatkan, klaim tanpa sumber, atau visual yang mengajarkan hubungan salah. Status `NOT_TESTED` tidak otomatis menghentikan draft, tetapi harus diungkapkan dan tidak boleh diubah menjadi `PASS`.

Critic menjalankan rubrik secara mandiri setelah draft digabung. Creator memperbaiki semua `FAIL`, lalu critic dan Student POV membaca ulang versi/checksum terbaru. Ulangi sampai tidak ada hard fail atau blocker yang tak dapat diatasi dengan bukti/contract yang tersedia. Bila masalah bertahan setelah dua pendekatan, diagnosis akar masalah dan coba opsi lain sebelum berhenti. Berhenti hanya saat ada blocker sumber, scope, contract, akses, atau otorisasi; catat semua percobaan dan status yang belum selesai.
