# Product Bundle V3 editorial guide

Gunakan panduan ini untuk menulis konten mahasiswa. Kontrak JSON dan quality report MCP tetap authoritative untuk schema/runtime, tetapi hasil validator tidak menggantikan penilaian editorial.

## 1. Peran produk tidak boleh tertukar

Product Bundle V3 hanya memiliki tiga fungsi learner-facing:

- **Artikel**: satu-satunya bacaan utama mahasiswa untuk belajar isi bab dari awal.
- **Diktat**: ringkasan review setelah Artikel, terutama sebelum ujian.
- **Flashcard**: active recall untuk membantu ingatan atas hal yang sudah dipelajari.

Konsekuensinya:

1. mahasiswa harus dapat mencapai tujuan belajar dengan Artikel tanpa membuka Source Pack, Idea Bundle, Diktat, flashcard, atau PDF sumber;
2. Diktat tidak boleh memuat pengetahuan learner-facing yang tidak ada pada Artikel;
3. flashcard tidak boleh memuat target recall yang belum diajarkan pada Artikel;
4. question/solution/assessment blueprint bukan bagian authoring Product Bundle V3.

Jika fakta penting ditemukan saat membuat Diktat/flashcard tetapi belum ada di Artikel, **perbaiki Artikel terlebih dahulu**.

## 2. Pisahkan struktur internal dan bahasa mahasiswa

Buat peta kerja internal `ideaId -> nama konsep mahasiswa`. ID internal hanya boleh berada pada `ideaLinks`, `sourceRefs`, dependency, lineage, `learningSectionId`, dan field `ideaIds` yang tidak dirender.

Jangan tampilkan kode Idea, UUID, source ID, chunk ID, excerpt ID, benchmark ID, storage key, atau istilah pipeline pada title dan learner-facing content. Gunakan nama konsep alami.

## 3. Mulai dari outline pedagogis

Gunakan `learningSections` Idea Bundle sebagai dasar, tetapi urutan sumber boleh diubah menjadi urutan belajar yang lebih masuk akal selama coverage/provenance tetap lengkap.

Struktur chapter wajib:

1. satu `overview` yang mengaktifkan prasyarat, menjelaskan tujuan chapter, dan memberi peta belajar;
2. satu atau lebih `topic`, masing-masing terhubung tepat ke satu `learningSectionId`;
3. satu `summary` yang menyintesis hubungan antartopik dan memuat pemeriksaan akhir.

Hierarki maksimal tiga tingkat. Simpan `parentSectionId`, `slug`, dan `orderIndex`; nomor tampilan dihitung aplikasi.

## 4. Ketuntasan topic

Panjang topic mengikuti pekerjaan yang diperlukan untuk mencapai tujuan belajar. Jangan menetapkan target kata atau durasi sebelum konten direncanakan.

Setiap topic wajib memiliki:

- tujuan belajar yang dapat diamati;
- prasyarat yang diperlukan atau remediasi singkat;
- penjelasan inti yang menjawab pertanyaan konsep;
- Idea dan source provenance pada section serta block;
- minimal satu cek pemahaman dengan jawaban dan pembahasan.

Jika relevan untuk tujuan, topic juga harus memiliki representasi formal, arti simbol, kondisi/batas berlaku, worked example, visual, miskonsepsi/counterexample, atau aplikasi.

Topic singkat sah bila tuntas. Topic panjang harus dipecah bila memuat lebih dari satu keputusan belajar utama atau sulit dinavigasi. Jangan menambah filler untuk mengejar metrik.

## 5. Rencana pedagogi sebelum drafting

Untuk setiap topic, catat terlebih dahulu:

- tujuan terukur dan Idea yang dicakup;
- prasyarat internal/eksternal serta remediasi;
- urutan intuisi → representasi formal → kondisi/batas;
- worked example yang menyelesaikan masalah penting beserta alasan tiap langkah dan verifikasi;
- cek formatif yang selaras dengan tujuan, jawaban, dan pembahasan;
- miskonsepsi/counterexample yang relevan;
- visual/representasi alternatif yang membawa informasi dan fallback-nya.

