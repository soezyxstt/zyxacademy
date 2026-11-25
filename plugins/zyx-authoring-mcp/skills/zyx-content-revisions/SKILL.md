---
name: zyx-content-revisions
description: Merevisi Idea V3 dan Product belajar V3/V4/V5 yang tersimpan dengan ID stabil, bacaan per unit, review, rilis atomik, riwayat dan restore. Gunakan untuk edit Artikel, unit Diktat, flashcard atau Pembahasan; sumber baru, blog dan asesmen memakai workflow masing-masing.
---

# Revisi konten akademik Zyx

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.2"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum memulai run atau melakukan staging.
<!-- END:environment-connection -->

## Scope dan kontrak

Verifikasi target lewat `admin.environment`, lalu `admin.capabilities` domain `authoring` dengan `expectedEnvironment` dan `expectedOrigin`. Baca, edit, review dan rilis memakai scope `authoring:read`, `authoring:stage`, `authoring:review`, `authoring:publish`. Discovery tidak memberi izin; gunakan compact/target hanya bila schema server mendukungnya.

Pilih `kind: "idea"` atau `"product"`. Ambil `workflow.get_playbook` untuk skill `zyx-idea-bundle-mcp` atau `zyx-product-bundle-mcp`, tahap yang cocok, `bootstrapProtocol: 1`, `pluginVersion: "0.5.2"` dan kemampuan host nyata. Ikuti modul aktif; hentikan saat incompatible. Skill ini bukan ID bootstrap. Product tetap memerlukan Creator, Critic dan Student POV terpisah.

Protokol `authoring-revision` memakai bootstrap serta revisi tepat, tanpa `dryRun`, `requestKey`, `confirmationToken` atau field target environment. Artifact tersimpan memberi scope; tidak perlu Source Pack baru atau run lama. Pertahankan versi asal; V1/V2 dan konversi otomatis tidak didukung.

Jika hanya ada judul, cari lewat `authoring.list_imports({ bundleType, limit })`, lalu `authoring.get_import({ bundleType, importId })` untuk checksum/inventory. Keduanya tidak perlu run. Cocokkan judul/scope lewat konteks sebelum edit. Inventory saat ini maksimal 100 tanpa pagination; target yang tidak muncul belum terbukti tidak ada. Laporkan batas pencarian bila target belum ditemukan. Jangan menebak target, meminta ID internal, atau menambah filter judul/course maupun cursor yang tidak didukung.

## Baca dan edit unit yang tepat

1. Baca `authoring.get_edit_context` dengan `kind`, `importId`, `expectedRevision` teramati dan `bootstrapToken`. Buat draft melalui `authoring.create_revision` dari `baseImportId` dan checksum itu, atau lanjutkan draft revisi yang sudah ada. `entityIds: [id]` membatasi patch langsung pada satu entity.
2. Pakai `responseMode: "compact"` selama menulis dan `target` untuk isi satu unit dengan parent/jenis tepat. Tanpa target, compact hanya memberi identitas/dampak; review/readiness tetap `not_requested`.
3. Kirim `set`, `add`, `remove`, `move` melalui `authoring.patch_revision`. Gunakan ID stabil dan `beforeId` untuk urutan, bukan indeks array. Server mengelola scope, actor, versi, hash, proyeksi dan arsip.
4. Setelah write sukses, lanjutkan dengan `importId`, `revision` dan `execution` hasil server. Patch tanpa perubahan bisa mempertahankan identitas. Read harus cocok dengan kind/import/revision yang diminta; error tidak mengubah identitas terakhir.

| Unit | `target` |
| --- | --- |
| Idea, relasi, provenance, learning section | `entityType` sesuai (`idea`, `relation`, `provenance`, `learning_section`) dan `entityId`; tanpa selector bertingkat |
| Artikel atau blok | `entityType: "article"`, `entityId`, lalu `sectionId`; tambahkan `blockId` hanya dengan section induknya |
| Unit Diktat | `entityType: "diktat"`, `entityId`, `unitId`; tanpa `sectionId`, `blockId` atau `itemId` |
| Item Pembahasan V5 | `entityType: "solution_collection"`, `entityId`, `itemId` |
| Flashcard/set atau dependensi | `entityType: "flashcard"`, `"flashcard_set"` atau `"dependency"`, dan `entityId` |

Contoh field: `parts[part-id].markdown` atau `steps[step-id].reasonMarkdown` pada unit yang mendukungnya. Selector ID memakai huruf, angka, underscore, titik dua atau tanda hubung, bukan angka indeks. Untuk ID valid lain, baca lalu ganti array bertipe induknya. Source material/chunk hanya dibaca; sumber baru mengikuti workflow sumber.

## Gagal atau respons hilang

Baca `category`, `diagnostics`, `nextAction`: perbaiki field pada error isi, akses/bootstrap pada error izin, dan runtime pada error layanan. Konflik meminta baca ulang serta rekonsiliasi, bukan checksum pengganti otomatis.

Periksa konteks dan `authoring.list_revisions` sebelum write kedua. Replay patch memakai import, checksum dan operasi asli, bukan successor. Jangan mengulang create/restore secara buta atau memakai `admin.operation_receipt` untuk protokol ini. Helper Idea/Product di `lib/authoring/*-authoring-client.ts` hanya membawa identitas sukses bagi agent dengan checkout/transport; tidak ada retry, review atau publikasi otomatis.

## Review, bukti dan rilis

Ambil `get_edit_context` penuh (`responseMode: "full"`, tanpa `target`). Panggil `authoring.plan_release` dengan `entries: [{ kind, importId, expectedRevision }]` dan `bootstrapTokens` tiap jenis. Periksa dampak, bukti batal dan blocker; review isi/sumber/alasan yang berubah secara independen. Kirim bukti profil melalui `authoring.review_revision`. Reuse eksplisit memakai `evidence.reuseUnchanged: true` dan `evidence.reuseToken` dari `reviewReuse.token` terbaru, hanya untuk keputusan reviewer yang masih berlaku.

V4 memerlukan receipt pada revisi tepat; PDF asli wajib bila profil/plan memintanya, saat ini untuk Diktat. Jangan meminta PDF untuk V4 Artikel saja atau flashcard saja bila plan menandainya `not_required`. Jika V4 merujuk Idea kandidat dalam rilis yang sama, panggil `authoring.prepare_revision_verification` dengan entry tepat sebelum verifier. Gunakan execution dari konteks dan periksa hasil nyata. Plan atau preview tidak menggantikan attestation/receipt. V3 mengikuti bukti profilnya; V5 memakai lima keputusan per item dan `expectedReviewVersion` terbaru.

Replan setelah review/verifikasi. Dengan publikasi yang sudah diizinkan, panggil `authoring.publish_release` memakai entry sama dan `expectedPlanHash` terbaru. Rilis atomik memeriksa ulang reviewer, revisi, dependensi dan bukti; kegagalan mempertahankan versi live lama. Patch sukses bukan approval.

Maksimal 16 entry dalam satu course; scope bab tetap. Sumber/kutipan harus admitted dan aktif. Product dependency dari import lain yang belum published tetap blocker. Perubahan konteks cetak dapat menaikkan versi bukti Diktat walau teksnya sama.

Restore memakai `historicalImportId/expectedRevision` dari riwayat serta `currentImportId/currentRevision` live, lalu tetap melewati review/bukti/rilis. Saat melanjutkan sesi, ambil bootstrap segar dan execution token lewat konteks tepat. Jika tool tidak tersedia, laporkan batas tanpa menebak field atau berpindah environment.
