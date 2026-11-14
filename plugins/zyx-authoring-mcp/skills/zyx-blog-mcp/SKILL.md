---
name: zyx-blog-mcp
description: Membuat, menyunting, memeriksa, dan menerbitkan blog Zyx melalui MCP, termasuk thumbnail dan pemulihan simpan. Gunakan untuk blog publik, bukan Artikel akademik Product Bundle.
---

# Blog Zyx melalui MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.0"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.
<!-- END:environment-connection -->

Metadata paket: `{ "pluginVersion": "0.5.0", "bootstrapProtocol": 1 }`.

Panggil `admin.environment` pada koneksi tujuan dan cocokkan `environment` serta `origin` dengan target pengguna. Jika target belum jelas, pastikan target sebelum membaca data. Jangan mengganti staging dengan production atau sebaliknya. Kirim `expectedEnvironment` dan `expectedOrigin` pada setiap tool admin data. Baca `admin.capabilities` untuk domain yang relevan dan gunakan schema tool yang benar-benar tersedia. Izin yang kurang memerlukan consent OAuth yang sesuai; metadata discovery tidak memberikan izin baru.

Gunakan domain `blog` pada discovery. Cari artikel dengan `blog.search` memakai `query`, status atau kategori, lalu baca `blog.get_edit_context` untuk konten, revision, kemampuan dan dampak publiknya. `blog.list` tetap tersedia untuk daftar ringkas. Jangan menganggap artikel hilang hanya karena belum muncul pada halaman pertama; lanjutkan pagination.

Untuk draft baru, susun `title` atau judul H1 awal, `content` Markdown, kategori dan ringkasan yang sesuai. `blog.validate` menerima `article` untuk konten baru; untuk revisi tersimpan gunakan `id`, `expectedRevision` dan `changes`. Jangan mencampur kedua bentuk. Validasi hanya mengembalikan proyeksi dan diagnosis, tidak menyimpan, mengambil aset, merender browser, memanggil AI, atau menerbitkan.

Gunakan `blog.create` untuk membuat draft. Server dapat menyusun slug dan ringkasan yang kosong secara deterministik serta menghitung waktu baca. Ringkasan editorial dapat ditulis agent; tidak ada kebutuhan memanggil generator tambahan. Untuk revisi, gunakan `blog.update` dengan revision terakhir. Judul baru tidak berarti URL baru; ubah slug hanya ketika diminta dan periksa dampak tautannya. Waktu baca dihitung server, bukan nilai yang perlu ditebak agent.

Thumbnail tersedia melalui `thumbnailUrl`. Pilih atau unggah aset melalui skill media, tunggu hasil provider yang berhasil, kemudian gunakan `publicPath` yang dikembalikan `media.get`. URL eksternal harus didukung penyaji gambar aplikasi. Jangan memasukkan raw storage key atau URL bertoken sebagai thumbnail. Jangan menganggap validasi URL membuktikan aset bisa dimuat.

Untuk mutasi yang sudah diizinkan pengguna, gunakan `dryRun: true` dan satu `requestKey`, periksa dampaknya, lalu jalankan payload dan key yang sama dengan `dryRun: false` serta `confirmationToken`. Perencanaan ini bukan permintaan izin ulang untuk setiap langkah draft yang sudah diizinkan. Publikasi, pengiriman ke orang lain, penghapusan, dan perubahan akses tetap harus sesuai cakupan instruksi pengguna. Pada konflik revisi, baca kembali target dan susun plan baru; jangan mengganti checksum diam-diam.

Simpan draft terlebih dahulu ketika pengguna belum meminta publikasi. `blog.set_publication` mengubah published/draft secara eksplisit setelah membaca revision terbaru. Mengubah artikel yang sudah published dapat langsung mengubah halaman publik; periksa dampak itu sebelum commit. `scheduled` bukan timer publikasi yang sudah berfungsi. Jangan menjanjikan terbit otomatis atau membuat schedule palsu.

Jika respons write hilang, gunakan `admin.operation_receipt` untuk `operation` dan `requestKey` yang sama. `not_recorded` belum membuktikan penolakan karena operasi bisa masih berjalan. Periksa lagi atau replay payload serta key asli, dengan plan baru bila token kedaluwarsa. Jangan membuat key baru hanya karena hasil belum diketahui. Untuk efek provider yang berstatus `unknown`, ikuti skill pemulihan operasi dan jangan replay otomatis.

Laporkan ID, slug, status dan revision yang benar-benar tersimpan. Hasil draft bukan publikasi, dan preview Markdown bukan bukti inspeksi visual browser. Web Admin tidak wajib untuk alur blog yang tersedia.
