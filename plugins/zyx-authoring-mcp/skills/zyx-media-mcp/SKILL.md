---
name: zyx-media-mcp
description: Menemukan media Zyx, mengunggah berkas kecil melalui job MCP, dan mengambil URL penyajian untuk blog atau konten lain. Gunakan untuk media library, bukan mengakses objek privat sebarang.
---

# Media Zyx melalui MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.0"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.
<!-- END:environment-connection -->

Metadata paket: `{ "pluginVersion": "0.5.0", "bootstrapProtocol": 1 }`.

Panggil `admin.environment` pada koneksi tujuan dan cocokkan `environment` serta `origin` dengan target pengguna. Jika target belum jelas, pastikan target sebelum membaca data. Jangan mengganti staging dengan production atau sebaliknya. Kirim `expectedEnvironment` dan `expectedOrigin` pada setiap tool admin data. Baca `admin.capabilities` untuk domain yang relevan dan gunakan schema tool yang benar-benar tersedia. Izin yang kurang memerlukan consent OAuth yang sesuai; metadata discovery tidak memberikan izin baru.

Gunakan domain `media` pada discovery. `media.list` memakai `folderPath`, batas halaman dan cursor provider. Lanjutkan cursor untuk mencari aset yang sudah ada sebelum membuat duplikat. `media.get` menerima `key` pada domain `media/` yang diizinkan dan mengembalikan metadata, `publicPath`, `publicUrl`, `thumbnailCandidate` serta `byteContentVerified: false`. Pemeriksaan keberadaan tidak membuktikan isi byte atau render gambar. Jangan mengubah key menjadi URL dengan menebak hostname atau membuat signed URL sendiri.

Untuk unggahan, `media.upload` saat ini menerima berkas maksimal 512 KiB dengan `filename`, `mimeType`, `dataBase64` serta folder yang diizinkan. Periksa batas dan MIME yang diiklankan schema. Jangan memotong byte, memalsukan tipe, atau memecah satu berkas menjadi beberapa upload yang tidak dapat digabung hanya untuk melewati batas. Berkas lebih besar memakai alur unggahan yang memang tersedia; bila tidak ada jalur MCP yang mendukungnya, nyatakan batas itu tanpa mengklaim upload selesai.

Untuk mutasi yang sudah diizinkan pengguna, gunakan `dryRun: true` dan satu `requestKey`, periksa dampaknya, lalu jalankan payload dan key yang sama dengan `dryRun: false` serta `confirmationToken`. Perencanaan ini bukan permintaan izin ulang untuk setiap langkah draft yang sudah diizinkan. Publikasi, pengiriman ke orang lain, penghapusan, dan perubahan akses tetap harus sesuai cakupan instruksi pengguna. Pada konflik revisi, baca kembali target dan susun plan baru; jangan mengganti checksum diam-diam.

Unggahan menghasilkan job. Simpan ID job dan pantau `adminjobs.get` dengan scope job serta media yang sesuai. Status `queued` bukan objek yang sudah tersedia. Setelah sukses, ambil key hasil melalui `media.get` dan gunakan `publicPath` untuk `thumbnailUrl` blog. `publicUrl` tersedia untuk kebutuhan URL absolut pada konteks yang mendukungnya. Raw key seperti `media/...` bukan URL thumbnail.

Jika respons write hilang, gunakan `admin.operation_receipt` untuk `operation` dan `requestKey` yang sama. `not_recorded` belum membuktikan penolakan karena operasi bisa masih berjalan. Periksa lagi atau replay payload serta key asli, dengan plan baru bila token kedaluwarsa. Jangan membuat key baru hanya karena hasil belum diketahui. Untuk efek provider yang berstatus `unknown`, ikuti skill pemulihan operasi dan jangan replay otomatis.

Hasil provider `unknown` memerlukan pemeriksaan nyata sebelum rekonsiliasi; jangan membuat request key baru untuk mengulang upload yang mungkin sudah berhasil. Batas domain media tidak memberikan akses ke sumber kuliah, evidence, respons formulir, credential atau objek privat lain. Tidak ada izin implisit untuk menghapus atau memindahkan media; gunakan hanya tool yang tersedia dan tindakan yang diminta.
