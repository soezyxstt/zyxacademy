# Idea Bundle MCP reference

Baca [idea-decomposition.md](idea-decomposition.md) sebelum authoring. MCP memeriksa kontrak/provenance, sedangkan split/merge quality tetap author preflight yang wajib.

## Canonical ZIP

Gunakan tepat kontrak Idea Bundle V3:

```text
manifest.json
sources/*.md
entities/source-materials.json
entities/source-chunks.json
entities/ideas.json
entities/provenance.json
entities/relations.json
entities/learning-sections.json
```

Manifest dan entity memakai deterministic SHA-256. Stable IDs opaque; jangan turunkan ID dari label, slug, filename, atau chapter title. Setiap Idea muncul tepat sekali di `primaryIdeaIds`; supporting membership boleh berulang. Section slug unik/stabil, sibling order unik, parent acyclic, hierarchy depth maksimal tiga.

## Author decomposition gate

Sebelum MCP validation:

1. terapkan split test pada kandidat multi-klaim;
2. terapkan merge test pada kandidat terlalu kecil/near-duplicate;
3. jangan membuat Idea mekanis dari setiap kalimat, formula, contoh, simbol, atau langkah;
4. deduplicate knowledge sama lintas source sambil mempertahankan provenance;
5. pastikan setiap relation dapat dijelaskan sesuai semantic relation;
6. pastikan tepat satu primary section dan provenance primer per Idea.

Jika granularity masih ambigu dan berdampak pada Product/assessment, berhenti untuk judgment daripada memakai validator sebagai penentu pemecahan.

## MCP quality gates

MCP memeriksa schema, canonical checksum, source checksum, exact chunk offsets, course/chapter scope, source-grounded provenance, stable keys, learning section hierarchy/coverage, relation endpoint/duplicate/cycle, meaningful source chunk coverage, Idea provenance coverage, duplicate/near-duplicate canonical statement, dan formula trace warning.

`quality.valid` harus true sebelum submission. Warning tetap harus ditinjau; non-blocking bukan berarti boleh diabaikan.

## MCP tool sequence

1. Dapatkan Source Pack valid melalui `$zyx-source-pack-mcp`; untuk prompt course/chapter tanpa attachment, utamakan stored PDFs.
2. Mulai `idea_product` dengan Source Pack serta opaque course/chapter yang sama.
3. Ambil contract aktif dan bangun Idea Bundle dari context terkunci.
4. Jalankan author decomposition preflight.
5. Panggil `authoring.validate_idea_bundle` (`authoring:read`).
6. Perbaiki issue/warning substantif; setelah revisi, ulangi decomposition preflight lalu validasi ulang.
7. Panggil `authoring.submit_idea_bundle` hanya jika author preflight + MCP validation lulus dan staging diotorisasi (`authoring:stage`).
8. Existing import:
   - `authoring.list_imports { bundleType: "idea" }` / `authoring.get_import`: inspeksi;
   - `authoring.restage_idea_bundle`: mutation, hanya atas instruksi eksplisit;
   - `authoring.review_idea_bundle`: review mutation, hanya atas instruksi eksplisit.
9. Stop setelah staging/review. Tunggu admin publication sebelum Product authoring. MCP tidak menyediakan publication tool dan Idea withdrawal tidak diimplementasikan.