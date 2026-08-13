# Authoring Job Pack V1

## Tujuan

Authoring Job Pack menyederhanakan handoff dari admin Zyx ke agent eksternal. Admin tidak perlu mencari ID mata kuliah, bab, author, snapshot, atau run. Halaman `/admin/authoring-context` menampilkan nama mata kuliah dan bab, memeriksa Source Pack tanpa penyimpanan, lalu menghasilkan satu ZIP yang siap dipakai skill `zyx-idea-authoring`.

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

`source-pack-translator` menghasilkan Source Pack. Authoring Job Pack kemudian menjadi satu-satunya input wajib `zyx-idea-authoring` untuk membuat Idea Bundle. Setelah Idea ditinjau dan dipublikasikan, admin membuat Authoring Context Pack dari tab `Lanjutkan setelah Idea`. Context Pack memakai mata kuliah yang dipilih melalui dropdown; snapshot ID dan run ID dibuat otomatis.

`zyx-product-authoring` menerima Authoring Job Pack asli dan Context Pack terbaru, lalu menghasilkan Product Bundle berstatus draft. Product Bundle hanya boleh memakai Idea resmi dari Context Pack. Authoring Job Pack tidak menghapus checkpoint publikasi Idea.

## Validasi lokal

```bash
bun test tests/contracts/authoring-job-pack.test.ts
```

Gate tersebut mencakup Source Pack tanpa dokumen pembahasan, mapping lengkap, pack mandiri, dan deteksi file yang dirusak.
