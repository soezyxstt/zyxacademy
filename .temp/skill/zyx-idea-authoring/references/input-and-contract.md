# Input and Idea Bundle contract

## Authoring Job Pack

Gunakan `authoring-job.json` sebagai scope terkunci. Technical ID adalah opaque string dan tidak boleh diubah. `sectionMappings` harus mencakup setiap section tepat satu kali. Source Pack berada di `source-pack/` dan memakai `zyx-source-pack.v1`.

Jumlah dokumen dinamis. Materi dan soal tanpa dokumen pembahasan tetap valid jika itulah seluruh input. Jangan membuat dokumen atau solusi yang tidak ada.

Source Markdown harus memiliki anchor `<!-- source-unit: N -->`, checksum cocok, unit lengkap dan berurutan, ledger `complete`, unresolved kosong, serta visual informatif dalam `:::visual-explanation`.

Pertahankan `documents[].title` sebagai `sourceMaterial.title`. Judul dokumen contoh soal ITB dapat menjadi nama event seperti `UTS Matematika I ITB 2024`; jangan menyingkat, menggenerikkan, atau menebak label tersebut. Source Pack belum menetapkan `itbSource`, `itbCuration`, atau origin bank soal.

## Source entities

Buat satu source material per Markdown dengan `sourceType: markdown`, `status: active`, title exact dari manifest, dan creator sentinel. Gunakan checksum byte Markdown dan locator relatif yang aman. Buat chunks pada batas semantik tanpa menulis ulang content. Offset memakai indeks string JavaScript terhadap teks Markdown yang sudah dinormalisasi ke LF dan harus memenuhi:

```text
sourceText.slice(startOffset, endOffset) === chunk.content
```

## Idea Bundle V2

Manifest memakai `bundleType: idea` dan `schemaVersion: idea-bundle.v2`. Setiap Idea memiliki ID stabil, course ID, chapter ID, stable key, code, canonical statement, concise explanation, knowledge kind, instructional role, version, schema version, semantic hash, generation hash, source policy, attribution, dan timestamps.

Final entity menggunakan status `published` karena validator menafsirkannya sebagai kandidat publication-ready. Hal itu tidak melewati preview, staging, review, approval, atau publication website.

Seluruh Idea workflow ini memakai `sourcePolicy: source_grounded` dan memiliki provenance ke chunk resmi. Jangan membuat `tutor_authored` untuk menutup gap. Relation endpoint harus ada dan graph prerequisite aktif harus acyclic.

Attribution eksternal memakai `$UPLOADER` dan `$APPROVING_REVIEWER`. Website menyelesaikannya saat publikasi.

Saat repository tersedia, schema pada Authoring Job Pack dan file berikut mengalahkan contoh skill:

- `lib/ide/contracts.ts`
- `lib/sumber/contracts.ts`
- `lib/bundle/idea-bundle-v2.ts`
- `docs/bundle/idea-bundle-v2.md`
