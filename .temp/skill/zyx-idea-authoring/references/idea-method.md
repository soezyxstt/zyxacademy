# Idea method

Idea adalah unit makna akademik terkecil yang stabil untuk diajar, dihubungkan, diukur, dan dilacak. Idea bukan keyword, judul bab, paragraf besar, learning objective majemuk, atau formula tanpa arti dan kondisi.

## Granularitas

Pisah kandidat bila dua klaim dapat benar secara independen, satu konsep dapat dipahami tanpa yang lain, atau prosedur memiliki keputusan yang dapat digunakan ulang. Gabungkan hanya paraphrase dari proposisi yang sama atau fragmen yang tidak dapat berdiri sendiri.

`canonicalStatement` memuat satu proposisi. `conciseExplanation` menerangkan makna, batas, intuisi, atau konsekuensi operasional tanpa menambah klaim lain.

## Discovery loop

Untuk satu batch source unit:

1. Inventarisasi definisi, klaim, formula, prosedur, pola contoh, constraint, miskonsepsi, dan aplikasi.
2. Simpan lokasi dan evidence sebelum menulis ulang.
3. Normalisasi kandidat lintas dokumen.
4. Tulis field canonical.
5. Audit dengan konteks terpisah.
6. Revisi hanya item gagal.
7. Audit ulang.

## Provenance

Setiap Idea memiliki bukti primer. Bukti pendukung boleh lebih dari satu. Jangan menjadikan ringkasan agent sebagai provenance. Offset provenance harus berada di dalam chunk dan checksum harus exact.

Soal dan solusi dari Source Pack dapat mendukung Idea konsep, prosedur, contoh, miskonsepsi, atau assessment support. Jangan menyalin satu stem soal menjadi canonical statement. Jangan menetapkan apakah soal tersebut akan masuk bank soal; keputusan Product dan provenance ITB berada pada workflow Product Bundle.

## Coverage

Gunakan status `direct`, `supporting`, `example`, `assessment_only`, `excluded`, atau `gap`. Require zero gap. Review semua exclusion. Audit formula, condition, exception, misconception, application, dan visual explanation secara terpisah karena bagian ini paling mudah hilang.

Lakukan reverse audit. Hapus Idea yang tidak memiliki bukti atau hanya berasal dari pengetahuan model.
