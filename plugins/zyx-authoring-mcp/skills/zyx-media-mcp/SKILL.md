---
name: zyx-media-mcp
description: Mencari media Zyx yang sudah ada, mengunggah berkas kecil lewat job MCP, dan memakai URL penyajian resmi pada blog atau konten yang diminta. Gunakan untuk Media Library publik, bukan aset privat, admission sumber akademik atau publikasi konten.
---

# Media Zyx melalui MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.3"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum memulai run atau melakukan staging.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

## Target dan izin

Panggil `admin.environment`, cocokkan target pengguna, lalu ambil `admin.capabilities` domain `media`. Sertakan `expectedEnvironment` dan `expectedOrigin` pada tool admin data. Gunakan schema dan tool yang benar-benar tersedia; jangan menganggap versi paket atau discovery sudah memberi hak akses. Jika koneksi tidak cocok, hentikan pada target itu tanpa beralih environment.

`media.list/get` memerlukan `media:read`; upload memerlukan `media:write` dan consent OAuth yang masih berlaku untuk job provider. `adminjobs.get` memerlukan `jobs:read` serta scope operasi asal, yaitu `media:write` untuk upload. Periksa izin yang dibutuhkan sebelum mengantrekan job. Sesi manual tidak menggantikan consent OAuth tersebut.

Pastikan permintaan mencakup unggahan ke Media Library publik. Aset privat, Source Pack, evidence, respons formulir dan credential memakai alur khususnya. Upload media tidak mengadmit sumber/visual Product dan tidak mempublikasikan blog atau bundle.

## Temukan aset yang tepat

Gunakan `media.list` pada `folderPath` terkait, dengan `limit` kecil dan `cursor` dari `nextCursor` saat perlu halaman lanjut. Cari aset yang sesuai sebelum mengunggah ulang; tidak perlu memuat seluruh library. Jangan menebak key atau memakai path privat di luar `media/`.

Panggil `media.get` dengan key yang ditemukan untuk memperoleh `publicPath`, `publicUrl` dan `thumbnailCandidate`. `byteContentVerified: false` berarti server memeriksa keberadaan, bukan isi byte atau mutu render. Periksa gambar/berkas yang sebenarnya sebelum menganggapnya tepat. Gunakan `publicPath` untuk `thumbnailUrl` blog atau `publicUrl` bila konteks meminta URL absolut; raw key, hostname tebakan dan signed URL buatan bukan penggantinya.

## Unggah sekali, ikuti hasil job

1. Baca batas live. Saat ini `media.upload` menerima `folderPath`, `filename`, `mimeType`, `dataBase64` untuk paling banyak 512 KiB byte, dengan MIME PNG, JPEG, WebP, PDF, teks atau Markdown. Ukur byte sebelum encoding dan cocokkan MIME sebenarnya. Berkas lebih besar memakai jalur unggahan yang tersedia; jangan memotong, memalsukan tipe atau membagi byte untuk melewati batas.
2. Untuk unggahan yang sudah diizinkan, buat `requestKey` stabil dan panggil `dryRun: true`. Periksa target, nama, ukuran dan dampak, lalu kirim payload/key yang sama dengan `dryRun: false` serta `confirmationToken` dari plan. Ini langkah protokol, bukan permintaan izin ulang untuk tindakan yang sudah tercakup.
3. Simpan ID job hasilnya. Pantau `adminjobs.get`; `queued` atau `running` belum berarti objek tersedia. Saat `succeeded` dan `result.key` ada, baca key itu melalui `media.get` dan periksa aset sebelum memasang URL. Rekonsiliasi manual tidak mengisi key yang hilang; temukan aset melalui pencarian media atau bukti provider yang sah, lalu verifikasi. Jangan menebak key/URL. Pada `failed`, baca `errorCode` dan perbaiki sebabnya. Pada `unknown`, periksa provider melalui alur pemulihan operasi; jangan replay otomatis.

Jika respons upload hilang, panggil `admin.operation_receipt` dengan `operation: "media.upload"` dan `requestKey` asli. `committed` hanya membuktikan transaksi antrean tersimpan, bukan unggahan provider selesai; lanjutkan ke job yang ditunjuk. `not_recorded` masih bisa berarti operasi berjalan. Periksa lagi atau replay operasi, payload dan key yang sama; bila token plan kedaluwarsa, buat plan baru dengan identitas yang sama. Jangan membuat key baru karena hasil belum jelas. Payload berbeda menjadi operasi baru hanya setelah hasil operasi lama diketahui.

## Pasang sesuai permintaan

Gunakan URL hasil server pada tool konten yang diminta, lalu ikuti validasi, checksum dan aturan publikasi tool tersebut. Upload tidak memberi izin mengubah konten live, mengirim ke orang lain, menghapus, memindahkan atau mengubah akses media. Teruskan tindakan yang sudah diizinkan; pisahkan bukti upload, bukti pemasangan dan status publikasi saat melaporkan hasil. Jika tool, izin atau provider belum tersedia, laporkan batas tepat tanpa mengklaim sukses.
