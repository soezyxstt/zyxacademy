# Orkestrasi Rebuild Zyx Ops AI oleh AGY High

## Model kerja

Primary agent hanya bertindak sebagai:

- Orkestrator dan pembuat handoff.
- Penjaga scope, file ownership, keamanan, dan dependency.
- Penerima serta penilai report AGY.
- Pemeriksa seluruh diff dan validation evidence.
- Pelaksana validasi kecil dan visual sign-off yang tidak boleh didelegasikan.
- Pemberi keputusan checkpoint.

Seluruh discovery lanjutan, implementasi, perbaikan, test authoring, dan dokumentasi dikerjakan oleh AGY dengan model tetap:

`gemini-3.7-flash-high`

Tidak menggunakan Flash Medium, Luna, OpenCode, atau worker lain untuk program ini. Jika AGY mengalami genuine failure, primary boleh melakukan satu safe retry tanpa melonggarkan sandbox. Jika tetap gagal, checkpoint dihentikan dan dilaporkan kepada pengguna.

Tidak ada feature flag. V2 menggantikan implementasi lama setelah seluruh checkpoint diterima.

## Siklus wajib setiap checkpoint

1. Primary memeriksa status repo dan dependency checkpoint.
2. Primary membuat handoff lengkap dengan objective, input paths, writable paths, file ownership, exclusions, validation, evidence, dan stop condition.
3. Primary menambahkan permission AGY hanya untuk path yang dibutuhkan.
4. AGY menjalankan implementasi dengan:

   `agy --prompt-interactive <handoff> --model gemini-3.7-flash-high --mode accept-edits --sandbox --log-file <task-log>`

5. AGY mengembalikan report terstruktur.
6. Primary memeriksa:
   - `git status --short`
   - seluruh `git diff`
   - kesesuaian file ownership
   - focused tests dan exit status
   - unauthorized or unrelated changes
   - acceptance criteria checkpoint
7. Primary memberikan satu verdict:
   - `ACCEPT`: checkpoint ditutup dan tahap berikutnya boleh dimulai.
   - `REVISE`: patch masih dapat diperbaiki dalam scope yang sama. AGY menerima correction handoff melalui `--continue`.
   - `RETRY`: proses AGY gagal secara teknis sebelum menghasilkan patch yang dapat dinilai. Maksimal satu safe retry.
   - `BLOCK`: objective tidak dapat diselesaikan tanpa keputusan pengguna atau perluasan scope.
8. Primary tidak memperbaiki kode AGY sendiri. Semua kekurangan patch dikembalikan kepada AGY.
9. Percakapan AGY hanya memakai `--continue` untuk checkpoint yang sama. Checkpoint baru memakai conversation baru.

## Checkpoint 1: Kontrak dan baseline

Task ID: `OPS-AI-V2-CP1-CONTRACTS`

AGY harus:

- Memetakan kontrak drawer, API, tools, proposal, provider lifecycle, Vectorize, knowledge chunking, dan tests yang ada.
- Mendefinisikan `OpsAiUIMessage` berbasis AI SDK `UIMessage`.
- Mendefinisikan typed data parts untuk work step, citation, proposal, dan error.
- Membuat authorization matrix dan klasifikasi tool:
  - read-only
  - retrieval
  - proposal-only
  - confirmation executor
- Menetapkan batas tool loop, history, timeout, retrieval count, retry, dan cancellation.
- Menulis focused contract tests dan fixtures sebelum implementasi runtime.
- Tidak mengubah perilaku production pada checkpoint ini.

Report khusus:

- Kontrak public types final.
- Daftar tool dan kelas keamanan.
- Threat model untuk prompt injection, replay, stale proposal, PII, dan citation palsu.
- Test fixtures dan exit status.
- Daftar keputusan yang sudah terkunci dan unverified assumptions.

Kriteria `ACCEPT`:

- Tidak ada tool mutasi yang dapat dieksekusi langsung oleh model.
- Semua message parts type-safe.
- Citation dapat diikat ke `runId`, `stepId`, dan `toolCallId`.
- Tidak ada perubahan UI atau runtime prematur.

