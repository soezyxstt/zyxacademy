# Article philosophy and method

## Artikel itu apa

Artikel Zyx adalah dokumen pengajaran utama dan lengkap, bukan blog, ringkasan, outline, transkrip, atau jembatan menuju bacaan lain. Mahasiswa harus bisa mempelajari seluruh scope dari Artikel tanpa memerlukan Source Pack, Diktat, flashcard, solusi, atau pengajar untuk mengisi penalaran yang hilang.

Artikel menjelaskan prerequisite, motivasi masalah, makna verbal, representasi matematis, asumsi, batas berlaku, langkah penggunaan, contoh, penerapan, miskonsepsi, hubungan antar-Idea, dan target retrieval.

## Doktrin kelengkapan

Setiap Idea in-scope diajarkan cukup untuk first-pass learning. Setiap formula mendefinisikan simbol, unit jika relevan, asumsi, interpretasi, dan contoh penggunaan yang aman. Setiap prosedur menjelaskan urutan, keputusan, dan kondisi gagal. Setiap visual explanation yang membawa makna unik diubah menjadi prosa, tabel, daftar terstruktur, atau diagram tekstual.

Jangan menyimpan pengetahuan esensial hanya di produk hilir. Produk lain boleh meringkas, melatih retrieval, atau mengukur pengetahuan Artikel, tetapi tidak boleh menjadi tempat rahasia untuk materi yang hilang.

## Struktur semantik

Gunakan block dokumen `prior_knowledge_activation`, `problem_introduction`, `summary`, dan `retrieval_close`. Gunakan block per Idea `explanation`, `verbal_representation`, `mathematical_representation`, `analogy`, `worked_example`, `misconception`, `application`, dan `retrieval_prompt`. Gunakan `cross_idea_synthesis` untuk hubungan beberapa Idea.

Block opsional hanya boleh dinyatakan tidak berlaku dengan reason bertipe yang diizinkan kontrak. Jangan menghilangkannya diam-diam.

## Rencana part

Jangan langsung menulis Artikel panjang. Buat `article-plan.json`:

1. Urutkan Idea berdasarkan prerequisite.
2. Buat completeness matrix per Idea.
3. Bagi part berdasarkan penutupan konsep.
4. Tetapkan Idea ID, excerpt, prerequisite, block, notasi, dan gate setiap part.
5. Tetapkan janji global: glossary, simbol, unit, asumsi, tone, level mahasiswa, dan kebijakan traceability.

Satu part harus cukup kecil agar semua Idea dan excerpt relevan dapat dimuat tanpa mencampur konteks bab lain.

## Penulisan dan integrasi

Tulis satu part, audit, revisi kegagalan, lalu audit ulang dengan konteks segar. Definisikan notasi sebelum digunakan. Jangan melompati aljabar penting. Worked example harus menunjukkan keputusan, bukan angka saja. Terangkan alasan langkah dan batas validitas.

Sesudah semua part lulus, integrasikan. Periksa terminologi, notasi, transisi, duplikasi, prerequisite, formula, dan urutan. Buat matriks final dari semua Idea dan source unit ke lokasi Artikel. Lakukan fresh student read dan anggap kebutuhan atas pengetahuan yang belum diajarkan sebagai gap.

## Encoding dan render

Block `content` menyimpan JSON deterministik yang berisi learner-facing Markdown, `ideaIds`, `sourceRefs`, `learningPurpose`, `reviewerState`, dan `applicability`. Website mengompilasi learner-facing content menjadi Markdown dan AST. Gunakan Markdown semantik dan LaTeX, bukan trik layout atau referensi gambar biner.

## Gate Artikel

Require 100 persen required block, Idea, factual traceability, dan formula traceability. Require nol unsupported claim, missing prerequisite, unexplained symbol, broken math, unit inconsistency, contradiction, cross-part gap, dan fakta esensial yang hanya ada di produk hilir. Panjang bukan defect jika dibutuhkan untuk lengkap. Panjang tanpa struktur adalah defect.
