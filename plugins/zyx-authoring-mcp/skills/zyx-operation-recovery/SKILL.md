---
name: zyx-operation-recovery
description: Memulihkan respons operasi Zyx MCP yang hilang, token plan kedaluwarsa, konflik revision atau job provider yang belum pasti. Gunakan untuk melanjutkan operasi dengan identitas asli dan mencegah efek ganda, bukan membuat perubahan pengganti.
---

# Pemulihan operasi Zyx MCP

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.2"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum memulai run atau melakukan staging.
<!-- END:environment-connection -->

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

## Job provider

Gunakan `adminjobs.get` dengan izin job dan operasi asal. Queued/running belum berarti selesai. Status `unknown` berarti provider mungkin sudah menulis; jangan enqueue ulang otomatis. Periksa provider melalui akses yang sah, lalu panggil `adminjobs.reconcile` hanya bila pengguna mengizinkan, dengan revision terbaru, `reportedOutcome`, alasan dan referensi bukti nyata. Tool mencatat pernyataan operator, tidak memeriksa bukti atau mengulang efeknya.

`adminjobs.cancel` hanya menerima job yang masih queued dan memerlukan izin pembatalan. Reconcile/cancel memakai plan mutasi sendiri; receipt keduanya tidak mengubah sejarah operasi asal.

Untuk konflik Sheets, baca ulang `forms.responses.sheet_state`, pertahankan spreadsheet entitas dan blok data aplikasi. Frasa `TIMPA <slug>` harus datang dari pengguna, bukan hasil yang dikarang agent.

## Authoring dan revisi akademik

Ikuti [zyx-content-revisions](../zyx-content-revisions/SKILL.md) untuk Idea/Product V3+ tersimpan. Baca `authoring.get_edit_context` pada import dan checksum yang diamati; pakai compact/target saat mengedit dan konteks penuh sebelum review. Setelah write sukses, lanjutkan dengan identitas penerus yang dikembalikan. Jangan membuat Source Pack, mengganti checksum, atau retry write secara buta untuk memperbaiki konflik.

Untuk respons `authoring.create_idea_draft` atau `authoring.create_product_draft` yang hilang, periksa import yang ada dan ikuti `initialDraft.retry`: pertahankan draftKey, run token dan payload asli. Refresh bootstrap/kontrak menurut playbook; jangan menyamakan token admin dengan bootstrap authoring. `authoring.restore_revision` membuat draft baru, bukan menghapus riwayat atau memberi izin publikasi.

Laporkan commit DB, keadaan target kini, hasil provider dan aksi pemulihan secara terpisah sesuai bukti. Jangan menyebut data sudah terkirim atau published hanya karena enqueue, validasi atau receipt berhasil.