Gunakan status typed `applicable`/`inapplicable` beserta reason enum contract untuk elemen kondisional. Jangan membuat analogi, grafik, formula, counterexample, atau contoh hanya agar section terlihat lengkap.

## 6. Block semantik

Setiap block menyimpan `blockType`, optional `title`, `contentMarkdown`, `ideaIds`, dan `sourceRefs` sebagai field nyata. Jangan memasukkan JSON metadata ke `contentMarkdown`.

Gunakan block sesuai fungsi:

- `explanation`: penjelasan inti;
- `verbal_representation`: intuisi konseptual;
- `mathematical_representation`: notasi/formula;
- `worked_example`: contoh bertahap;
- `analogy`: analogi beserta batasnya;
- `application`: situasi penggunaan;
- `misconception`: kesalahan umum dan koreksi;
- `retrieval_prompt`: cek pemahaman topic;
- `prior_knowledge_activation` / `problem_introduction`: overview;
- `cross_idea_synthesis`, `summary`, `retrieval_close`: penutup chapter.

Formula harus menjelaskan simbol, asumsi, kondisi berlaku, dan interpretasi hasil. Visual harus membawa informasi serta memiliki fallback teks.

## 7. Alur baca Artikel

Tulis setiap topic sebagai unit belajar mandiri:

1. buka dengan masalah/pertanyaan/fenomena yang relevan;
2. aktifkan prasyarat bila perlu;
3. berikan intuisi sebelum formalitas;
4. jelaskan konsep, simbol, dan batas berlaku;
5. gunakan contoh/visual bila membantu keputusan;
6. cek pemahaman;
7. tutup dengan transisi singkat.

Heading, tabel, daftar, formula, dan callout dipakai untuk membedakan fungsi, bukan dekorasi. Jangan menghasilkan rentetan paragraf panjang tanpa struktur.

## 8. Self-contained Article gate

Sebelum membuat Diktat atau flashcard, baca Artikel dengan asumsi mahasiswa **hanya memiliki Artikel**.

Untuk setiap tujuan belajar, tanyakan:

- Apakah semua istilah yang dipakai sudah diperkenalkan?
- Apakah semua simbol dan satuan penting dijelaskan sebelum dipakai?
- Apakah kondisi penggunaan rumus/metode dinyatakan?
- Apakah langkah contoh menjelaskan alasan, bukan hanya transformasi?
- Apakah mahasiswa mendapat cara mengecek hasil?
- Apakah miskonsepsi/batas yang menentukan keputusan sudah dijelaskan?
- Apakah cek dapat dijawab dari isi Artikel?

Jika satu jawaban TIDAK dan item itu relevan untuk tujuan, Artikel belum lengkap.

## 9. Cek formatif interaktif

Cek formatif membantu belajar; ia bukan question product dan tidak membuat nilai/mastery.

- `multiple_choice` → evaluator `choice`, tepat satu opsi benar;
- `short_answer` → `text_exact`, jawaban dapat dinormalisasi dengan aman;
- `numeric_answer` → `numeric`, target+toleransi absolut+satuan opsional;
- `conceptual_explanation` → `ai_rubric`, kriteria berbobot, konsep wajib, dan sinyal miskonsepsi.

`feedbackPolicy.hints` maksimal tiga petunjuk progresif, dari umum ke spesifik. Petunjuk pertama tidak boleh membocorkan jawaban. Sebelum reveal, UI learner-facing tidak boleh memuat answer key, tolerance, acceptable answers, rubric, atau misconception signals.

Jika evaluator tidak tersedia, pertahankan `answer` dan `explanation` untuk reveal-only. Pembahasan tetap wajib.

## 10. Worked example

Worked example harus:

