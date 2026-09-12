# Source Pack MCP reference

Baca [source-reconciliation.md](source-reconciliation.md) sebelum transkripsi. MCP memeriksa struktur/checksum/coverage, tetapi fidelity halaman tetap membutuhkan rekonsiliasi author.

## Canonical ZIP

Entry yang diizinkan hanya:

```text
manifest.json
documents/*.md
coverage/*.json
```

Gunakan LF UTF-8, stable relative paths, regular file mode `0644`. Jangan masukkan source binary ke ZIP; verifikasi melalui `originals` untuk local file atau `storedOriginals` untuk stored Zyx reference.

## Preflight bentuk artifact

Ambil manifest, coverage schema, visual fields, limit file, dan aturan checksum dari tool schema/resource resmi yang tersedia sebelum membuat JSON. Jangan menciptakan field untuk menampung catatan kerja. Jika schema tidak tersedia lengkap, laporkan bagian yang hilang; jangan memakai contoh parsial sebagai kontrak lengkap.

Tetapkan dokumen dan unit asli dahulu, tulis Markdown final, hitung coverage dari hasil itu, lalu hitung checksum file dan manifest sesuai kontrak. Buka ulang ZIP final dan cocokkan daftar entry, UTF-8/LF, mode `0644`, JSON, document IDs, checksum, dan original mapping sebelum ingest. Jangan menghitung hash dari teks sebelum revisi/normalisasi terakhir. Checksum ZIP mentah dan checksum yang diminta manifest tidak boleh saling dipertukarkan.

Simpan tabel rekonsiliasi rinci di luar ZIP; hanya ledger dengan field contract masuk `coverage/*.json`. `source.ingest` adalah operasi ingest sumber yang diminta, bukan izin submission Idea/Product berikutnya.

## Coverage rules

`processedUnits` harus sama dengan setiap integer `1..expectedUnits` tepat sekali. `outputCounts` dihitung dari Markdown final, bukan disalin dari inventory. Review pass wajib mencakup `inventory`, `transcription`, `visual`, dan `reconciliation`.

Sebelum unit dianggap selesai, author harus merekonsiliasi reading order, teks, formula, tabel, visual, soal, dan solusi sesuai `source-reconciliation.md`.

## Visual rule

Setiap instructional visual memakai satu closed `:::visual-explanation` block. Field wajib mengikuti contract aktif; structured visual harus memiliki relationships, labels, dan reading-order saat disyaratkan. Jangan menyatakan `uncertainty: none` jika label/struktur diragukan.

## MCP sequence untuk stored files

1. `catalog.list_courses` dan `catalog.list_chapters` dari label prompt.
2. `source.list_files` dengan opaque course/chapter keys; paginate sampai inventory relevan lengkap.
3. `source.read_file` mode `pages`, maksimal empat halaman per call. Gunakan extracted text **dan setiap page image**.
4. Rekonsiliasi tiap halaman mengikuti `source-reconciliation.md`. Jangan langsung membuat ZIP dari extraction mentah.
5. Jika page read gagal/timeout, retry file satu kali dengan `blob` bila file masih dalam limit.
6. Jalankan source reconciliation preflight dan pastikan unresolved marker final = 0.
7. Build/checksum ZIP.
8. `source.ingest { filename, contentBase64, storedOriginals: [{ documentId, fileKey }] }`.
9. Stop pada blocking quality issue; perbaiki tanpa mengubah substansi sumber.
10. Gunakan `sourcePackToken`/persisted pack hanya saat `valid: true`, lalu mulai workflow dengan course/chapter yang sama.
11. Jika downstream workflow putus, reuse `source.list_packs` / `source.get_pack` bila checksum/scope masih cocok; jangan baca PDF ulang tanpa alasan.

Jika `fileKey` expired/stale/moved, panggil `source.list_files` lagi. Jangan rekonstruksi atau persist `fileKey`, DB ID, R2 key, atau URL.

## Compatibility untuk local files

Untuk local file, pertahankan binary dan panggil `source.ingest` dengan `originals: [{ documentId, contentBase64 }]`. Local + stored originals boleh dicampur hanya jika setiap `documentId` unik. Stored originals mengikat Source Pack ke catalog course/chapter; local path tetap compatibility path sampai workflow start.

## Stop condition

Jangan ingest final bila page/visual/formula/tabel penting belum dapat direkonsiliasi, reading order ambigu, atau unresolved marker masih ada. Pengetahuan umum tidak boleh dipakai untuk menebak bagian sumber yang tidak terbaca.
