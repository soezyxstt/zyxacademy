# Product Bundle V3 editorial guide

Gunakan panduan ini untuk menulis konten mahasiswa. Kontrak JSON dan quality report MCP tetap authoritative, tetapi hasil validator tidak menggantikan penilaian editorial.

## 1. Pisahkan struktur internal dan bahasa mahasiswa

Buat peta kerja internal `ideaId -> nama konsep mahasiswa`. ID internal hanya boleh berada pada `ideaLinks`, `sourceRefs`, dependency, lineage, `learningSectionId`, dan field `ideaIds`.

Jangan tampilkan kode Idea, UUID, source ID, chunk ID, excerpt ID, benchmark ID, atau istilah pipeline pada title dan learner-facing content. Gunakan nama konsep alami seperti `Bilangan Real`, `Pertidaksamaan Rasional`, atau `Domain Fungsi`.

## 2. Mulai dari outline pedagogis

Gunakan `learningSections` Idea Bundle sebagai tulang punggung, tetapi urutan sumber boleh diubah menjadi urutan belajar yang lebih masuk akal. Semua pemetaan Idea dan sumber harus tetap lengkap.

Struktur chapter wajib:

1. satu `overview` yang mengaktifkan prasyarat, menjelaskan tujuan chapter, dan memberi peta belajar;
2. satu atau lebih `topic`, masing-masing terhubung tepat ke satu `learningSectionId`;
3. satu `summary` yang menyintesis hubungan antartopik dan memuat pemeriksaan akhir.

Hierarki maksimal tiga tingkat. Simpan `parentSectionId`, `slug`, dan `orderIndex`; jangan menulis nomor `1.1` ke data karena aplikasi menghitungnya dari hierarki.

## 3. Ketuntasan topic dan estimasi belajar

Panjang topic mengikuti pekerjaan yang diperlukan untuk mencapai tujuan belajar. Jangan menetapkan target kata atau durasi sebelum konten direncanakan. Setelah draft tuntas, isi `pedagogy.timeEstimate` memakai `readingMinutes`, `examplesMinutes`, dan `practiceMinutes` sebagai metadata perencanaan mahasiswa, bukan target yang harus dikejar.

Setiap topic wajib memiliki:

- tujuan belajar yang dapat diamati;
- penjelasan inti yang menjawab pertanyaan konsep;
- minimal satu pemeriksaan pemahaman;
- Idea dan source provenance pada section serta block.

Topic yang singkat tetap sah bila tujuan, prasyarat, penjelasan, dan ceknya tuntas. Topic panjang harus dipecah ketika memuat lebih dari satu keputusan belajar utama atau sulit dinavigasi. Jangan menambah filler, mengulang definisi, atau membuat contoh semu untuk mengejar metrik.

## 4. Rencana pedagogi sebelum drafting

Untuk setiap topic, catat terlebih dahulu:

- tujuan terukur dan Idea yang dicakup;
- prasyarat internal atau eksternal serta dukungan remediasinya;
- urutan intuisi, representasi formal, kondisi berlaku, dan batas konsep;
- worked example yang menyelesaikan masalah penting beserta alasan tiap langkah dan verifikasi;
- cek formatif yang selaras dengan tujuan, jawaban, dan pembahasan;
- miskonsepsi atau counterexample yang relevan;
- visual atau representasi alternatif yang membawa informasi dan fallback-nya.

Gunakan status typed `applicable` atau `inapplicable` beserta reason enum yang tersedia pada block kondisional sesuai kontrak. Jangan mengisi analogi, grafik, formula, atau counterexample yang tidak relevan hanya untuk terlihat lengkap.

## 5. Block semantik

Setiap block menyimpan `blockType`, optional `title`, `contentMarkdown`, `ideaIds`, dan `sourceRefs` sebagai field nyata. Jangan memasukkan JSON metadata ke `contentMarkdown`.

Gunakan block berikut sesuai kebutuhan:

- `explanation` untuk penjelasan inti;
- `verbal_representation` untuk intuisi konseptual;
- `mathematical_representation` untuk notasi dan formula;
- `worked_example` untuk contoh bertahap;
- `analogy` untuk analogi beserta batasnya;
- `application` untuk situasi penggunaan;
- `misconception` untuk kesalahan umum dan koreksi;
- `retrieval_prompt` untuk cek pemahaman topic;
- `prior_knowledge_activation` dan `problem_introduction` untuk overview;
- `cross_idea_synthesis`, `summary`, dan `retrieval_close` untuk penutup chapter.

Contoh, analogi, visual, formula, penerapan, dan miskonsepsi hanya wajib jika relevan. Validator tidak boleh mendorong author membuat filler. Formula harus menjelaskan simbol, asumsi, kondisi berlaku, dan interpretasi hasil. Visual harus membawa informasi serta memiliki fallback teks.

