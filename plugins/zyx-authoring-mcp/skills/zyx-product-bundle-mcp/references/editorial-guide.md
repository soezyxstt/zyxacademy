# Product Bundle editorial guide

Gunakan panduan ini untuk menulis konten mahasiswa. Kontrak JSON dan quality report MCP tetap authoritative, tetapi angka hijau tidak menggantikan penilaian editorial.

## 1. Pisahkan metadata internal dan bahasa mahasiswa

Sebelum menulis, buat peta kerja internal:

```text
<ideaId internal> -> <nama konsep mahasiswa 2 sampai 8 kata>
```

Contoh benar: `Kinematika Benda Tegar`, `Konservasi Momentum Sudut`, `Diagram Benda Bebas`.

Gunakan ID internal hanya pada `ideaLinks`, `ideaRelations`, `sourceRefs`, dependencies, lineage, dan metadata `ideaIds` milik block. Jangan menampilkan ID itu pada teks yang dibaca mahasiswa.

Larangan learner-facing:

- heading seperti `IDEA-001` atau `Idea 3`;
- kalimat seperti `berdasarkan IDEA-001`, `pada block Idea`, atau `lihat source-doc-02`;
- UUID, database ID, source ID, chunk ID, excerpt ID, benchmark ID, dan stable product ID;
- placeholder teknis sebagai pengganti nama konsep.

Larangan berlaku pada `title`, Article `blocks[].content`, Diktat `contentMarkdown`, flashcard `front`, `back`, dan `explanation`, question `prompt` dan `options[].text`, solution `content`, serta blueprint `title`.

## 2. Artikel adalah mini e-book mandiri

Artikel dipakai untuk belajar pertama kali. Mahasiswa harus dapat memahami bab tanpa melihat Source Pack atau daftar Idea. Artikel bukan kumpulan definisi dan bukan ebook penuh yang membahas semua kemungkinan variasi.

### Budget Artikel

Misalkan `N` adalah jumlah Idea linked pada Artikel.

- minimum total kata: `max(1800, N * 280)`;
- minimum penjelasan efektif per Idea: `220` kata setelah pembagian block multi-Idea;
- target editorial: minimum tersebut sampai sekitar `1,4 kali minimum`, kecuali source memang membutuhkan lebih banyak;
- `worked_example`: minimal `ceil(N / 6)`;
- `analogy`: minimal `ceil(N / 8)`;
- visual bermakna: minimal `ceil(N / 8)`;
- `retrieval_prompt`: minimal `ceil(N / 6)`.

Jangan menambah filler untuk mengejar angka. Setiap paragraf harus menjelaskan konsep, hubungan, kondisi, alasan, langkah, atau konsekuensi.

### Urutan block wajib

Gunakan nama `blockType` exact berikut.

Untuk dokumen:

1. `prior_knowledge_activation`: prasyarat yang benar-benar dibutuhkan, bukan daftar panjang.
2. `problem_introduction`: masalah inti bab dan alasan mahasiswa perlu memahaminya.
3. block per Idea dalam urutan pedagogis.
4. `cross_idea_synthesis` bila `N > 1`: jelaskan hubungan antarkonsep dengan bahasa alami.
5. `summary`: rangkum keputusan, konsep, formula, dan batas penggunaan.
6. `retrieval_close`: pertanyaan penutup tanpa langsung membocorkan semua jawaban.

Untuk setiap Idea:

1. `explanation`: jawaban ringkas terhadap pertanyaan inti konsep.
2. `verbal_representation`: intuisi dan penjelasan dengan kata-kata.
3. `mathematical_representation`: definisi formal, notasi, formula, arti simbol, kondisi berlaku, dan satuan bila relevan.
4. `analogy`: analogi yang memetakan bagian analogi ke konsep serta menjelaskan batas analoginya.
5. `worked_example`: contoh bertahap, alasan tiap langkah, dan pemeriksaan hasil.
6. `misconception`: kesalahan umum, mengapa salah, dan cara mengenalinya.
7. `application`: use case yang relevan atau situasi ketika konsep dipakai.
8. `retrieval_prompt`: pertanyaan singkat yang menguji pemahaman, bukan sekadar hafalan istilah.