## Checkpoint 2: Semantic admin knowledge

Task ID: `OPS-AI-V2-CP2-KNOWLEDGE`

AGY harus:

- Menambah namespace terisolasi `admin_ops_knowledge`.
- Menambah entity type `admin_document` dan access class `admin`.
- Menggunakan `canonical-content-v2`, document/query embedding, dan Vectorize worker boundary yang sudah ada.
- Menambah source catalog, chunk catalog, dan dedicated admin knowledge sync queue.
- Menggunakan semantic block chunker yang mempertahankan heading, offsets, content hash, dan version.
- Membuat source registry terkurasi.

Korpus yang boleh diindeks:

- Architecture, features, DB schema, development, deployment.
- Runbook operasi dan readiness checklist aktif.
- Bundle contract aktif.
- Proyeksi aman dari Drizzle schema.
- Katalog feature flag, admin routes, admin sitemap, dan tool definitions.

Korpus yang wajib dikecualikan:

- `.env`, credential, private key, cookie, session, token.
- User records atau production data.
- Historical audit, handoff, plan, dan generated artifacts.
- Test fixtures yang dapat memuat PII.
- `node_modules` dan arbitrary source-code ingestion.

Retrieval flow:

- Embed query.
- Query Vectorize top 12.
- Hydrate chunk aktif dari database.
- Terapkan deterministic heading/path boost.
- Deduplicate dan ambil maksimal 6 sumber.
- Jika Vectorize gagal, tampilkan retrieval failure. Jangan diam-diam mengganti dengan lexical answer yang diklaim semantic.

Report khusus:

- Source dan chunk counts.
- Manifest hash.
- Included dan excluded paths.
- Upsert, delete, unchanged, dan stale counts.
- Golden retrieval query beserta top results dan scores.
- Bukti namespace isolation dan admin authorization.
- Semua migration dan validation exit status.
- Konfirmasi bahwa staging atau production belum dimutasi tanpa authorization.

Kriteria `ACCEPT`:

- Stable chunk IDs dan locator terbukti deterministik.
- Secret-bearing paths tidak dapat masuk indeks.
- Stale source menghasilkan delete operation.
- Query admin tidak bercampur dengan namespace tutor atau student.
- Golden retrieval menemukan sumber relevan untuk fitur, schema, runbook, route, dan incident workflow.

## Checkpoint 3: Native streaming agent dan read-only tools

Task ID: `OPS-AI-V2-CP3-RUNTIME`

AGY harus:

- Menghapus direct one-shot JSON response, fenced `tool_call`, dan regex parser.
- Menggunakan AI SDK 6, native tool schemas, bounded multi-step loop, `convertToModelMessages`, dan UI message stream response.
- Membuat model factory pada provider boundary Zyx.
- Mempertahankan model registry, key pool, quota lifecycle, circuit breaker, usage accounting, provenance, dan operational telemetry.
- Mengimplementasikan read-only tools lebih dahulu:
  - retrieve admin knowledge
  - inspect schema
  - get system metrics
  - navigate admin
  - search users dengan output PII minimum
- Mengirim work-step parts untuk queued, running, completed, failed, cancelled, duration, dan retryability.
- Mendukung stop, abort, retry, timeout, malformed tool input, provider failure, dan partial stream failure.

Report khusus:

- Sanitized stream transcript untuk happy path dan error path.
- Urutan message parts dan tool events.
- Bounded loop evidence.
- Cancellation dan retry evidence.
- Provider lifecycle dan usage evidence.
- Focused test commands dan exit status.

Kriteria `ACCEPT`:

- Tidak ada lagi text-based tool parser.
- Client menerima incremental stream.
- Tool call dan result dapat dipetakan secara stabil.
- Cancellation benar-benar menghentikan request.
- Provider boundary Zyx tidak dilewati.

## Checkpoint 4: Citation per retrieval dan tool call

Task ID: `OPS-AI-V2-CP4-CITATIONS`

AGY harus:

- Mengirim citation part untuk setiap retrieval step.
- Mengikat citation ke `stepId` atau `toolCallId`.
- Menampilkan istilah “sumber yang diberikan kepada model”, bukan klaim bahwa model pasti membaca semua hasil.
- Membuat tool result membawa citation list sendiri bila memakai knowledge.
- Mendukung inline citation marker pada jawaban akhir.
- Memverifikasi marker terhadap source IDs yang benar-benar tersedia dalam run.
- Mendeduplikasi source secara deterministik.
- Menandai stale, missing, atau invalid source sebagai unavailable.
- Membedakan provenance:
  - `semantic-rag`
  - `live-tool`
  - `database-read`
  - `system-context`

Report khusus:

- Matriks run, step, tool call, dan source IDs.
- Contoh valid citation, invalid citation, missing source, dan stale source.
- Citation verifier result.
- Grounded-answer evaluation.
- Screenshot fixture atau component-state fixture, tanpa klaim visual pass.

Kriteria `ACCEPT`:

- Setiap semantic retrieval terlihat dalam work trace.
- Tool-level citation tidak tercampur dengan tool lain.
- Citation palsu tidak tampil sebagai valid.
- Live data tidak dipalsukan sebagai dokumen RAG.
- Jawaban tanpa retrieval tidak menampilkan sumber RAG.

## Checkpoint 5: Proposal dan mutation executor

Task ID: `OPS-AI-V2-CP5-MUTATIONS`

AGY harus:

- Membuat mutation tool hanya menghasilkan server-stored proposal dan opaque ID.
- Reuse TTL, precondition, audit, optimistic concurrency, dan state transition dari proposal infrastructure yang ada.
- Tidak memakai feature flag.
- Mengubah execute endpoint agar tidak mempercayai proposal payload dari browser.
- Melakukan server-side authorization, proposal lookup, expiry check, precondition revalidation, idempotency, dan replay protection.
- Memastikan tool loop tidak dapat mengonfirmasi proposal sendiri.
- Merutekan pekerjaan panjang melalui job atau Inngest.
- Menyimpan audit ringkas tanpa full prompt, secret, atau unnecessary PII.

Report khusus:

- Zero-side-effect evidence sebelum confirmation.
- Unauthorized, expired, stale, replay, duplicate, partial failure, dan retry test results.
- Proposal transition matrix.
- Audit record shape.
- Idempotency and correlation IDs.
- Validation commands dan exit status.

Kriteria `ACCEPT`:

- Tidak ada mutasi tanpa klik konfirmasi admin.
- Duplicate confirmation tidak menggandakan efek.
- Client-side payload tidak menjadi source of truth.
- Stale proposal ditolak.
- Audit record cukup untuk investigasi tanpa menyimpan transcript penuh.

## Checkpoint 6: Panel UI benchmark implementation

Task ID: `OPS-AI-V2-CP6-UI`

AGY harus:

- Mengubah desktop drawer menjadi layout participant yang mendorong main content.
- Memakai lebar default 480 px, minimum 360 px, maksimum `min(720px, 50vw)`.
- Menambah pointer dan keyboard resizing dengan accessible ARIA values.
- Menyimpan open state dan width per browser.
- Memakai full-width overlay pada mobile.
- Menambah focus trap, Escape close, focus return, dan body scroll lock.
- Menjaga header dan composer tetap terlihat, dengan conversation area sebagai satu-satunya scroll container.
- Menggunakan AI Elements yang diperlukan saja untuk message, conversation, tool, source, prompt input, actions, loader, dan confirmation.
- Menampilkan work trace audit, bukan raw chain-of-thought.
- Menyediakan stop, retry, clear, copy, collapse, dan resize.
- Menangani migrasi localStorage v1 ke v2 tanpa membuat tool history palsu.
- Menggunakan screenshot Cloudflare sebagai benchmark pola interaksi, bukan visual 1:1.
- Tetap mengikuti tokens, typography, no-pill rule, dan shared components Zyx.

Report AGY khusus:

- Route dan state matrix.
- Component hierarchy.
- Responsive and accessibility tests.
- Screenshot paths yang dihasilkan AGY bila ada.
- Known visual risks.
- Tidak boleh menyatakan visual quality `PASSED`.