## 6. Alur baca

Tulis satu topic sebagai unit belajar mandiri yang tetap memiliki hubungan jelas dengan topic sebelum dan sesudahnya:

1. buka dengan pertanyaan atau fenomena;
2. berikan intuisi sebelum formalisasi;
3. jelaskan konsep dan batas berlaku;
4. gunakan contoh atau visual bila memperjelas keputusan;
5. tutup dengan cek pemahaman dan transisi singkat.

Heading, tabel, daftar, formula, dan callout harus dipakai untuk membedakan konteks. Jangan menghasilkan satu rentetan paragraf panjang.

## 7. Contoh bersyarat, limit

Pada topik limit epsilon-delta, rencana yang baik dapat mencakup urutan quantifier, ketergantungan delta pada epsilon, pengecualian `x = c`, visual pita epsilon-delta dengan fallback tabel, worked example, verifikasi substitusi, fungsi konstan, counterexample lompatan, serta cek verbal, matematis, dan reflektif. Ini contoh penerapan untuk materi limit, bukan template wajib bagi jaringan komputer, sejarah, atau topik lain.

## 8. Diktat sebagai review

Diktat diturunkan dari Artikel yang disetujui dan tidak menambah fakta baru. Pertahankan Idea set, formula penting, kondisi penggunaan, source trace, contoh kilat, jebakan, dan cek ingatan yang relevan. Ringkas sampai cocok sebagai review, kemudian render dengan fasilitas PDF. Target 2 sampai 4 halaman adalah hasil render nyata, bukan perkiraan dari jumlah kata.

Gunakan struktur padat: peta konsep, intisari, formula penting, langkah cepat, contoh kilat, jebakan, dan cek ingatan. Bila Diktat dapat menggantikan Artikel untuk belajar pertama kali secara penuh, Diktat terlalu panjang.

Jangan menulis “PDF sesuai” dari Markdown, validator MCP, atau perkiraan panjang. Klaim itu memerlukan artefak PDF, checksum Diktat, versi renderer, profil cetak, page count, dan inspeksi setiap halaman. Render gagal, stale, lebih dari 4 halaman, glyph rusak, formula mentah, teks terpotong, atau halaman kosong memblokir publikasi sampai dirender ulang.

## 9. Produk lain

- Flashcard menguji satu konsep atau keputusan.
- Question Product hanya menyalin contoh soal ITB yang diizinkan tanpa mengubah angka atau kondisi.
- Solution menjelaskan alasan dan langkah dengan istilah manusiawi.
- Blueprint hanya merujuk question yang ada dalam bundle.

## 10. Empat lapis keputusan

Jangan menyatukan empat hasil berikut:

1. **Preflight author** menilai ketuntasan tujuan, alur belajar, relevansi elemen, source grounding, dan bahasa mahasiswa sebelum MCP.
2. **Validator MCP** menilai schema, checksum, provenance, dependency, contract, dan quality policy deterministik. `valid: true` belum berarti review pedagogi disetujui.
3. **Review admin** menilai delapan kriteria pedagogi pada revisi dan policy version yang tepat. Edit Artikel atau Diktat membuat bukti lama stale.
4. **Kesiapan publikasi** baru tercapai bila validator hijau, review admin lengkap dan fresh, PDF ready dengan lineage yang cocok, serta tidak ada blocker lain.

## 11. Preflight author

Sebelum validasi dan setelah setiap revisi:

1. pastikan zero internal-ID leak pada learner-facing fields;
2. pastikan overview, topic, summary, dan final check tersedia;
3. pastikan setiap Idea memiliki tepat satu topic utama dan seluruh source trace lengkap;
4. pastikan setiap tujuan memiliki explanation, contoh atau representasi yang relevan, dan understanding check dengan jawaban serta pembahasan;
5. hitung estimasi belajar setelah konten tuntas dan pecah topic bila beban kognitif atau navigasinya terlalu padat;
6. periksa formula, kondisi berlaku, tabel, visual fallback, dan semantic callout;
7. hapus filler serta block yang tidak relevan;
8. pastikan derived Markdown tetap setara dengan urutan section dan block;
9. pastikan Diktat tetap ringkas dan lineage Artikel serta Idea-nya cocok;
10. baca satu topic seolah-olah tidak pernah melihat Source Pack atau Idea Bundle.

Panggil `authoring.validate_product_bundle` hanya setelah preflight lulus. Setelah revisi dari MCP atau admin, ulangi preflight dan anggap review serta bukti PDF lama stale sampai terbukti cocok dengan checksum baru.
