# Input and Product Bundle contract

Authoring Job Pack mengunci Source Pack, target course dan chapter, section mapping, serta produk yang dipilih admin. Authoring Context Pack terbaru memasok Idea resmi, source excerpt, requirement, objective, relation, schema, dan allowed benchmark reference.

Jangan menerima Idea Bundle mentah sebagai pengganti context pack. Admin dapat mengedit Idea sebelum publish sehingga ID, versi, hash, dan relasi resmi di website dapat berbeda dari bundle agent. Jumlah dokumen sumber dinamis. Jangan mengarang dokumen atau solusi sumber yang tidak ada.

## Pemeriksaan kecocokan

- Course dan chapter harus sama.
- Semua chapter produk berada dalam scope job.
- Source Pack identity dan checksum konsisten.
- Semua Idea yang dipakai berstatus published.
- Versi dan semantic hash Idea berasal dari context pack.
- Source excerpt ID dan checksum exact.
- Requested products menentukan family yang boleh dibuat.
- Schema dalam context pack mengalahkan contoh skill.

## Metadata allowed ITB reference

Baca `entities/benchmark-summaries.json`. Setiap entry allowed dapat memiliki:

```json
{
  "id": "benchmark-id",
  "referenceId": "soal-itb-reference-id",
  "sourceLabel": "UTS Matematika I ITB 2024",
  "datasetKey": "dataset-key",
  "version": 1,
  "checksum": "64-karakter-hex",
  "summary": "Ringkasan aman"
}
```

`id` adalah ID benchmark dan tidak valid untuk source citation. `referenceId` adalah ID `soal_itb_referensi` yang wajib dipakai di `itbSource` dan `itbCuration`. `sourceLabel` adalah nama event exact yang wajib dipakai sebagai `itbSource.eventName`.

Gunakan hanya entry yang memiliki `referenceId` dan `sourceLabel` nonkosong. Cocokkan `sourceLabel` dengan nama event pada dokumen atau unit Source Pack. Jika metadata khusus tersebut tidak tersedia, tidak cocok, atau sumber asli pertanyaannya tidak ada di Source Pack, hentikan family question, solution, dan assessment blueprint. Jangan memakai `id`, `datasetKey`, `summary`, atau tebakan sebagai pengganti.

## Product Bundle V2

ZIP berisi `manifest.json`, `entities/products.json`, dan `entities/dependencies.json`. Manifest memakai `bundleType: product` dan `schemaVersion: product-bundle.v2`.

Setiap produk memakai `status: draft`, stable ID, version positif, course dan chapter resmi, Idea link, source reference, schema version, source hash, generation hash, attribution, serta isi lengkap tanpa placeholder. Gunakan `$UPLOADER` dan `$APPROVING_REVIEWER` ketika user ID privat tidak tersedia.

Jenis produk: `article`, `diktat`, `question`, `solution`, `flashcard_set`, `flashcard`, dan `assessment_blueprint`.

Idea weight setiap produk positif dan totalnya 1. Question multi-Idea memakai cognitive level yang sesuai dan relation lengkap. Setiap question membutuhkan satu solusi. Semua question dalam Product Bundle adalah contoh soal ITB, bukan soal asli Zyx. Diktat membutuhkan dependency ke Article dengan ID, versi, dan hash exact.

Setiap question wajib memiliki:

```json
{
  "itbSource": {
    "referenceId": "allowed-reference-id",
    "eventName": "UTS Matematika I ITB 2024"
  },
  "itbCuration": [
    {
      "referenceId": "allowed-reference-id",
      "dimensions": {
        "difficulty": "similar",
        "format": "similar",
        "terminology": "similar",
        "reasoningPattern": "similar"
      },
      "curatorNote": "Sumber dan karakter soal telah diperiksa."
    }
  ]
}
```

`eventName` harus menyalin `sourceLabel` dari allowed reference secara exact. Reference sumber harus tercakup dalam `itbCuration`. Stem dan opsi harus berasal langsung dari soal pada Source Pack dengan event yang cocok. Jangan memakai judul generik seperti `Soal ITB`, jangan mengarang tahun atau jenis ujian, jangan memakai holdout reference, dan jangan membuat soal baru.

Kontrak repository berikut mengalahkan contoh skill:

- `lib/bundle/product-validator.ts`
- `lib/materials/article-contract.ts`
- `lib/materials/quality-gates.ts`
- `lib/materials/diktat-contract.ts`
- `docs/bundle/product-bundle-v2.md`

## Lifecycle website

Agent hanya menghasilkan draft. Website menyediakan `draft -> published -> withdrawn`. Draft dapat diganti dengan bundle ID sama, diedit in-place, dihapus, atau dipublikasikan. Published tidak dapat ditimpa. Withdrawn disimpan untuk audit dan tidak kembali ke draft.
