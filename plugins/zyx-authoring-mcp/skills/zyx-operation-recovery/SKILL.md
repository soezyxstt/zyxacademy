---
name: zyx-operation-recovery
description: Memulihkan koneksi OAuth, izin kurang, respons operasi Zyx MCP yang hilang, token plan kedaluwarsa, konflik revision atau job provider yang belum pasti. Gunakan untuk melanjutkan operasi dengan identitas asli dan mencegah efek ganda.
---

# Pemulihan operasi Zyx MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.5"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum memulai run atau melakukan staging.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

## Koneksi OAuth

Biarkan host menangani refresh OAuth melalui metadata server. Access token baru berlaku paling lama satu jam dan refresh token berotasi; host harus menyimpan pasangan terbaru. Kedaluwarsa sesi browser biasa tidak berarti koneksi OAuth baru harus dibuat ulang. Jangan meminta atau menyalin refresh token ke percakapan, bundle maupun checkpoint.

Pada HTTP 401, gunakan refresh host terlebih dahulu. Pada `invalid_grant`, grant dicabut, atau koneksi lama tanpa refresh token, ikuti alur hubungkan ulang pada environment yang sama. Pada HTTP 403, periksa hak admin; refresh tidak menambah hak. Pada HTTP 503, ikuti `Retry-After` dan periksa layanan; jangan menghapus koneksi untuk gangguan sementara.

Jika scope kurang, minta consent untuk gabungan izin lama yang masih diperlukan dan izin baru. Refresh tidak dapat menambah scope; consent baru mengganti pilihan lama. Setelah reautentikasi, periksa identitas dan hasil operasi sebelum mengirim write lagi. Token OAuth, bootstrap dan run authoring punya masa berlaku serta ikatan sendiri; ikuti `remediation` untuk memperbarui konteks yang tepat.

## Tetapkan operasi yang dipulihkan

Panggil `admin.environment`; cocokkan environment/origin dengan target pengguna dan koneksi asal. Gunakan `expectedEnvironment` dan `expectedOrigin` pada tool admin data. Baca `admin.capabilities` pada domain operasi asal serta `adminjobs` bila terkait provider; periksa pagination, scope, `protocol` dan aturan retry. Jangan beralih akun atau environment untuk melewati penolakan.

Cari operasi, target, payload, `requestKey` atau identitas revisi asli dari konteks tugas yang sah. Jika identitas penting hilang, periksa dahulu; jangan menebaknya. Izin tugas yang sudah ada tetap berlaku pada tindakan yang sama, tetapi tidak mengizinkan target, isi atau efek baru.

## Mutasi dengan protocol admin-plan

Panggil `admin.operation_receipt` dengan `operation`, `requestKey` dan `includeResult: false` pada actor/origin asli. Jika hasil bisnis diperlukan, `includeResult: true` tetap memerlukan izin operasi asal; receipt operasi job tetap hanya metadata. Jangan meminta raw audit snapshot atau credential.

| Hasil | Tindakan |
| --- | --- |
| `committed` | Gunakan hasil historis atau baca target untuk keadaan kini. Jangan ulangi dengan key baru. Commit DB tidak membuktikan keberhasilan provider. |
| `not_recorded` | Hasil DB belum diketahui dan permintaan bisa masih berjalan. Baca lagi atau replay hanya operasi, payload dan key asli. |
| Token konfirmasi kedaluwarsa | Buat dry-run baru untuk payload/key yang sama, periksa dampak, lalu jalankan dengan token baru. |
| `REVISION_CONFLICT` | Baca target terkini dan rekonsiliasi; jangan mengganti revision agar payload lama dipaksa masuk. |
| Scope atau sesi ditolak | Pulihkan autentikasi/consent yang benar; jangan memperlebar izin atau mengubah akun secara diam-diam. |

Jika hasil lama belum jelas, jangan mengganti isi atau `requestKey`. Sesudah hasilnya diketahui, perubahan yang memang berbeda memerlukan intent/key dan plan sendiri. Receipt ini hanya mendukung mutasi `admin-plan`; jangan pakai untuk submission assessment atau revisi bundle.

## Antrean dan status job

