---
name: zyx-operation-recovery
description: Memulihkan operasi Zyx MCP yang responsnya hilang, token plannya kedaluwarsa, revisinya konflik, atau job providernya belum pasti. Gunakan untuk melanjutkan operasi yang sudah ada, bukan membuat perubahan baru.
---

# Pemulihan operasi Zyx MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.0"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.
<!-- END:environment-connection -->

Metadata paket: `{ "pluginVersion": "0.5.0", "bootstrapProtocol": 1 }`.

Panggil `admin.environment` pada koneksi tujuan dan cocokkan `environment` serta `origin` dengan target pengguna. Jika target belum jelas, pastikan target sebelum membaca data. Jangan mengganti staging dengan production atau sebaliknya. Kirim `expectedEnvironment` dan `expectedOrigin` pada setiap tool admin data. Baca `admin.capabilities` untuk domain yang relevan dan gunakan schema tool yang benar-benar tersedia. Izin yang kurang memerlukan consent OAuth yang sesuai; metadata discovery tidak memberikan izin baru.

Mulai dari nama operasi, request key asli, target, environment dan hasil terakhir yang diketahui. Jika salah satu identitas penting tidak tersedia, cari dari konteks tugas yang sah; jangan menebak target atau membuat operasi pengganti. Discovery menjelaskan izin yang masih kurang dan batas recovery. Izin tugas yang sudah diberikan tetap berlaku, tetapi tidak mencakup perubahan payload atau target baru.

Untuk respons mutasi yang hilang, panggil `admin.operation_receipt` dengan `operation`, `requestKey`, target environment/origin dan `includeResult: false`. Default hanya metadata commit, target dan waktu. Bila hasil bisnis dibutuhkan, gunakan `includeResult: true` hanya dengan izin operasi asal yang masih berlaku. Receipt job admin tetap metadata saja jika hasilnya memerlukan izin tambahan. Jangan meminta raw audit snapshot atau credential.

- `committed` membuktikan transaksi database dan receipt sudah commit, bukan keberhasilan provider. Gunakan hasil atau baca target kembali; jangan mengulangi perubahan dengan key baru. Untuk operasi antrean, pantau job sebelum menyatakan delivery atau upload selesai.
- `not_recorded` belum membuktikan penolakan. Permintaan awal bisa masih berjalan. Periksa lagi atau replay operasi dan payload yang sama dengan key asli. Jika token konfirmasi kedaluwarsa, siapkan plan baru untuk payload dan key yang sama.
- `REVISION_CONFLICT` memerlukan pembacaan target terbaru dan rekonsiliasi. Jangan mengganti revision untuk memaksa payload lama.
- Error scope atau sesi memerlukan autentikasi/consent yang tepat. Jangan beralih ke koneksi atau akun lain untuk melewati penolakan.

Untuk job eksternal, gunakan `adminjobs.get`; receipt antrean bukan bukti provider selesai. `unknown` berarti provider mungkin telah melakukan efeknya. Periksa provider melalui akses yang sah, lalu gunakan `adminjobs.reconcile` hanya dengan outcome, alasan dan referensi bukti nyata. Rekonsiliasi adalah pernyataan operator, bukan verifikasi otomatis. Jangan mengarang bukti atau mengulang provider secara otomatis. Hanya job yang masih queued dapat dibatalkan jika pengguna mengizinkannya.

Untuk authoring/revisi akademik, read-after-conflict memakai `authoring.get_edit_context` atau konteks profile yang tepat dan checksum terakhir. Gunakan skill revisi konten untuk melanjutkan release; jangan menyamakan plan/review authoring dengan token mutasi admin. Restore membuat draft baru, bukan menghapus riwayat atau memberikan izin publikasi.

Laporkan apa yang commit, apa yang hanya queued, apa yang belum diketahui, dan aksi pemulihan yang benar-benar dilakukan. Aksi sensitif seperti credential, pengaturan deployment atau penanganan bukti provider tetap mengikuti jalur otorisasi yang tersedia; tidak ada tool generik SQL, HTTP atau shell untuk melewati batas MCP.
