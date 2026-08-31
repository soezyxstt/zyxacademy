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

## 3. Ukuran dan kelengkapan topic

Target satu topic adalah 3 sampai 8 menit baca. Gunakan sekitar 200 kata per menit sebagai estimasi. Hard limit adalah 1.500 kata setara prose per topic.

Setiap topic wajib memiliki:

- tujuan belajar yang dapat diamati;
- penjelasan inti yang menjawab pertanyaan konsep;
- minimal satu pemeriksaan pemahaman;
- Idea dan source provenance pada section serta block.

Topic di bawah target menjadi warning jika tetap tuntas. Jangan menambah filler, mengulang definisi, atau membuat contoh semu hanya untuk mengejar durasi.

## 4. Block semantik

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

## 5. Alur baca

Tulis satu topic sebagai unit belajar mandiri yang tetap memiliki hubungan jelas dengan topic sebelum dan sesudahnya:

1. buka dengan pertanyaan atau fenomena;
2. berikan intuisi sebelum formalisasi;
3. jelaskan konsep dan batas berlaku;
4. gunakan contoh atau visual bila memperjelas keputusan;
5. tutup dengan cek pemahaman dan transisi singkat.

Heading, tabel, daftar, formula, dan callout harus dipakai untuk membedakan konteks. Jangan menghasilkan satu rentetan paragraf panjang.

## 6. Diktat sebagai review

Diktat diturunkan dari Artikel yang disetujui dan tidak menambah fakta baru. Targetnya 2 sampai 4 halaman render, sekitar 1.200 sampai 1.600 kata, dengan Idea set, formula penting, kondisi penggunaan, source trace, contoh kilat, jebakan, dan cek ingatan yang sama.

Gunakan struktur padat: peta konsep, intisari, formula penting, langkah cepat, contoh kilat, jebakan, dan cek ingatan. Bila Diktat dapat menggantikan Artikel untuk belajar pertama kali secara penuh, Diktat terlalu panjang.

## 7. Produk lain

- Flashcard menguji satu konsep atau keputusan.
- Question Product hanya menyalin contoh soal ITB yang diizinkan tanpa mengubah angka atau kondisi.
- Solution menjelaskan alasan dan langkah dengan istilah manusiawi.
- Blueprint hanya merujuk question yang ada dalam bundle.

## 8. Preflight editorial

Sebelum validasi dan setelah setiap revisi:

1. pastikan zero internal-ID leak pada learner-facing fields;
2. pastikan overview, topic, summary, dan final check tersedia;
3. pastikan setiap Idea memiliki tepat satu topic utama dan seluruh source trace lengkap;
4. hitung kata serta estimasi baca setiap topic, tidak ada topic di atas 1.500 kata;
5. pastikan tiap topic memiliki objective, explanation, dan understanding check;
6. periksa formula, tabel, visual fallback, dan semantic callout;
7. hapus filler serta block yang tidak relevan;
8. pastikan derived Markdown tetap setara dengan urutan section dan block;
9. pastikan Diktat tetap ringkas dan lineage-nya cocok;
10. baca satu topic seolah-olah tidak pernah melihat Source Pack atau Idea Bundle.

Panggil `authoring.validate_product_bundle` hanya setelah preflight lulus.