Google Cloud Tasks mengantar pekerjaan melalui adapter server. Nama `inngest` dan bentuk event lama dapat tetap muncul sebagai lapisan kompatibilitas di kode; itu bukan instruksi untuk menyiapkan akun Inngest, memanggil `/api/inngest` atau membuat task Google langsung. Gunakan tool domain dan ID aplikasi yang dikembalikan. Receipt antrean hanya membuktikan permintaan tersimpan; hasil backend tetap perlu diperiksa.

| Pekerjaan | Status dan tindakan berikutnya |
| --- | --- |
| Halaman PDF dari `source.read_file` | Panggil `source.get_read_job` dengan `fileKey`/`jobId` asal setelah `pollAfterMs`. `retryFailed: true` hanya untuk halaman failed; pertahankan hasil complete. |
| Figure dari `source.extract_figure` | Panggil `source.get_figure_job` dengan `fileKey`/`assetId`, run/bootstrap dan stage asal. Saat complete, baca `source.get_figure` dan periksa varian serta hak publikasi. |
| Upload media, ekspor Sheets, Meet, notifikasi | Panggil `adminjobs.get` dengan ID job admin, `jobs:read` dan izin operasi asal. Periksa hasil bisnis selain status succeeded. |
| `generation.start` | Selesaikan job pengantar melalui `adminjobs.get`, lalu pantau `jobs.get` dengan `result.jobId`; keduanya bukan job yang sama. |
| Verifikasi Product V4 | `not_started` atau plan berubah perlu `authoring.verify_product_bundle` pada plan kini. Pantau `get_verification` dengan import/run dan `planHash` tepat. Ikuti `verification.execution`; `local_playwright` perlu operator yang mendukung target. Polling tidak memulai eksekusi. |

Pertahankan actor dan koneksi asal saat polling. Pada batas sesi atau versi sumber, baca error dan pulihkan scope yang tepat; jangan mengganti ID job atau memakai antrean lain. Jangan menyamakan status `complete` milik sumber, `succeeded` milik job admin dan `evaluation.ready` milik verifikasi.

## Job provider

Gunakan `adminjobs.get` dengan izin job dan operasi asal. Queued/running belum berarti selesai. Status `unknown` berarti provider mungkin sudah menulis; jangan enqueue ulang otomatis. Periksa provider melalui akses yang sah, lalu panggil `adminjobs.reconcile` hanya bila pengguna mengizinkan, dengan revision terbaru, `reportedOutcome`, alasan dan referensi bukti nyata. Tool mencatat pernyataan operator, tidak memeriksa bukti atau mengulang efeknya.

`adminjobs.cancel` hanya menerima job yang masih queued dan memerlukan izin pembatalan. Reconcile/cancel memakai plan mutasi sendiri; receipt keduanya tidak mengubah sejarah operasi asal.

Untuk konflik Sheets, baca ulang `forms.responses.sheet_state`, pertahankan spreadsheet entitas dan blok data aplikasi. Frasa `TIMPA <slug>` harus datang dari pengguna, bukan hasil yang dikarang agent.

## Authoring dan revisi akademik

Ikuti [zyx-content-revisions](../zyx-content-revisions/SKILL.md) untuk Idea/Product V3+ tersimpan. Baca `authoring.get_edit_context` pada import dan checksum yang diamati; pakai compact/target saat mengedit dan konteks penuh sebelum review. Setelah write sukses, lanjutkan dengan identitas penerus yang dikembalikan. Jangan membuat Source Pack, mengganti checksum, atau retry write secara buta untuk memperbaiki konflik.

Untuk respons `authoring.create_idea_draft` atau `authoring.create_product_draft` yang hilang, periksa import yang ada dan ikuti `initialDraft.retry`: pertahankan draftKey, run token dan payload asli. Refresh bootstrap/kontrak menurut playbook; jangan menyamakan token admin dengan bootstrap authoring. `authoring.restore_revision` membuat draft baru, bukan menghapus riwayat atau memberi izin publikasi.

Laporkan commit DB, keadaan target kini, hasil provider dan aksi pemulihan secara terpisah sesuai bukti. Jangan menyebut data sudah terkirim atau published hanya karena enqueue, validasi atau receipt berhasil.
