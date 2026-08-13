# Product quality gates

Satu gate hanya bernilai `pending`, `failed`, `passed`, `blocked`, atau `skipped`. `skipped` hanya valid untuk family yang tidak dipilih admin. Jangan menurunkan failure menjadi warning.

Require:

- Authoring Job Pack valid dan cocok dengan Authoring Context Pack terbaru.
- Produk hanya berasal dari requested product families.
- Artikel memenuhi completeness doctrine dan compiler strict.
- Idea dan source traceability 100 persen.
- Unsupported claim, stale Idea, missing excerpt, dan hash mismatch berjumlah 0.
- Semua formula, simbol, unit, asumsi, contoh, dan jawaban sudah diverifikasi.
- Diktat memiliki exact Article lineage dan tidak memiliki klaim baru.
- Flashcard atomic, tidak ambigu, dan terdaftar pada set.
- Setiap question memiliki tepat satu solution dan lulus blind solve.
- Setiap question adalah salinan setia contoh ITB dari Source Pack dengan source document dan source unit yang tercatat.
- Setiap question memiliki `itbSource` lengkap, source reference termasuk dalam `itbCuration`, dan event name exact terhadap allowed `sourceLabel`.
- Benchmark `id` yang salah dipakai sebagai reference ID, question buatan Zyx, paraphrase substantif, perubahan angka, holdout reference, source label generik, dan source label hasil tebakan berjumlah 0.
- Family question, solution, dan blueprint berstatus blocked bila dedicated `referenceId`, `sourceLabel`, atau soal sumber tidak tersedia.
- Blueprint hanya memakai question valid dalam bundle.
- Dependency missing, stale, atau cyclic berjumlah 0.
- Semua entity berstatus `draft`.
- Schema, deterministic checksum, dan website validator lulus.

Untuk failure catat issue code, entity, path, expected, observed, dan perbaikan. Jangan package final ketika issue terbuka.
