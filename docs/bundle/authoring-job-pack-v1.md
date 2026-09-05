# Authoring Job Pack V1

## Tujuan

Authoring Job Pack adalah workflow legacy untuk handoff berbasis ZIP. Workflow aktif sekarang menggunakan tiga skill MCP baru (`zyx-source-pack-mcp`, `zyx-idea-bundle-mcp`, dan `zyx-product-bundle-mcp`) dan tidak memerlukan download Authoring Job Pack atau Authoring Context Pack sebagai langkah antar-agent. Dokumen ini dipertahankan untuk kompatibilitas dengan workflow lama dan kontrak ZIP yang masih dibaca validator.

## Alur admin

1. Upload satu Source Pack ZIP.
2. Tunggu analisis dokumen, unit, section, formula, visual, soal, dan pembahasan.
3. Pilih satu mata kuliah aktif.
4. Pilih satu atau lebih bab aktif.
5. Petakan setiap section sumber ke tepat satu bab. Jika hanya satu bab dipilih, seluruh section dipetakan otomatis.
6. Pilih keluarga produk. Artikel selalu aktif. Soal selalu dipasangkan dengan pembahasan, dan blueprint memerlukan soal.
7. Unduh `authoring-job-{name}.zip`.

Analisis dan pembuatan ZIP berlangsung di memori. Keduanya tidak menulis R2 atau database. Penyimpanan baru terjadi pada workflow upload dan konfirmasi Idea Bundle atau Product Bundle.

## Struktur ZIP

```text
manifest.json
authoring-job.json
source-pack/manifest.json
source-pack/documents/*.md
source-pack/coverage/*.json
contracts/authoring-job.schema.json
contracts/source-pack/manifest.schema.json
contracts/idea-bundle/*.json
contracts/product-bundle/*.json
instructions/external-authoring-workflow.json
```

Root manifest mendeklarasikan setiap file, ukuran byte, checksum SHA-256, job ID, Source Pack ID, dan course ID. File yang tidak dideklarasikan atau checksum yang berubah membuat pack ditolak.

## Identitas dan pemetaan

`authoring-job.json` menyimpan label manusia dan ID teknis untuk course serta bab. Agent harus mempertahankan ID teknis persis, tetapi operator cukup bekerja dengan label di UI.

Setiap section mapping memuat document ID, section ID, judul, rentang source unit inklusif, chapter ID, dan label chapter. Semua section harus dipetakan tepat satu kali. Chapter yang dipilih tetapi tidak menerima section tidak disertakan dalam job final.

Attribution memakai sentinel `$UPLOADER` dan `$APPROVING_REVIEWER`. Zyx menyelesaikan sentinel tersebut menjadi identitas pengguna yang bertanggung jawab saat publikasi.

## Hubungan dengan tiga skill

Pada workflow legacy, `source-pack-translator` menghasilkan Source Pack dan `package-source-pack.js` menetapkan seluruh entry ke mode `0644`; generic archiver dan packaging direktori skill dilarang. Validator JavaScript memverifikasi binary asli, count Markdown, marker, blok visual, dan quality report. Pada workflow MCP aktif, agent dapat memilih PDF yang sudah tersimpan melalui `source.list_files`, membacanya per halaman melalui `source.read_file`, lalu mengirim referensi terenkripsi sebagai `storedOriginals` ke `source.ingest`. Jalur file lokal tetap memakai input ephemeral `originals`. Kedua jalur menjalankan pemeriksaan yang sama, sedangkan stored originals juga mengikat token ke course dan chapter pilihan catalog MCP. Source Pack yang valid secara otomatis disimpan ke Cloudflare R2 dan dicatat di tabel `impor_bundle` dengan status `validated`, sehingga dapat diperiksa lewat `source.list_packs` dan `source.get_pack`, serta digunakan kembali langsung melalui `sourcePackId` pada `workflow.start` jika tahap Idea atau Product Bundle berikutnya perlu diulang.

Workflow legacy `zyx-product-authoring` menerima Authoring Job Pack dan Context Pack terbaru. Workflow MCP aktif melakukan pengecekan published Idea, version, semantic hash, dependency freshness, dan chapter scope langsung sebelum Product Bundle staging. Checkpoint publikasi Idea tetap wajib dan tidak dapat dilewati.

Seluruh packager dan validator yang dibundel dalam ketiga skill memakai file `.js` dan dijalankan langsung oleh Bun. Packager menolak file tambahan dan symlink, menetapkan mode ZIP `0644`, lalu menjalankan validator kontrak sebelum menulis hasil. Import ke modul kontrak `.ts` repository tetap diizinkan karena modul tersebut adalah implementasi otoritatif aplikasi, bukan script skill.

## Validasi lokal

```bash
bun test tests/contracts/authoring-job-pack.test.ts
```

Gate tersebut mencakup Source Pack tanpa dokumen pembahasan, mapping lengkap, pack mandiri, dan deteksi file yang dirusak.
