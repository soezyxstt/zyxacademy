---
name: zyx-source-pack-mcp
description: Membuat Source Pack Zyx yang lossless dari dokumen akademik dengan rekonsiliasi teks, layout, formula, tabel, visual, soal, dan solusi secara deterministik sebelum Authoring MCP validation. Jangan gunakan untuk meringkas, mengoreksi sumber, atau membuat Idea/Product/soal baru.
---

# Zyx Source Pack MCP

Gunakan skill ini sebagai instruction layer. MCP adalah validation layer dan tidak boleh dilewati.

Sebelum memproses dokumen, wajib baca:

- [references/workflow.md](references/workflow.md)
- [references/source-reconciliation.md](references/source-reconciliation.md)

## Invariant yang tidak boleh dilanggar

1. Source Pack adalah transkripsi kanonik **lossless**, bukan ringkasan atau materi ajar baru.
2. Jangan menerjemahkan, memperbaiki fakta, memperbaiki rumus, mengisi jawaban, atau membuat isi yang tidak terlihat pada sumber.
3. Untuk PDF, extracted text dan page image adalah bukti yang harus direkonsiliasi; jangan menganggap salah satunya selalu benar.
4. Jangan menebak teks/simbol buram dari konteks akademik.
5. Multi-column order, formula, tabel, visual, shared stimulus, soal, dan pembahasan harus diperiksa secara eksplisit sesuai `source-reconciliation.md`.
6. Dokumen tidak boleh ditandai complete bila satu bagian bermakna belum direkonsiliasi.
7. MCP hijau tidak membenarkan fakta yang ditambahkan author; fidelity tetap wajib.

## Tujuan

Ubah setiap dokumen asli menjadi Markdown yang mempertahankan seluruh informasi terbaca: judul, unit, paragraf, bullet, formula, tabel, contoh, penerapan, soal, opsi, solusi, referensi silang, event label, dan makna visual.

Visual instruksional menjadi blok `:::visual-explanation`. Jangan memasukkan binary gambar, HTML `<img>`, data URL, atau binary asli ke ZIP Source Pack.

## Workflow MCP

1. Jika prompt menyebut course/chapter tanpa attachment, panggil `catalog.list_courses`, `catalog.list_chapters`, lalu `source.list_files`. Pilih `fileKey` dari metadata manusiawi + checksum; jangan menebak ID teknis.
2. Baca PDF dengan `source.read_file` mode `pages`, maksimal empat halaman per panggilan. Untuk **setiap halaman**, rekonsiliasi extracted text dengan page image memakai urutan `source-reconciliation.md`.
3. Jika page read gagal/timeout, retry file satu kali lewat `blob` bila didukung. Jangan mengganti jalur secara diam-diam.
4. Untuk file lokal, pertahankan binary asli, path absolut, size, dan SHA-256 sampai `source.ingest` selesai.
5. Buat tepat satu Markdown dan satu coverage ledger untuk setiap dokumen asli.
6. Jangan tandai unit selesai sebelum paragraf, formula, tabel, visual, soal, solusi, dan reading order unit tersebut sudah diperiksa.
7. Package hanya `manifest.json`, `documents/*.md`, dan `coverage/*.json`, seluruh entry regular mode `0644`.
8. Stored file → `source.ingest` dengan `storedOriginals`. Local file → `originals`. Gabungan boleh bila `documentId` unik.
9. Jika `valid: false`, perbaiki berdasarkan issues/quality metrics **tanpa mengubah isi sumber agar validator mudah lolos**.
10. Gunakan `sourcePackToken` hanya setelah `valid: true`; mulai workflow berikutnya dengan course/chapter yang sama.

## Aturan rekonsiliasi wajib

- Multi-column: tentukan reading order dari layout, bukan urutan extraction mentah.
- Formula: bandingkan indeks, pangkat, pecahan, tanda, delimiter, matriks, vektor, limit, integral, dan simbol dengan image.
- Tabel lintas halaman: pertahankan header/unit/footnote dan jangan memasukkan repeated header sebagai data.
- Header/footer: buang hanya bila murni dekoratif; jangan menghapus label akademik penting.
- Visual: buat blok hanya jika membawa makna instruksional; label buram harus dicatat sebagai uncertainty.
- Soal/solusi: pertahankan nomor, part, opsi, stimulus, dan isi yang terlihat; jangan mengisi kunci yang tidak ada.
- Shared stimulus: pertahankan relasi antarsoal tanpa menduplikasi dengan perubahan makna.
- Scan buram/konflik bukti: jangan best-guess; Source Pack belum complete bila bagian penting tidak dapat dipastikan.

## Aturan ZIP wajib

Jangan memasukkan `.js`, `.ts`, scripts, skill directory, workspace, laporan, state, cache, source binary, ZIP bersarang, executable bit, symlink, path absolut, backslash, `..`, atau entry tambahan. Jika MCP mendeteksi ZIP security/undeclared/checksum issue, buat ulang dari direktori kontrak.

## Gate konten

Source Pack final tidak boleh memiliki unresolved marker. Selama revisi, unresolved marker boleh dipakai hanya untuk melacak bagian yang harus diperiksa ulang.

Untuk setiap visual, field wajib mengikuti contract aktif. Graph/plot/chart/number-line/geometry/diagram memerlukan relationships, labels, dan reading-order yang tidak kosong bila contract mensyaratkannya. Jangan menyatakan `uncertainty: none` jika ada label/struktur yang diragukan.

Sebelum ingest final, jalankan checklist `source-reconciliation.md`. Bila satu butir gagal, jangan menyatakan dokumen complete.

## Stop conditions

Berhenti atau laporkan blocker jika:

- file/course/chapter mapping tidak pasti;
- halaman penting tidak dapat dibaca setelah fallback yang diizinkan;
- extracted text dan image konflik substantif dan tidak dapat direkonsiliasi;
- formula/simbol penting buram;
- reading order multi-column ambigu;
- tabel/visual/soal/solusi tidak dapat dipetakan tanpa menebak.

Jangan menyelesaikan blocker dengan pengetahuan umum.

## Selesai

Laporkan nama Source Pack, path bila file lokal, checksum ZIP, dokumen/unit, hasil source reconciliation preflight, unresolved count (harus nol), quality report MCP, dan verifikasi setiap original binary/reference. Jangan membuat Idea, Product, atau soal pada skill ini.