Primary kemudian wajib:

- Menjalankan Playwright sendiri.
- Mengambil dan membuka semua screenshot pada 380x844 dan 1536x864.
- Memeriksa closed, open, resize minimum/maksimum, empty, streaming, retrieval, tool success/error, citations, proposal, cancel, retry, long answer, dan provider failure.
- Memeriksa HTTP 400+, redirect, page error, console error, overflow, clipping, focus, hierarchy, typography, spacing, dan interactive states.

Jika primary menemukan masalah visual, verdict adalah `REVISE` dan AGY memperbaiki checkpoint yang sama.

## Checkpoint 7: Integrasi dan final gate

Task ID: `OPS-AI-V2-CP7-INTEGRATION`

AGY harus:

- Mengintegrasikan runtime, RAG, citations, proposals, panel, local history, dan telemetry.
- Menambah focused end-to-end contract tests.
- Memperbarui documentation yang relevan beserta `docs/README.md`.
- Menyiapkan staging knowledge sync dan smoke workflow, tetapi tidak menjalankan external mutation tanpa authorization.
- Menyediakan rollback melalui deployment atau commit rollback serta knowledge index version rollback. Tidak memakai runtime flag.

Validasi final karena perubahan cross-cutting:

- Focused contract tests.
- `bun run lint`
- `bun run typecheck`
- `git diff --check`
- `bun run build`
- Playwright route/state matrix oleh primary.
- Staging smoke hanya setelah authorization eksplisit.

Kriteria `ACCEPT`:

- Semua checkpoint sebelumnya tetap lulus.
- Tidak ada unauthorized file changes.
- Seluruh diff telah diperiksa primary.
- Semua command yang diwajibkan exit 0, atau failure dilaporkan dan dibedakan dari pre-existing failure.
- Documentation konsisten dengan implementasi.
- Production, staging, Vectorize, dan provider boundary tidak diklaim berhasil tanpa benar-benar diuji.

## Format report wajib dari AGY

```text
Task ID:
Worker: agy, gemini-3.7-flash-high
Status: SUCCESS | PARTIAL | FAILED

Objective completed:
Scope completed:
Primary-agent payload:

Files inspected:
Files modified:
Diff summary:

Commands run:
Exit status per command:
Validation result:

Acceptance criteria:
- criterion: PASS | FAIL | NOT_VERIFIED
- evidence:

External mutations:
Environment and target:
Before/after evidence:

Unverified claims:
Risks:
Recommended verdict:
Detailed artifact:
Stop condition reached:
```

Status atau recommended verdict dari AGY tidak mengikat. Keputusan akhir selalu dibuat primary setelah pemeriksaan independen.

## Aturan koreksi

- `REVISE` memakai conversation AGY checkpoint yang sama dan correction handoff berisi defect spesifik, expected behavior, failing evidence, serta file ownership yang sama.
- AGY tidak boleh memperluas scope saat revisi.
- Setelah revisi, AGY harus mengulang validation yang gagal dan melaporkan exit status baru.
- Jika revisi menghasilkan regresi baru, primary memberikan `REVISE` lagi selama masih dalam objective checkpoint.
- Jika AGY gagal secara teknis, hanya satu safe retry yang diizinkan.
- Tidak ada fallback ke model atau launcher lain tanpa instruksi baru dari pengguna.
- Checkpoint tidak boleh dilompati atau digabung tanpa persetujuan pengguna.

## Evidence kebijakan saat ini

Model discovery telah memverifikasi `gemini-3.7-flash-high` tersedia. Discovery perencanaan sebelumnya bersifat token-hungry karena melintasi UI, API, tools, Vectorize, ingestion, tests, dan docs. Percobaan AGY Flash Medium sebelumnya exit 0 tetapi tidak menghasilkan analisis karena `read_file` auto-denied. Itu hanya evidence perencanaan lama. Pelaksanaan rencana baru memakai AGY Flash 3.7 High secara eksklusif dengan exact permissions dan primary sebagai orkestrator serta reviewer.
