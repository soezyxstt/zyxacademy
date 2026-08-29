# Authoring pipeline state machine

Gunakan state machine ini untuk memulai, menjeda, dan melanjutkan workflow `idea_product`. Selalu gunakan contract terbaru dari MCP; nama state di bawah adalah status orkestrasi client, bukan status database.

## States

| State | Entry condition | Exit condition |
|---|---|---|
| `SCOPE_CONFIRMATION_REQUIRED` | Kandidat course/chapter ambigu, near-match, atau berbeda dari scope terkunci | Operator mengonfirmasi pilihan opaque yang ditampilkan |
| `SOURCE_PREPARATION` | PDF course tersimpan atau file lokal dan urutannya tersedia | Source Pack selesai dibuat |
| `SOURCE_VALIDATION` | ZIP dan seluruh stored atau local originals tersedia | `source.ingest` mengembalikan `valid: true` |
| `IDEA_AUTHORING` | Run `idea_product` dan contract aktif tersedia | Idea Bundle lolos validation |
| `IDEA_VALIDATED` | Idea Bundle valid | Operator mengotorisasi submission Idea |
| `IDEA_STAGED` | `authoring.submit_idea_bundle` berhasil | Checkpoint dicatat |
| `WAITING_IDEA_PUBLICATION` | Idea staged tetapi belum terbukti published | MCP menunjukkan Idea target sudah published dan context tetap fresh |
| `PRODUCT_AUTHORING` | Idea published, source aktif, dan dependency fresh | Product Bundle lolos validation |
| `PRODUCT_VALIDATED` | Product Bundle valid | Selesai untuk target `product_validated`, atau operator mengotorisasi submission Product |
| `PRODUCT_STAGED` | `authoring.submit_product_bundle` berhasil | Laporan akhir diberikan |

Gunakan state tambahan `NEEDS_OPERATOR_DECISION`, `BLOCKED_BY_VALIDATION`, atau `STALE_CONTEXT` ketika transisi normal tidak aman. Sertakan state sebelumnya agar resume tidak mengulang pekerjaan yang sudah terbukti valid.

## Resume protocol

1. Baca checkpoint terakhir dan cocokkan artifact berdasarkan path, checksum, bundle ID, serta scope yang dilaporkan.
2. Panggil MCP read tools yang relevan untuk memastikan run, contract, published Idea, source excerpt, dan dependency masih sesuai.
3. Jangan mengandalkan pernyataan operator saja untuk status yang dapat diverifikasi MCP. Bila MCP belum menunjukkan Idea published, tetap di `WAITING_IDEA_PUBLICATION`.
4. Bila context stale atau token tidak valid, ambil run/contract baru. Pertahankan artifact lama sebagai evidence, tetapi validasi ulang semua dependency sebelum submit.
5. Lanjutkan dari entry condition paling akhir yang masih terbukti benar. Jangan mengulang ekstraksi atau authoring hanya karena sesi sebelumnya telah berakhir.

## Validation and retry

- Perbaiki kegagalan schema, packaging, checksum generation, atau metrik deterministik sesuai issue MCP, lalu validasi ulang.
- Jangan mengganti stable identity, scope, source checksum, Idea version, semantic hash, atau dependency hash secara manual untuk membuat validation lolos.
- Jika server melaporkan retry identik sebagai sukses atau no-op, catat hasil tersebut tanpa membuat bundle baru.
- Jika ID yang sama memiliki content atau checksum berbeda, berhenti dan laporkan conflict; jangan membuat identitas pengganti tanpa dasar contract.
- Batasi retry pada perubahan yang memiliki bukti dari issue MCP. Kegagalan berulang yang sama menjadi `BLOCKED_BY_VALIDATION` dan harus dilaporkan.

## Mandatory pauses

Selalu jeda ketika:

- urutan dokumen belum disepakati;
- teks atau visual sumber ambigu;
- course/chapter ambigu, near-match, atau berbeda dari scope terkunci;
- pemecahan atau relasi Idea memerlukan judgment substantif;
- warning near-duplicate atau formula trace membutuhkan keputusan;
- submission belum diotorisasi;
- Idea belum terbukti published;
- kandidat soal ITB memerlukan pilihan operator;
- context stale atau dependency publication-blocking.

## Checkpoint report

Gunakan format ringkas berikut. Jangan sertakan credential atau token akses.

```text
Pipeline: <status>
Completed: <last completed state>
Scope: <course label> / <chapter label>
Artifacts: <path, checksum, bundle ID where applicable>
Quality: <valid/invalid and blocking issue summary>
Staging: <not requested/not submitted/submitted>
Waiting for: <objective condition or operator decision>
Resume: <one concise instruction>
```

Untuk `WAITING_IDEA_PUBLICATION`, instruksi resume yang disarankan adalah: "Idea sudah direview dan dipublikasikan; verifikasi melalui MCP lalu lanjutkan pipeline ke Product Bundle."