1. menyatakan masalah dan data;
2. memilih konsep/metode dengan alasan;
3. menunjukkan langkah penting dalam urutan benar;
4. menjelaskan alasan tiap langkah yang tidak trivial;
5. memeriksa hasil, satuan, domain, atau kewajaran bila relevan.

Jangan mengganti alasan dengan label seperti “analisis” atau “bukti”. Jangan memakai contoh semu yang hanya menyalin formula tanpa keputusan.

## 11. Diktat sebagai review

Diktat diturunkan **setelah Artikel lengkap** dan tidak menambah fakta baru. Pertahankan seluruh Idea penting, formula dan kondisi, langkah cepat, contoh kilat, jebakan, serta retrieval check yang relevan.

Struktur padat yang disarankan:

- peta konsep;
- intisari;
- formula + kondisi;
- langkah cepat/prosedur;
- contoh kilat;
- jebakan/miskonsepsi;
- cek ingatan.

Jika Diktat dapat menggantikan Artikel untuk belajar pertama kali secara penuh, Diktat terlalu panjang. Jika Diktat hanya dapat dipadatkan dengan membuang konsep penting, berhenti untuk keputusan scope; jangan mengecilkan font atau menghapus reasoning penting.

Target 2 to 4 halaman hanya sah dari PDF render nyata. Klaim PDF ready memerlukan checksum Diktat, versi renderer, profil cetak, page count, dan inspeksi halaman. Render gagal/stale, >4 halaman, glyph rusak, formula mentah, clipping, atau halaman kosong memblokir readiness.

## 12. Flashcard sebagai alat ingatan

Ikuti [flashcard-guide.md](flashcard-guide.md). Ringkasannya:

- satu kartu = satu recall target;
- target harus penting untuk diingat;
- jawaban harus sudah diajarkan di Artikel;
- front spesifik tanpa membocorkan jawaban;
- back adalah jawaban lengkap terpendek;
- explanation hanya konteks singkat, bukan materi baru;
- jangan membuat filler atau duplicate paraphrase;
- Idea yang terutama menuntut penalaran tidak wajib punya flashcard.

## 13. Estimasi belajar

Isi `pedagogy.timeEstimate` **setelah** draft tuntas. `readingMinutes`, `examplesMinutes`, dan `practiceMinutes` adalah estimasi perencanaan mahasiswa, bukan target yang memaksa penambahan/pengurangan isi.

## 14. Empat lapis keputusan

Jangan menyatukan:

1. **Author preflight**: ketuntasan, alur, relevansi, source grounding, bahasa mahasiswa, Article/Diktat/flashcard role.
2. **MCP validation**: schema, checksum, provenance, dependency, contract, policy deterministik.
3. **Admin pedagogic review**: penilaian manusia pada revisi/policy version yang tepat.
4. **Publication readiness**: validation + review fresh + PDF ready + blocker lain nol.

`valid: true` tidak berarti review pedagogi lulus atau siap publish.

## 15. Preflight author

Sebelum validation dan setelah setiap revisi:

1. zero internal-ID leak;
2. overview, topic, summary, final check tersedia;
3. setiap Idea punya tepat satu topic utama dan source trace lengkap;
4. setiap tujuan memiliki explanation dan understanding check dengan jawaban+pembahasan;
5. Article lulus self-contained gate;
6. formula, kondisi, tabel, visual fallback, dan semantic callout benar;
7. worked example menjelaskan alasan langkah;
8. evaluator cek sesuai `checkKind`, hints maksimal tiga, tidak membocorkan kunci;
9. filler dan block tak relevan dihapus;
10. derived Markdown setara dengan section/block order;
11. Diktat tidak menambah fakta dan tetap review ringkas;
12. flashcard lulus `flashcard-guide.md` dan tidak menambah fakta;
13. estimasi belajar dihitung setelah konten tuntas.

Panggil `authoring.validate_product_bundle` hanya setelah preflight lulus. Setelah revisi, ulangi preflight dan anggap review/PDF evidence lama stale sampai checksum/fingerprint kembali cocok.