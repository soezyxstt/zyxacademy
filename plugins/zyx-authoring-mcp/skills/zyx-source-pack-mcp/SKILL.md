---
name: zyx-source-pack-mcp
description: Membuat Source Pack Zyx yang lossless dari PDF course tersimpan atau file lokal PDF, DOCX, PPTX, spreadsheet, HTML, dan dokumen akademik lain, lalu memvalidasinya melalui Authoring MCP. Gunakan saat menyiapkan atau memperbaiki Source Pack. Jangan gunakan untuk membuat Idea Bundle, Product Bundle, atau soal baru.
---

# Zyx Source Pack MCP

Gunakan skill ini sebagai instruction layer. MCP adalah sumber validasi dan tidak boleh dilewati. Baca [references/workflow.md](references/workflow.md) sebelum memproses dokumen. Jika kontrak diragukan, gunakan hasil validasi dan quality report MCP sebagai sumber kebenaran.

## Tujuan

Ubah dokumen asli menjadi Markdown kanonik yang mempertahankan seluruh informasi terbaca. Jangan meringkas, mengajar ulang, menerjemahkan tanpa permintaan, mengoreksi fakta, atau membuat isi yang tidak terlihat pada sumber.

Pertahankan judul, unit, formula, tabel, contoh, penerapan, soal, solusi, referensi silang, label event, dan makna visual. Visual instruksional harus menjadi blok `:::visual-explanation`; jangan memasukkan gambar biner, HTML `<img>`, data URL, atau binary asli ke ZIP Source Pack.

## Workflow MCP

1. Jika prompt menyebut mata kuliah dan bab tanpa attachment, jangan meminta upload terlebih dahulu. Panggil `catalog.list_courses`, `catalog.list_chapters`, lalu `source.list_files`. Pilih `fileKey` berdasarkan judul, kategori, subkategori, tahun, dan checksum, bukan ID teknis.
2. Baca PDF dengan `source.read_file` mode `pages`, maksimal empat halaman per panggilan. Rekonsiliasi teks hasil ekstraksi dengan image block setiap halaman. Jika pembacaan halaman gagal atau timeout, ulangi satu kali dengan mode `blob`; jangan mengganti mode secara diam-diam.
3. Untuk file lokal, simpan binary asli, path absolut, ukuran, dan SHA-256. Binary asli wajib tersedia sampai `source.ingest` selesai.
4. Buat tepat satu Markdown dan satu coverage ledger untuk setiap dokumen asli.
5. Package hanya `manifest.json`, `documents/*.md`, dan `coverage/*.json` dengan mode ZIP `0644`.
6. Untuk file Zyx, panggil `source.ingest` dengan `storedOriginals: [{ documentId, fileKey }]`. Untuk file lokal, gunakan `originals: [{ documentId, contentBase64 }]`. Kedua bentuk boleh digabungkan bila `documentId` unik.
7. MCP memverifikasi checksum binary asli, unit, marker, formula, tabel, visual, count, unresolved marker, ZIP security, dan scope course/chapter untuk stored originals.
8. Jika MCP mengembalikan `valid: false`, perbaiki artifact berdasarkan `issues` dan `quality.metrics`. Jangan mengubah checksum secara manual dan jangan mengirimkan bundle yang gagal.
9. Hanya gunakan `sourcePackToken` setelah MCP mengembalikan `valid: true`. Panggil `workflow.start` dengan course dan chapter yang sama dengan stored originals.

## Aturan ZIP wajib

- Jangan memasukkan `.js`, `.ts`, `scripts/`, direktori skill, workspace, laporan, state, cache, binary asli, atau ZIP bersarang.
- Jangan memakai `zip`, `tar`, archiver generik, atau fitur Compress filesystem.
- Jangan mempertahankan executable bit, `0755`, `0777`, symlink, path absolut, backslash, `..`, atau entry tambahan.
- Jika muncul `ZIP_EXECUTABLE`, `ZIP_SYMLINK`, `SOURCE_PACK_UNDECLARED_FILE`, atau checksum mismatch, berhenti dan buat ulang dari direktori kontrak.

## Gate konten

Jangan menandai dokumen complete bila ada unit, formula, tabel, visual, soal, solusi, atau bagian teks yang belum direkonsiliasi. Jangan menebak teks buram. Gunakan unresolved marker hanya selama revisi; Source Pack yang dikirim ke MCP tidak boleh memiliki unresolved marker.

Untuk setiap visual, pastikan `id`, `source-unit`, `kind`, `title`, `purpose`, `elements`, `instructional-meaning`, dan `uncertainty` ada. Graph, plot, chart, number-line, geometry, dan diagram juga membutuhkan `relationships`, `labels`, dan `reading-order` yang tidak kosong.

## Selesai

Laporkan nama artifact Source Pack, path bila memang ada file lokal, checksum ZIP, dokumen dan unit, hasil `qualityReport`, dan bahwa setiap binary asli diverifikasi. Jangan membuat Idea atau Product Bundle pada skill ini.