Block `mathematical_representation`, `analogy`, `worked_example`, atau `misconception` hanya boleh ditandai `inapplicable` dengan typed reason yang benar-benar jujur. Jangan memakai `inapplicable` untuk menghemat pekerjaan.

### Aturan penulisan Artikel

- Mulai dari pertanyaan atau fenomena, lanjutkan ke intuisi, lalu formalisasi.
- Definisikan simbol sebelum digunakan. Tulis LaTeX seimbang dan gunakan bentuk benar seperti `\pm`, bukan `+-` atau `-+`.
- Formula harus disertai makna, asumsi, batas berlaku, dan interpretasi hasil.
- Use case harus menjawab kapan konsep berguna. Jangan menambah aplikasi generik yang tidak membantu memahami bab.
- Analogi harus mengajar mekanisme dan menyebutkan batas kemiripan.
- Worked example harus cukup penting untuk mengungkap cara berpikir, bukan hanya substitusi angka tanpa alasan.
- Masalah penting boleh muncul sebagai worked example atau retrieval prompt. Jangan membuat bank latihan berlebihan di Artikel.
- Visual harus membawa informasi: tabel perbandingan, diagram, flowchart, sketsa grafik, atau representasi lain yang dapat dibaca tanpa caption kosong.
- Hindari pengulangan isi yang sama pada beberapa block. Hubungkan konsep dengan transisi alami.
- Jangan menyebut proses authoring, validator, source pack, provenance, atau status Idea pada prosa mahasiswa.

### Atribusi block multi-Idea

Jika Artikel menautkan lebih dari satu Idea, setiap block wajib membawa `ideaIds` secara eksplisit di metadata `content`. ID ini tidak boleh muncul di nilai `content` yang dibaca mahasiswa.

```json
{
  "id": "article-block-semantic-name",
  "blockType": "cross_idea_synthesis",
  "orderIndex": 12,
  "content": "{\"content\":\"## Hubungan Gerak Translasi dan Rotasi\\nTeks mahasiswa memakai nama konsep alami.\",\"ideaIds\":[\"<internal-idea-id-1>\",\"<internal-idea-id-2>\"]}"
}
```

Untuk Artikel satu Idea, plain Markdown tetap sah. Walau demikian, gunakan metadata eksplisit bila block mempunyai scope yang lebih sempit daripada seluruh Artikel.

## 3. Diktat adalah review 2 sampai 4 halaman

Diktat dipakai setelah mahasiswa belajar dari Artikel. Diktat bukan mini e-book kedua, bukan salinan Artikel, dan bukan tempat memperkenalkan fakta baru.

### Budget Diktat

Targetkan 1.200 sampai 1.600 kata Bahasa Indonesia dengan tabel dan formula yang padat. Hitung minimum validator:

```text
minimumWords = max(1200, N * 35, ceil(articleWordCount * 0.12))
```

Jika `minimumWords > 1600`, ikuti minimum validator dan jaga struktur tetap ringkas. Laporkan risiko melewati 4 halaman.

Minimum elemen:

- heading: `max(4, ceil(N / 8))`;
- contoh: `max(2, ceil(N / 6))`;
- visual: `max(1, ceil(N / 10))`;
- jebakan: `max(2, ceil(N / 8))`;
- retrieval: `max(2, ceil(N / 8))`;
- formula: `max(3, ceil(N / 6))`.

### Struktur Diktat

Gunakan struktur ringkas berikut dan sesuaikan nama heading dengan bab:

1. `# <Nama Bab>` dan tujuan review satu paragraf.
2. `## Peta Konsep`: tabel atau diagram hubungan konsep.
3. `## Intisari Konsep`: bullet padat per konsep dengan istilah manusiawi.
4. `## Formula Penting`: formula, arti simbol, kondisi penggunaan, dan satuan.
5. `## Langkah Cepat`: prosedur atau decision flow bila relevan.
6. `## Contoh Kilat`: minimal dua contoh singkat yang menunjukkan keputusan penting.
7. `## Jebakan dan Miskonsepsi`: minimal dua kesalahan nyata beserta koreksi.
8. `## Cek Ingatan`: minimal dua prompt aktif tanpa jawaban panjang tepat di bawahnya.

Gunakan kata pemicu yang dikenali validator secara alami:

- contoh: `Contoh Kilat`, `Contoh Singkat`, atau `Contoh Soal`;
- jebakan: `Jebakan`, `Miskonsepsi`, `Kesalahan Umum`, `Hati-hati`, atau `Peringatan`;
- retrieval: `Cek Ingatan`, `Uji Pemahaman`, atau `Coba Jawab`;
- visual: tabel Markdown, `Diagram:`, `Flowchart:`, `Sketsa Grafik:`, `Garis Bilangan:`, atau code block `mermaid`, `text`, atau `ascii`.

Labeli setiap contoh, jebakan, dan retrieval item secara terpisah dengan istilah yang sesuai. Satu heading tidak mewakili dua item. Setiap elemen harus bermakna; jangan menggandakan label hanya untuk menaikkan count.

### Aturan kompresi Diktat

- Pertahankan tepat seluruh Idea yang ditautkan Artikel.
- Pertahankan formula inti, kondisi, batas, dan source trace.
- Ringkas narasi, derivasi panjang, analogi panjang, dan contoh tambahan.
- Jangan memperkenalkan definisi, formula, klaim, atau contoh yang tidak ada atau tidak didukung Artikel.
- Gunakan bullet, tabel, dan langkah bernomor untuk meningkatkan densitas.
- Bila Diktat masih dapat menggantikan Artikel untuk belajar pertama kali secara penuh, Diktat terlalu panjang atau terlalu naratif.
- Bila Diktat hanya berupa formula tanpa makna, kondisi, jebakan, dan retrieval, Diktat terlalu tipis.

## 4. Produk learner-facing lain

- Flashcard harus atomic dan hanya menguji satu keputusan, konsep, hubungan, atau formula. Jangan menanyakan `Apa itu IDEA-001?`.
- Question Product hanya menyalin contoh soal ITB yang diizinkan. Jangan mengubah angka, kondisi, event label, atau attribution.
- Solution menjelaskan alasan dan langkah menggunakan nama konsep alami. Jangan menulis `soal ini memakai Idea X`.
- Blueprint title memakai tujuan asesmen yang manusiawi. ID pertanyaan tetap hanya pada `questionIds`.

## 5. Preflight editorial deterministik

Jalankan semua pemeriksaan sebelum validasi dan ulangi setelah setiap revisi.

1. **ID leak**: cari pada learner-facing fields, case-insensitive, pola `IDEA-`, `idea-`, `source-doc-`, `chunk-`, `excerpt-`, `benchmark-`, UUID, `block Idea`, dan `berdasarkan Idea`. Hasil harus nol. Jangan mencari pada metadata struktural.
2. **Nama konsep**: setiap title dan heading harus dapat dipahami mahasiswa tanpa mengetahui pipeline.
3. **Coverage Artikel**: setiap Idea memiliki delapan block per-Idea atau typed inapplicability yang jujur, kedalaman efektif minimal 220 kata, dan source trace.
4. **Kelengkapan Artikel**: semua document block tersedia; Artikel multi-Idea memiliki `cross_idea_synthesis` dan atribusi metadata setiap block.
5. **Mutu Artikel**: contoh menyelesaikan masalah penting, analogi memiliki batas, visual membawa informasi, formula terbaca, dan tidak ada filler.
6. **Diktat versus Artikel**: Idea set sama, lineage cocok, tidak ada klaim baru, target 1.200 sampai 1.600 kata atau minimum MCP, dan terasa seperti review cepat.
7. **Count Diktat**: hitung heading, contoh, visual, jebakan, retrieval, dan formula menggunakan budget di atas.
8. **Formula**: periksa delimiter, simbol, subscript, superscript, `\pm`, satuan, asumsi, dan hasil contoh. Jangan loloskan `+-`, `-+`, atau LaTeX rusak.
9. **Produk lain**: flashcard atomic, question identik dengan sumber ITB, solution lengkap, dan seluruh learner text bebas ID.
10. **Student read**: baca title, satu bagian Artikel, Diktat penuh, satu flashcard, satu question, dan satu solution seolah-olah tidak pernah melihat Idea Bundle. Jika ada jargon pipeline atau konteks hilang, revisi.

Panggil `authoring.validate_product_bundle` hanya setelah preflight ini lulus. Setelah MCP hijau, cek preflight sekali lagi karena revisi teknis dapat merusak kualitas editorial.
