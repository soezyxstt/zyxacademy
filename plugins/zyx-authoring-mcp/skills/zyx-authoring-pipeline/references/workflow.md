# Authoring pipeline state machine

Gunakan state machine ini untuk workflow `idea_product`. Nama state adalah status orkestrasi client, bukan status database. Contract MCP terbaru tetap authoritative untuk tool/schema runtime, sedangkan quality rules berasal dari skill tahap yang aktif.

## States

| State | Entry condition | Exit condition |
|---|---|---|
| `SCOPE_CONFIRMATION_REQUIRED` | course/chapter ambigu, near-match, atau berbeda dari scope terkunci | operator mengonfirmasi pilihan opaque |
| `SOURCE_PREPARATION` | stored/local source dan urutan tersedia | Source Pack selesai disusun dan source reconciliation preflight lulus |
| `SOURCE_VALIDATION` | canonical ZIP + originals tersedia | `source.ingest` menghasilkan `valid: true` |
| `IDEA_AUTHORING` | run `idea_product` + contract aktif | Idea decomposition preflight dan MCP validation lulus |
| `IDEA_VALIDATED` | Idea Bundle valid | operator mengotorisasi submission Idea |
| `IDEA_STAGED` | submit Idea berhasil | checkpoint dicatat |
| `WAITING_IDEA_PUBLICATION` | Idea staged tetapi belum terbukti published | MCP menunjukkan target Idea published dan context fresh |
| `PRODUCT_AUTHORING` | published Idea + active source + fresh dependency | Product author preflight, flashcard preflight, dan MCP validation lulus |
| `PRODUCT_VALIDATED` | Product valid + author preflight lulus | selesai untuk `product_validated` atau operator mengotorisasi staging |
| `PRODUCT_STAGED` | submit Product berhasil | laporan akhir |

Gunakan `NEEDS_OPERATOR_DECISION`, `BLOCKED_BY_VALIDATION`, atau `STALE_CONTEXT` jika transisi aman tidak dapat dilakukan.

## Product V3 invariant pada state machine

`PRODUCT_AUTHORING` hanya mencakup:

1. Artikel sampai self-contained;
2. Diktat yang diturunkan dari Artikel;
3. flashcard recall yang diturunkan dari Artikel.

Jangan memasukkan ITB example, historical question, Zyx original question, solution, atau assessment blueprint ke state `PRODUCT_AUTHORING`. Asesmen memakai workflow terpisah dan tidak menjadi entry/exit condition pipeline ini.

## Resume protocol

1. Baca checkpoint terakhir dan cocokkan path/name, checksum, bundle ID, run ID, contract checksum, Source Pack checksum, dan scope.
2. Panggil MCP read tools untuk memastikan run, contract, published Idea version/hash, source excerpt, dan dependency masih sesuai.
3. Jangan mengandalkan pernyataan sesi lama untuk status yang dapat diverifikasi MCP.
4. Jika context stale/token invalid, refresh run/contract sesuai tool dan revalidate dependency yang terdampak.
5. Lanjutkan dari entry condition terakhir yang masih terbukti benar; jangan mengulang extraction/authoring hanya karena sesi berganti.

## Validation and retry

- Perbaiki schema/packaging/checksum issue mekanis sesuai diagnostics MCP.
- Setelah revisi konten substantif, ulangi preflight tahap terkait sebelum MCP validation berikutnya.
- Jangan mengganti stable identity/scope/source checksum/Idea version/hash/dependency hash secara manual agar validation lolos.
- Retry identik yang server nyatakan sukses/no-op dicatat tanpa membuat bundle baru.
- Conflict identity+content menjadi blocker; jangan membuat identity pengganti tanpa dasar contract.
- Jika issue yang sama tetap muncul setelah dua perbaikan terarah, gunakan `BLOCKED_BY_VALIDATION`. Simpan artifact terakhir, issue, perubahan yang dicoba, dan evidence yang dibutuhkan; jangan retry tanpa perubahan. Warning substantif berarti dapat mengubah fakta, cakupan, kunci, provenance, atau eligibility. Perbaiki atau beri disposition berbukti; warning administratif tidak boleh dipromosikan menjadi blocker tanpa alasan.

## Mandatory pauses

Jeda jika:

- urutan/mapping dokumen belum pasti;
- teks, formula, tabel, visual, atau reading order sumber ambigu;
- course/chapter ambigu atau berubah dari scope;
- split/merge/relation Idea membutuhkan judgment substantif;
- warning near-duplicate/formula trace membutuhkan keputusan;
- Artikel tidak dapat dibuat self-contained dari evidence yang tersedia;
- Diktat tidak dapat dipadatkan tanpa membuang Idea penting;
- fakta Flashcard belum ada di Artikel dan tidak dapat ditambahkan dari sumber dalam scope;
- submission belum diotorisasi;
- Idea belum terbukti published;
- context stale atau dependency publication-blocking.

**Tidak ada pause pemilihan soal ITB pada pipeline Product V3**, karena asesmen bukan bagian Product V3.

## Checkpoint report

Gunakan format ringkas:

```text
Pipeline: <status>
Completed: <last completed state>
Scope: <course label> / <chapter label>
Context: <run ID, contract checksum, Source Pack checksum>
Artifacts: <path/name, checksum, bundle ID>
Author quality: <stage preflight result>
MCP quality: <validation result + blocking summary>
Staging: <not requested/not submitted/submitted>
Waiting for: <objective condition or operator decision>
Resume: <one concise instruction>
```

Untuk `WAITING_IDEA_PUBLICATION`, tulis kondisi resume: “Setelah admin mempublikasikan Idea, verifikasi status published dan version/hash melalui MCP, lalu lanjutkan Product.” Jangan menulis seolah publication telah terjadi.

Jika scope hanya memiliki metadata Artikel, jangan melaporkan audit self-contained lulus. Jika PDF belum dirender, laporkan `NOT_RENDERED`; draft Product bisa tervalidasi tetapi belum memiliki bukti publication readiness. Matriks author, MCP, admin review, PDF, dan publication harus dilaporkan terpisah.
