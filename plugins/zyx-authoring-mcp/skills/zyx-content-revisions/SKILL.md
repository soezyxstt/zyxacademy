---
name: zyx-content-revisions
description: Merevisi Idea V3 dan Product belajar V3/V4/V5 yang tersimpan dengan ID stabil, bacaan per unit, review, rilis atomik, riwayat dan restore. Gunakan untuk edit Artikel, unit Diktat, flashcard atau Pembahasan; sumber baru, blog dan asesmen memakai workflow masing-masing.
---

# Revisi konten akademik Zyx

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-stg` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.8"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain. Verifikasi identitas koneksi sebelum memulai run atau melakukan staging.

Panggil nama tool dari `tools/list`. Nama bertitik di skill ini merujuk ke operasi; nama panggilan biasanya mengganti titik dengan `_`, seperti `admin_environment`. Pengecualian: `authoring.get_solution_collection_review_context` memakai `authoring_solution_review_context`. Pertahankan nama bertitik pada argumen `operation` serta identitas konfirmasi dan receipt.
<!-- END:environment-connection -->

Jika akses kedaluwarsa atau izin kurang, ikuti [pemulihan koneksi](../zyx-operation-recovery/SKILL.md#koneksi-oauth) pada environment yang sama. Refresh OAuth tidak memperbarui bootstrap atau run authoring.

## Scope dan kontrak

Verifikasi target lewat `admin.environment`, lalu `admin.capabilities` domain `authoring` dengan `expectedEnvironment` dan `expectedOrigin`. Baca, edit, review dan rilis memakai scope `authoring:read`, `authoring:stage`, `authoring:review`, `authoring:publish`. Discovery tidak memberi izin; gunakan compact/target hanya bila schema server mendukungnya.

Pilih `kind: "idea"` atau `"product"`. Ambil `workflow.get_playbook` dengan `skill: "zyx-idea-bundle-mcp"` atau `skill: "zyx-product-bundle-mcp"`, tahap yang cocok, `bootstrapProtocol: 1`, `pluginVersion: "0.5.8"` dan kemampuan host nyata. Ikuti modul aktif; hentikan saat incompatible. Skill ini bukan ID bootstrap. Product tetap memerlukan Creator, Critic dan Student POV terpisah.

Protokol `authoring-revision` memakai bootstrap serta revisi tepat, tanpa `dryRun`, `requestKey`, `confirmationToken` atau field target environment. Artifact tersimpan memberi scope; tidak perlu Source Pack baru atau run lama. Pertahankan versi asal; V1/V2 dan konversi otomatis tidak didukung.

Jika hanya ada judul, pakai compact `authoring.list_imports` bila server mengiklankannya: isi `bundleType`, `courseId`/`chapterId` yang sudah diketahui, `query`, `statuses` dan `headsOnly: true`. Ikuti `cursor` hasil tanpa mengubah filter. Baca compact `authoring.get_import` untuk checksum; tambah `projections: ["inventory"]` saat perlu ID isi atau `["readiness"]` saat perlu cek rilis. Daftar dan metadata tidak menghitung readiness. Tanpa dukungan compact, pakai argumen lama `bundleType`/`limit` dan laporkan batas pencarian. Jangan menebak target atau meminta ID internal kepada pengguna.

## Baca dan edit unit yang tepat

1. Baca `authoring.get_edit_context` dengan `kind`, `importId`, `expectedRevision` teramati dan `bootstrapToken`. Buat draft melalui `authoring.create_revision` dari `baseImportId` dan checksum itu, atau lanjutkan draft revisi yang sudah ada. `entityIds: [id]` membatasi patch langsung pada satu entity.
2. Pakai `responseMode: "compact"` selama menulis dan `target` untuk isi satu unit dengan parent/jenis tepat. Tanpa target, compact hanya memberi identitas/dampak; review/readiness tetap `not_requested`.
3. Kirim `set`, `add`, `remove`, `move` melalui `authoring.patch_revision`. Gunakan ID stabil dan `beforeId` untuk urutan, bukan indeks array. Server mengelola scope, actor, versi, hash, proyeksi dan arsip.
4. Setelah write sukses, lanjutkan dengan `importId`, `revision` dan `execution` hasil server. Patch tanpa perubahan bisa mempertahankan identitas. Read harus cocok dengan kind/import/revision yang diminta; error tidak mengubah identitas terakhir.

Draft awal dari tool creation belum tentu punya lineage revisi. Ikuti `nextActions`; buat `create_revision` sebelum patch bila diminta. Pilih compact playbook/contract bila tersedia; kirim checksum hanya untuk isi modul/view yang sudah dibaca dan disimpan. Bootstrap, kompatibilitas dan token run tetap harus segar.

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

Untuk Diktat turunan, periksa unit terdampak beserta `sourceElementRefs`. Bila maknanya masih benar setelah Artikel berubah, gunakan `derivedContentReviews` hanya bila kontrak mendukungnya, dengan hash Artikel baru, ID unit tepat dan alasan review nyata. Ini memerlukan `authoring:review` dan audit actor. Jangan mengubah kata secara asal untuk menghapus status stale. Review sebagian tidak menutup unit lain; verifikasi dan approval rilis tetap wajib.

Jika bukti cetak hilang atau runtime berubah setelah draft terbentuk, gunakan `patch_revision` dengan `refreshPrintEvidence: true` dan `operations: []` bila tersedia. Server memeriksa ulang bukti lalu menaikkan versi cetak yang perlu, tanpa edit isi palsu. Bila bukti masih cocok, hasil tetap no-op. Lanjutkan dari identitas hasil dan verifikasi ulang sebelum review/rilis.

V4 memakai `purpose: "logic"` secara bawaan pada `verify_product_bundle` dan `get_verification`. Struktur, rujukan, notasi dan model yang didukung tidak memerlukan browser, PNG atau PDF. Review sumber, hitungan dan alasan tetap wajib dan mengikat receipt logika revisi tepat. Jika V4 merujuk Idea kandidat dalam rilis yang sama, panggil `authoring.prepare_revision_verification` dahulu. `not_started` atau plan berubah perlu request untuk tujuan dan identitas kini; jangan mengedit isi atau polling terus.

Saat PDF akhir Diktat diperlukan, minta `purpose: "pdf"` dan ikuti `verification.pdf.execution`. Server memakai ulang target yang tetap cocok serta membuat ulang target yang berubah. Publikasi tetap memerlukan byte PDF kanonis dan lineage kini untuk Diktat, tanpa syarat screenshot, gambar halaman atau inspeksi visual. Artikel V4 tanpa Diktat tidak perlu PDF. Jangan menukar plan hash logika/PDF atau merender pada tiap edit. V2/V3 tetap memakai bukti profil lama; V5 memakai lima keputusan per item dan `expectedReviewVersion` terbaru.

Replan setelah review/verifikasi. Dengan publikasi yang sudah diizinkan, panggil `authoring.publish_release` memakai entry sama dan `expectedPlanHash` terbaru. Rilis atomik memeriksa ulang reviewer, revisi, dependensi dan bukti; kegagalan mempertahankan versi live lama. Patch sukses bukan approval.

Maksimal 16 entry dalam satu course; scope bab tetap. Sumber/kutipan harus admitted dan aktif. Product dependency dari import lain yang belum published tetap blocker. Perubahan konteks cetak dapat menaikkan versi bukti Diktat walau teksnya sama.

Restore memakai `historicalImportId/expectedRevision` dari riwayat serta `currentImportId/currentRevision` live, lalu tetap melewati review/bukti/rilis. Saat melanjutkan sesi, ambil bootstrap segar dan execution token lewat konteks tepat. Jika tool tidak tersedia, laporkan batas tanpa menebak field atau berpindah environment.
