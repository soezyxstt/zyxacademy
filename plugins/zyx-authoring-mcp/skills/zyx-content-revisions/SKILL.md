---
name: zyx-content-revisions
description: Mengubah Idea V3 dan Product belajar V3/V4/V5 yang sudah tersimpan melalui patch ID stabil, rilis atomik, riwayat dan restore. Gunakan untuk revisi konten akademik, bukan blog atau ingestion sumber baru.
---

# Revisi konten akademik Zyx

<!-- BEGIN:environment-connection -->
Gunakan koneksi MCP `zyx-authoring-staging` untuk environment `staging` di endpoint `https://staging.zyxacademy.com/api/mcp/authoring` (`pluginVersion: "0.5.0"`, `bootstrapProtocol: 1`). Jangan gunakan koneksi Zyx dari environment lain.
<!-- END:environment-connection -->

Metadata paket: `{ "pluginVersion": "0.5.0", "bootstrapProtocol": 1 }`.

Panggil `admin.environment` pada koneksi tujuan dan cocokkan `environment` serta `origin` dengan target pengguna. Jika target belum jelas, pastikan target sebelum membaca data. Jangan mengganti staging dengan production atau sebaliknya. Kirim `expectedEnvironment` dan `expectedOrigin` pada setiap tool admin data. Baca `admin.capabilities` untuk domain yang relevan dan gunakan schema tool yang benar-benar tersedia. Izin yang kurang memerlukan consent OAuth yang sesuai; metadata discovery tidak memberikan izin baru.

Untuk konten yang sudah ada, gunakan revisi sebelum mempertimbangkan upload ZIP ulang. Pilih `kind: "idea"` atau `"product"`, lalu ambil bootstrap tahap yang sesuai melalui `workflow.get_playbook` dengan skill literal `zyx-idea-bundle-mcp` atau `zyx-product-bundle-mcp`, protocol `1`, versi paket di atas, dan capability host yang benar. Jangan memakai `zyx-content-revisions` sebagai bootstrap skill ID. Discovery admin tidak menggantikan bootstrap authoring.

Baca `authoring.get_edit_context` dengan import ID dan checksum yang terakhir diamati. `authoring.create_revision` membuat draft dari versi live atau draft yang bisa diedit; versi live tetap tersedia. Ubah bagian, blok, langkah Pembahasan, Idea, relasi atau provenance melalui `authoring.patch_revision` dengan ID stabil. Jangan memakai posisi array atau mengubah identitas, hash dan scope yang dikelola server. Setiap patch bermakna mengembalikan import ID dan revision penerus; gunakan identitas yang dikembalikan untuk langkah berikutnya.

`authoring.plan_release` membaca entry Idea/Product yang tepat, unit berubah, review yang masih berlaku, dependensi dan blocker. Gunakan review ulang untuk isi, alasan, provenance atau struktur yang berubah. `authoring.review_revision` dapat memakai `reuseUnchanged: true` hanya dengan `reuseToken` server yang masih berlaku dan keputusan eksplisit reviewer. Reuse bukan izin menyetujui konten yang belum diperiksa.

Untuk V4 yang merujuk revisi Idea dalam rilis yang sama, panggil `authoring.prepare_revision_verification` dengan entry tepat sebelum operator tepercaya. Lanjutkan dengan execution run/token yang dikembalikan konteks untuk verifikasi, receipt dan PDF asli. Jangan mengganti receipt dengan screenshot buatan atau pernyataan agent. V5 Pembahasan memakai review per item, bukan receipt V4.

Dengan publikasi yang sudah diizinkan dan scope `authoring:publish`, replan lalu panggil `authoring.publish_release` dengan entry yang sama serta `expectedPlanHash`. Penggantian berlangsung atomik; kegagalan mempertahankan versi live lama. Konflik berarti baca ulang dan rekonsiliasi, bukan retry dengan mengganti checksum tanpa pemeriksaan.

Gunakan `authoring.list_revisions` untuk riwayat. `authoring.restore_revision` membuat draft baru dari konten historis terhadap baseline live saat ini; tetap ikuti review dan gate bukti sebelum publikasi. Resume memakai bootstrap sesi baru tanpa wajib Source Pack baru atau run authoring lama.

Batas saat ini: hanya V3 ke atas dan Product belajar, scope bab tetap, release berada dalam satu course. Sumber dan excerpt harus tetap admitted dan aktif; ingestion sumber baru mengikuti workflow sumber. Dependensi ke Product yang belum published pada import lain tetap blocker. Perubahan konteks cetak dapat menaikkan revisi bukti Diktat walaupun teksnya sama. Jangan mengklaim semua dependensi otomatis direkonsiliasi. Web Admin tidak wajib untuk alur yang didukung.
