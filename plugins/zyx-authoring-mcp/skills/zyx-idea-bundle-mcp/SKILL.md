---
name: zyx-idea-bundle-mcp
description: Menghasilkan Idea Bundle V3 dari Source Pack tervalidasi dengan Idea atomic yang dipecah memakai aturan split/merge eksplisit, provenance lengkap, learningSections pedagogis, dan relasi yang dapat dijelaskan. Jangan gunakan untuk membuat Product atau soal.
---

# Zyx Idea Bundle MCP

Gunakan skill ini sebagai instruction layer untuk MCP. Validator repository dan `authoring.validate_idea_bundle` adalah sumber kebenaran schema/checksum/identity/provenance, tetapi author tetap bertanggung jawab atas kualitas pemecahan Idea.

Sebelum mulai, wajib baca:

- [references/workflow.md](references/workflow.md)
- [references/idea-decomposition.md](references/idea-decomposition.md)

## Invariant yang tidak boleh dilanggar

1. Satu Idea mewakili satu klaim, aturan, hubungan, atau kemampuan yang dapat diajarkan dan dinilai secara mandiri.
2. Atomic **bukan** berarti satu kalimat/bullet/formula sumber = satu Idea.
3. Contoh, aplikasi, formula, simbol, kondisi, dan langkah prosedur tidak otomatis menjadi Idea terpisah; gunakan decision rules `idea-decomposition.md`.
4. Dua sumber yang menyatakan pengetahuan sama tidak boleh menghasilkan dua Idea hanya karena provenance berbeda.
5. Setiap Idea wajib source-grounded, punya provenance primer, dan tepat satu primary learning section.
6. Relation hanya dibuat jika maknanya dapat dijelaskan; `related` bukan default untuk semua Idea yang berdekatan.
7. MCP hijau tidak menggantikan split/merge preflight.

## Prasyarat

1. Cari Source Pack valid dengan `source.list_packs`. Jika ada, gunakan token/pack dan baca transkripsi dengan `source.get_pack`; jangan ekstrak PDF ulang tanpa alasan.
2. Jika belum ada Source Pack valid, jalankan `$zyx-source-pack-mcp` sampai `source.ingest` mengembalikan `valid: true`.
3. Panggil `workflow.start` workflow `idea_product` dengan Source Pack serta course/chapter opaque yang sama.
4. Panggil `workflow.get_contract` dan gunakan contract/run context aktif sampai submission.

## Workflow authoring

1. Inventarisasikan seluruh unit sumber: definisi, prinsip, aturan, formula, prosedur, kondisi, contoh, penerapan, miskonsepsi, visual, soal, dan solusi.
2. Buat candidate knowledge map tanpa langsung memberi satu Idea per source fragment.
3. Jalankan **split test** dan **merge test** dari `idea-decomposition.md` pada seluruh kandidat, terutama statement dengan beberapa klausa, formula, prosedur multi-langkah, dan duplikat lintas sumber.
4. Susun `learningSections` dalam urutan pedagogis maksimal tiga tingkat. Setiap section punya tujuan belajar, primary/supporting Idea, dan source chunk; nomor tampilan dihitung aplikasi.
5. Untuk setiap Idea, tulis canonical statement satu target, concise explanation yang tidak menambah target kedua, knowledge kind, instructional role, formula/metadata bila relevan, dan `sourcePolicy: source_grounded`.
6. Buat source material/chunk dari Source Pack tanpa mengubah content. Offset harus exact dan checksum cocok.
7. Beri setiap Idea provenance primer. Jika beberapa sumber mendukung Idea yang sama, pertahankan satu Idea dan provenance yang sesuai, bukan duplicate Idea.
8. Buat relation `prerequisite`, `extends`, `example_of`, `misconception_of`, atau `related` hanya bila memenuhi definisi pada `idea-decomposition.md`. Hindari self relation, endpoint hilang, duplicate, dan prerequisite cycle.
9. Jalankan author preflight decomposition. Periksa split/merge, formula/condition handling, contoh yang salah dijadikan Idea, duplikat lintas sumber, relation semantics, provenance, dan primary section.
10. Package Idea Bundle V3 sesuai canonical ZIP pada workflow reference, seluruh entry regular `0644`, tanpa script/state/binary/archive tambahan.
11. Panggil `authoring.validate_idea_bundle` dan periksa hierarchy, primary coverage, issues, quality issues/metrics, source coverage, duplicate candidate, formula trace warning.
12. Revisi. Setelah revisi substantif, ulangi decomposition preflight sebelum validasi ulang.
13. Panggil `authoring.submit_idea_bundle` hanya saat MCP valid, author preflight lulus, dan staging diotorisasi. MCP tidak mempublikasikan Idea.

## Aturan keputusan penting

- **Definisi + konsekuensi**: pisah bila konsekuensi dapat diajarkan/diuji sendiri.
- **Rumus**: tetap pada Idea konsep yang sama bila hanya representasi; pisah bila merupakan aturan baru dengan kondisi/metode sendiri.
- **Arti simbol**: biasanya metadata/penjelasan, bukan Idea sendiri kecuali maknanya memang konsep target.
- **Prosedur**: satu Idea untuk prosedur utuh jika targetnya satu kemampuan; pisah langkah yang merupakan keputusan penting dan reusable.
- **Contoh**: biasanya provenance/`example_of`, bukan Idea baru.
- **Miskonsepsi**: buat terpisah hanya jika pola salah jelas dan penting; gunakan `misconception_of`.
- **Batas/kondisi**: pisah bila mengubah keputusan penggunaan atau dapat diuji sendiri; jika tidak, tetap pada Idea utama.

Detail dan contoh ada di `references/idea-decomposition.md`.

## Gate konten

Meaningful source coverage dan provenance coverage harus 100%, tidak ada blocking semantic duplicate, seluruh Idea berada pada chapter terkunci, dan seluruh Idea punya bukti sumber. Warning formula/near-duplicate harus ditinjau, bukan diabaikan hanya karena non-blocking.

Jangan membuat soal baru, Artikel, Diktat, flashcard, blueprint, atau Product entity. Soal/solusi dari Source Pack hanya menjadi bukti/provenance pada tahap Idea.

## Lifecycle

- `authoring.list_imports` / `authoring.get_import`: inspeksi.
- `authoring.restage_idea_bundle`: mutation; hanya atas instruksi eksplisit.
- `authoring.review_idea_bundle`: keputusan review; hanya atas instruksi eksplisit dan scope yang sesuai.
- MCP tidak menyediakan publish/withdrawal Idea melalui skill ini.

## Stop conditions

Berhenti untuk judgment bila:

- dua sumber konflik substantif;
- split/merge masih ambigu dan akan mengubah target produk/asesmen;
- relation tidak dapat dijelaskan dengan definisi yang ada;
- warning near-duplicate atau formula trace membutuhkan keputusan;
- provenance/source tidak cukup;
- context/scope stale.

## Selesai

Laporkan bundle ID/checksum, jumlah source/chunk/Idea/provenance/relation/learning section, hasil decomposition preflight, duplicate review, quality report MCP, dan staging status. Jangan mengklaim publication otomatis.