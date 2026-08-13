# Idea quality gates

Satu gate hanya bernilai `pending`, `failed`, `passed`, `blocked`, atau `skipped`. Jangan menurunkan failure menjadi warning.

Require:

- Source Pack dan Authoring Job Pack valid.
- Meaningful source coverage 100 persen setelah exclusion terverifikasi.
- Idea provenance coverage 100 persen.
- Unsupported Idea, semantic duplicate, compound Idea, orphan provenance, dan stable-key collision berjumlah 0.
- Missing relation endpoint, duplicate relation, self relation, dan prerequisite cycle berjumlah 0.
- Formula, symbol, condition, unit, dan terminology cocok dengan sumber.
- Seluruh Idea memakai `sourcePolicy: source_grounded`; tutor-authored Idea berjumlah 0.
- Source material title, termasuk nama event contoh soal ITB, cocok exact dengan Source Pack dan label hasil tebakan berjumlah 0.
- Product entity, `itbSource`, `itbCuration`, serta soal baru berjumlah 0.
- Course dan chapter mengikuti locked section mapping.
- ZIP layout, stable IDs, file checksum, bundle checksum, schema, dan website validator lulus.

Untuk setiap failure catat issue code, entity atau source unit, path, expected, observed, dan perbaikan. Jangan package bundle final ketika issue terbuka.
