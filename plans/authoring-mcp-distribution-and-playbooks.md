# Rencana perbaikan distribusi dan panduan Zyx Authoring MCP

Status: `OPEN / IN PROGRESS`

Tanggal: 2026-10-19

Owner implementasi: maintainer Zyx Authoring MCP. Owner persetujuan rollout dan instalasi host: operator Zyx.

Dokumen ini menetapkan rencana implementasi dan catatan progres pengujian lokal. Implementasi CP0 sampai CP4 sudah tersedia, dengan perbaikan hasil review lokal pada keamanan output build, refresh run, capability, identitas bootstrap, dan kelengkapan panduan Product. Status selesai penuh masih menunggu pemeriksaan artifact build dan acceptance gate yang belum dibuktikan. CP5 (verifikasi staging dan pembaruan host nyata) serta CP6 (aktivasi gate penolakan mutasi legacy) belum dijalankan.

### Perbaikan hasil review lokal

- Build paket menolak direktori non-empty tanpa ownership marker yang sah dan memeriksa file tak dikenal sebelum mengganti file milik paket. Jalur build tidak lagi menghapus direktori output secara rekursif. CI membuat direktori metadata sebelum shell redirection dan melewati mirror dari source ref yang sudah tertinggal.
- Capability wajib harus eksplisit bernilai true. Skill, stage, dan modul tidak boleh bercampur; pengambilan modul lanjutan dapat mengunci `expectedPlaybookRevision`.
- Bootstrap mengikat actor, session autentikasi, environment, dan audience. Payload diverifikasi dengan schema khusus; metadata publik tidak membocorkan actor/session/audience.
- `workflow.get_contract` menerima bootstrap baru untuk run yang sudah terikat, memverifikasi identitas lama, lalu mengembalikan replacement `runToken` dengan run ID, scope, source, dan expiry yang sama. Run legacy yang tidak terikat perlu dimulai ulang melalui katalog.
- Contract digest mencakup schema input Zod aktif dan versi quality policy. Refinement/algoritme semantik yang tidak terwakili JSON Schema tetap memerlukan bump versi policy; tidak ada klaim bahwa hash dapat mendeteksi perubahan semantik arbitrer secara otomatis.
- Aturan Product yang hilang dipulihkan pada editorial/rubrik: blok kondisional, formula terpisah dari prose, lineage Article, font Diktat 10.5 pt tanpa auto-shrink, PDF evidence, `NOT_TESTED`, dan reviewer reread artifact final.
- Switch environment `AUTHORING_MCP_REQUIRE_BOOTSTRAP` ditarik dari runtime. Fase saat ini tetap transisi; gate legacy hanya boleh ditambahkan melalui keputusan CP6 yang terpisah.

Log verifikasi disimpan lokal di `artifacts/authoring-review/`. Contract tests lokal tidak menggantikan pemeriksaan deployment/host.

### Hasil verifikasi perbaikan

- Bun contracts: 95 pass, 0 fail pada enam suite playbook, authoring MCP, CP3 authoring, source files, source persistence, dan quiz assembly. Konfigurasi preload memakai auth sintetis dan SQLite lokal.
- Python distribution: 11 tests, OK. Fixture temporary berada dalam workspace; tes mencakup output unmanaged, unknown files, reparse ancestors, metadata directory CI, deterministic builds, dan rollback sync.
- Production build: exit 0 dengan fixture sitemap kosong di `artifacts/authoring-review/local.db`. Build awal dengan SQLite tanpa tabel gagal saat prerender sitemap; tidak dipakai sebagai bukti regression. Fixture hanya mencakup pembacaan sitemap, bukan data authoring nyata.
- Asset trace: 15 modul Markdown ditemukan dalam route trace dan berhasil dimuat dari fixture runtime terisolasi, exit 0.
- Focused ESLint pada modul MCP, registry, digest, dan Next config: 0 errors, dengan 4 warning unused import lama dan 1 warning bahwa test file diabaikan konfigurasi ESLint.
- Full source ESLint dengan artifacts/agents/attachments hasil generate dikecualikan: exit 1, 38 errors dan 1216 warnings pada source repository. Error di luar file perbaikan ini tidak ditutup oleh plan ini.
- Full typecheck: exit 2, tersisa dua error di `lib/bundle/staging.ts` dan satu generated validator yang menunjuk fixture route lama yang tidak tersedia. Modul MCP yang diperbaiki tidak lagi muncul dalam diagnostics.
- HTTP smoke `next start` belum lulus di sesi ini: server sempat ready, tetapi pemeriksaan endpoint tidak selesai dalam window smoke. Server lokal sudah dihentikan. Jangan menganggap build atau trace sebagai verifikasi HTTP/OAuth/host.
- `git diff --check` pada tracked files yang disentuh lulus. Deployment, mirror eksternal, instalasi host, dan gate CP6 belum dijalankan.

## Tujuan dan hasil yang diharapkan

Perubahan rutin pada panduan authoring, rubrik, dan kontrak server harus tersedia melalui MCP tanpa reinstall paket di setiap host. Paket lokal mempertahankan trigger skill, identitas environment, bootstrap yang stabil, adapter orkestrasi host, dan batas keamanan. Server menjadi sumber panduan tahap dan kontrak yang digunakan untuk authoring.

Hasil akhir harus memenuhi kondisi berikut:

- Keenam skill tetap dapat dipanggil secara independen.
- Client mengambil panduan aktif sebelum drafting dan memeriksa ulang konteks saat resume.
- Ketidakcocokan bootstrap diketahui sebelum authoring atau penulisan data, dengan tindakan pemulihan yang jelas.
- Run tidak diam-diam memakai contract atau playbook berbeda setelah deployment.
- Pembaruan paket memiliki satu versi kanonis dan artifact deterministik untuk setiap environment.
- Pengembang dapat memeriksa drift dan menyiapkan paket development tanpa mengubah cache internal host.
- Batas Source, Idea, Product, soal original, dan historical reference tetap mengikuti service yang ada.
- Client legacy tetap didukung selama fase transisi yang dinyatakan secara eksplisit.

Tidak ada jaminan hot reload seragam. Pembaruan schema tool atau paket dapat tetap memerlukan refresh connector, reload plugin, atau sesi baru sesuai kemampuan host.

## Baseline source dan masalah yang diselesaikan

Pemeriksaan source lokal pada tanggal dokumen menghasilkan baseline berikut. Ini bukan verifikasi deployment atau cache instalasi pengguna.

| Area | Baseline | Implikasi |
| --- | --- | --- |
| `app/api/mcp/authoring/route.ts` | POST stateless Streamable HTTP, JSON response, GET/DELETE 405 | Pertahankan transport dan autentikasi yang ada. |
| `lib/authoring/mcp-server.ts` | 51 registrasi tool, capability tools | Bootstrap awal dapat ditambahkan sebagai tool. Resources/prompts tidak wajib untuk migrasi. |
| `workflow.get_contract` | Input hanya `runToken` | Belum mengidentifikasi bootstrap client atau revisi konteks yang diterima. |
| `lib/authoring/mcp-workflows.ts` | Token bertanda tangan, run berlaku tujuh hari | Reuse primitive token; tambah validasi payload bootstrap yang spesifik. |
| Panduan paket | 19 berkas Markdown, 185403 byte | Instruksi rinci tersebar pada client dan perlu dipetakan sebelum dipindahkan. |
| Manifest paket | Codex `0.2.1`, Claude `0.2.0` | Belum ada versi rilis paket yang konsisten. |
| `configure_environment.py` | Mengatur identitas dan endpoint; tidak menghasilkan konfigurasi Antigravity | Tambah generator multi-host yang deterministik. |
| `sync-plugin.yml` | Menyalin direktori penuh; trigger hanya paket/workflow | Perlu packaging allowlist dan validasi sebelum mirror. |
| ZIP lokal | `skills/zyx-authoring-pipeline.zip` untracked | Keluarkan dari payload dan pertahankan salinan sebelum cleanup terotorisasi. |
| Dokumentasi publication | Pernyataan umum MCP tidak publish | Tidak sesuai historical reference dan harus direkonsiliasi per operasi. |

Worktree mempunyai banyak perubahan lain, termasuk dokumentasi dan service bundle. Sebelum setiap implementasi, ambil `git status --short`, baca diff file yang akan disentuh, dan pertahankan perubahan tersebut. Tidak ada reset, checkout paksa, atau staging massal.

## Batas perubahan

Termasuk registry playbook, tool bootstrap, compatibility metadata, konteks run, thin skills, generator paket, CLI development, CI distribusi, tes, dan dokumentasi yang terdampak.

Tidak termasuk perubahan perilaku publication, schema database, auth provider, quota AI, renderer learner, R2 key convention, retrieval, atau sistem authoring lain. Tidak membuat UI baru, layanan registry baru, CMS playbook, watcher, scheduled updater, atau dependency baru tanpa kebutuhan yang terbukti.

Tidak menjalankan AGY atau subagent sebagai bagian implementasi ini. Persyaratan Creator/Critic/Student POV dalam playbook berlaku ketika kelak membuat Product Bundle, bukan saat menulis kode distribusi plugin.

## Keputusan arsitektur

### Client dan server

| Tetap pada skill lokal | Berasal dari server |
| --- | --- |
| Frontmatter, trigger, dan batas tugas skill | Urutan tool, prasyarat tahap, dan exit gate |
| Identitas koneksi/environment dan larangan substitusi | Field schema, enum, limit, dan contoh payload |
| Identitas skill serta versi bootstrap literal | Rubrik pedagogi, editorial, flashcard, derivasi, dan source reconciliation |
| Kewajiban bootstrap sebelum drafting/resume | Capability renderer, aturan PDF, dan langkah pemulihan |
| Larangan credential leak dan prompt injection dari sumber | Persyaratan reviewer dan bukti sesuai tahap |
| Adapter menjalankan peran terpisah memakai fasilitas host | Pembagian pekerjaan dan aturan revisi authoring |
| Batas otorisasi, tanpa mengklaim submit selalu draft | Semantik publication dan konsekuensi operasi yang spesifik |

Target skill sekitar 50 sampai 100 baris, tanpa mengorbankan instruksi penting demi jumlah baris. Keenam skill dipertahankan. Host yang tidak memuat skill lokal tetap dapat memulai melalui deskripsi tool bootstrap dan petunjuk koneksi singkat.

`workflow.get_playbook` adalah jalur utama read-only. `workflow.get_contract` menyediakan kontrak dan binding run. Resources/prompts ditunda sampai ada kebutuhan host yang dibuktikan. Server `instructions` cukup berisi petunjuk bootstrap dan batas environment; jangan menyalin seluruh panduan ke metadata server.

### Sumber playbook dan aset deployment

Gunakan modul registry `lib/authoring/mcp-playbook.ts` dan Markdown kanonis di `lib/authoring/playbooks/`. Registry hanya membuka path dalam allowlist statis. Argumen tool memilih module ID, bukan filesystem path atau URL arbitrer.

Kelompok modul: `common`, `pipeline`, `source`, `idea`, `product`, `quiz`, dan `reference`. Modul Product dapat dipisah menjadi workflow, editorial, quality, derivation, dan flashcards agar dapat diambil bertahap. Batas modul mengikuti isi yang ada, bukan kewajiban membuat semua nama tersebut.

Setiap modul memiliki ID stabil, MIME text/markdown, checksum SHA-256 atas UTF-8 dengan normalisasi newline yang ditetapkan, serta relasi ke tahap. Manifest stage mencatat ordered module IDs yang wajib dan opsional. Checksum aggregate berasal dari serialisasi deterministik manifest dan checksum modul, tanpa timestamp, token, atau scope pengguna.

Tambahkan output file tracing yang ditargetkan ke route MCP pada `next.config.ts` jika implementasi membaca Markdown saat runtime. Baca guide Next.js lokal tentang output tracing dan route handlers sebelum mengubah boundary. Verifikasi file benar-benar masuk artifact build. Berhasil membaca file di checkout tidak memenuhi gate deployment asset.

Jangan menaruh panduan yang memuat credential, source PDF privat, atau data course tertentu dalam aset statis. Registry boleh di-cache per proses berdasarkan artifact immutable; jangan cache konteks pengguna dalam registry global.

### Identitas revisi

| Field | Makna |
| --- | --- |
| `pluginVersion` | SemVer paket distribusi, tidak dipakai sebagai satu-satunya compatibility gate. |
| `bootstrapProtocol` | Integer versi cara bootstrap, dimulai dari 1. |
| `playbookRevision` dan checksum | Identitas manifest panduan untuk stage. |
| `contractRevision` dan checksum | Identitas kontrak authoring stage dan capability yang mempengaruhi payload/gate. |
| `serverRevision` | Diagnostik artifact deployment, bukan aturan perbandingan kompatibilitas. |

Kontrak statis dan scope run dipisahkan. Checksum contract tidak berubah hanya karena course, chapter, token, atau waktu berbeda. Reuse serializer/hash yang sudah ada. Kaitkan contract pada schema/validator dan quality-policy aktif; jangan membuat schema tandingan yang diedit manual tanpa consistency tests.

Implementasi awal melayani revisi saat ini saja. Perbedaan revisi terikat dengan revisi aktif memerlukan refresh dan revalidasi. Tidak membuat snapshot storage atau menjanjikan retensi tujuh hari. Masa berlaku token run bukan jaminan revisi tetap didukung. Dukungan beberapa revisi dapat ditambahkan kemudian jika frekuensi refresh benar-benar mengganggu pekerjaan.

## Kontrak bootstrap dan alur run

### Pemilihan workflow dan stage

`workflow` tetap memakai enum yang ada: `idea_product`, `quiz_bank`, dan `reference_question_ingest`. `stage` baru membedakan `source`, `idea`, `product`, `quiz`, dan `reference`; pipeline adalah skill orkestrasi, bukan jenis bundle baru.

Validasi pasangan skill/workflow/stage. Skill pipeline menerima panduan orkestrasi dan memilih stage konkret sebelum authoring. Jangan menebak stage Product untuk semua run `idea_product`.

### Bentuk input dan output

`workflow.get_playbook` menerima identitas skill, `bootstrapProtocol`, `pluginVersion` jika paket lokal tersedia, stage/workflow, capability terstruktur, optional module IDs, dan optional expected revision saat mengambil modul lanjutan. Connector tanpa paket menyatakan client mode connector; versi paket tetap unknown dan tidak dipalsukan.

Respons mengandung environment terverifikasi, compatibility status, alasan dan langkah pemulihan, revisions/checksums, daftar modul wajib/opsional, teks modul yang diminta, capability yang dibutuhkan, serta `bootstrapToken` jika konteks kompatibel. Metadata tersedia dalam `structuredContent`; teks instruksi dan metadata yang diperlukan tetap tersedia dalam `content` bagi host yang tidak memproses structured content.

Panggilan awal selalu mengembalikan instruksi inti dan daftar modul wajib. Pengambilan lanjutan wajib memakai expected revision agar deployment di tengah pengambilan tidak mencampur modul. Jika modul terlalu besar, pecah pada bagian bernama yang stabil; jangan memotong teks tanpa penanda kelengkapan. Target ukuran respons ditetapkan melalui fixture Product terbesar dan kemampuan host yang diuji.

Token adalah bukti konteks yang diterbitkan server. Token tidak membuktikan model membaca seluruh modul, memahami panduan, atau menjalankan reviewer independen. Daftar modul wajib dan bukti authoring tetap bagian gate yang relevan; jangan membuat klaim attestation yang tidak dapat dibuktikan.

### Token dan binding

Tambahkan token kind `bootstrap` memakai primitive signing yang ada, lalu validasi payload spesifik dengan Zod setelah verifikasi signature. Payload minimal mengikat principal user/session, environment/audience, skill, workflow/stage, protocol, declared capabilities, revisi playbook/contract, dan masa berlaku.

TTL awal bootstrap satu jam. Token harus belum kedaluwarsa ketika dipakai untuk membuat atau memperbarui konteks run. Setelah binding, validitas run mengikuti expiry run yang ada serta pemeriksaan principal/environment/revisi pada operasi terkait. Tidak memperpanjang token autentikasi atau menambah scope.

`workflow.start` menerima optional bootstrap token selama transisi. Run baru yang memakai bootstrap menyimpan context binding. `workflow.get_run` mengembalikan status kompatibilitas dan identitas revisi non-secret tanpa membocorkan user/session binding.

`workflow.get_contract` menerima optional bootstrap token untuk mengikat konteks stage baru atau refresh run yang sudah ada, dan mengembalikan replacement run token. Pertahankan run ID, scope, dan source binding; jangan membuat source baru atau menulis database untuk refresh. Run legacy tanpa principal binding tidak dapat di-upgrade hanya berdasarkan possession token: verifikasi ulang akses scope/source dan identitas yang tersedia, atau minta restart workflow melalui pilihan katalog yang sah.

Refresh berarti konteks baru memerlukan validation ulang sebelum submission. Enforcement menggunakan pemeriksaan deterministik saat submission dan gate konten yang sudah ada. Jika ingin mewajibkan bukti panggilan validate terpisah, perlu receipt validasi yang mengikat hash artifact; jangan mengklaim urutan panggilan terjamin hanya dari token bootstrap.

Konteks bootstrap tidak masuk ZIP bundle, checkpoint publik, log, atau Git. Ia tidak menjadi credential alternatif dan tidak mengizinkan staging/review/publication/destructive action dengan sendirinya.

### Status dan pemulihan

| Kondisi | Mode transisi | Setelah gate diotorisasi |
| --- | --- | --- |
| Metadata bootstrap tidak dikirim | `legacy`, warning terstruktur, perilaku lama dipertahankan | Read tetap tersedia; mutasi dalam cakupan gate ditolak. |
| Protocol eksplisit tidak didukung | Error kompatibilitas sebelum authoring, petunjuk update | Sama. |
| Capability wajib tahap kurang | Blokir tahap terkait | Sama. |
| Token rusak/expired/wrong principal/environment | Tolak konteks; jangan fallback legacy | Sama. |
| Revisi berbeda dari aktif | `CONTEXT_REFRESH_REQUIRED`; jangan memakai binding stale | Sama. |
| Plugin lebih tua tetapi protocol kompatibel | Ambil panduan aktif dan lanjut | Sama. |
| Modul wajib tidak tersedia | Error konfigurasi server; hentikan tahap | Sama. |

Gunakan kode mesin yang konsisten dengan prefix MCP yang ada dan pesan manusia Indonesia. Error menyebut tindakan seperti ambil playbook ulang, update plugin, pilih environment yang benar, atau mulai ulang run. Jangan echo token, credential, source keys, atau payload pribadi.

Mode transisi tidak menjadi bypass ketika client mengirim konteks eksplisit yang invalid. Client yang sengaja mengaku legacy masih dapat memakai jalur legacy selama transisi; ini batas yang diketahui dan berakhir ketika gate diaktifkan.

## Cakupan gate per operasi

| Operasi | Konteks yang relevan | Ketentuan |
| --- | --- | --- |
| Katalog, pembacaan source, inspeksi import/knowledge | Tidak wajib bootstrap | Pertahankan auth/scope yang ada. Tidak memblokir troubleshooting. |
| `workflow.get_playbook`, get contract, get run | Read dan compatibility | Tetap dapat dipanggil untuk pemulihan. Refresh mengeluarkan token baru, bukan mutasi konten. |
| `source.ingest` | Stage source, tanpa run awal | Perlu optional bootstrap langsung; jangan membuat siklus yang mensyaratkan run sebelum source tersedia. |
| Idea validate/submit/restage | Stage idea dan run | Tetap memakai validator, provenance, dan lifecycle service yang ada. |
| Product validate/submit/restage | Stage product dan run | Independent subagents diwajibkan oleh kebijakan Product, bukan semua workflow. |
| Quiz/reference validate dan submit | Stage quiz/reference dan run | Tetap menjaga immutable historical data dan semantik publication yang nyata. |
| `assessment.update_question` | Konteks quiz sesuai scope | Periksa parameter/caller saat implementasi. |
| Review, discard, withdraw | Konteks lifecycle yang sesuai | Bootstrap tidak menggantikan scope atau otorisasi eksplisit. Operasi perbaikan perlu jalur bootstrap yang dapat dipenuhi tanpa membuat bundle baru. |
| `quiz.create`, `quiz.update`, `quiz.set_questions` | Konteks quiz assembly tanpa run | Tambah optional bootstrap context pada input, validasi target scope dan principal; `quiz.get/list` tetap read-only. |

Lakukan inventory seluruh registrasi tool dan caller sebelum implementasi. Tetapkan daftar operasi yang memerlukan gate dalam satu pemetaan yang dites terhadap tool registry agar tool mutasi baru tidak terlewat. Hindari merombak seluruh registration framework hanya untuk menambahkan gate.

Pada mode transisi, gate global untuk konteks yang absen belum aktif. Validation tetap dapat melaporkan diagnostics kompatibilitas; input eksplisit yang invalid tetap ditolak. Aktivasi penolakan mutasi legacy adalah checkpoint rollout terpisah.

## Checkpoint implementasi

### CP0 Rekonsiliasi perilaku dan inventaris panduan

File utama: README plugin, keenam skill dan references, `docs/features.md`, `docs/ARCHITECTURE.md`, kontrak workflow dan service publication yang sudah ada.

- Buat tabel publication per operasi: Idea/Product submission menghasilkan staging dan memerlukan admin publication; original question submission mengikuti status generated/review yang ada; historical submission saat ini langsung published dengan eligibility yang ditentukan validator; quiz assembly memiliki operasi status tersendiri yang perlu dijelaskan.
- Perbaiki pernyataan salah tanpa mengubah perilaku publication. Permintaan yang hanya mengizinkan draft/staging tidak boleh dipakai untuk menjalankan historical submit yang langsung published.
- Petakan seluruh aturan normatif dari setiap SKILL/reference ke modul tujuan, adapter lokal, atau aturan obsolete beserta alasan. Tidak menghapus aturan hanya karena validator belum menegakkannya.
- Inventaris server IDs, manifests, katalog mirror yang dapat diakses, dan semua tool mutasi. Bedakan informasi source dari remote/installed state yang belum diperiksa.
- Keluarkan ZIP dari payload. Ketika cleanup diotorisasi, simpan salinan ber-hash di `artifacts/` sebelum menghapus file asal yang telah diverifikasi berada dalam workspace.

Exit gate: publication matrix akurat; tidak ada instruksi penting tanpa pemetaan; artifact pengguna dipertahankan; perubahan tetap dokumentasi/hygiene.

### CP1 Registry playbook dan kontrak revisi

File: `lib/authoring/mcp-playbook.ts`, `lib/authoring/playbooks/*.md`, `lib/authoring/mcp-workflows.ts`, `next.config.ts`, tests registry.

- Pindahkan isi mapped ke Markdown server tanpa pemangkasan substantif pada langkah pertama.
- Implementasikan allowlist modul, manifest stage, checksum deterministik, compatibility table dan capability requirements.
- Expose contract revision dari kontrak/validator aktif. Tambahkan consistency tests bagi schema fields, quality policy, renderer capability dan aturan publication.
- Tambah output tracing yang diperlukan dan uji artifact production lokal.
- Tetapkan aturan relative links: tautan modul menggunakan ID/URI stabil yang dapat diambil melalui tool, bukan path lokal yang tidak dimiliki client.

Exit gate: setiap aturan wajib terwakili; module traversal ditolak; hash deterministik; tidak ada runtime dependency pada folder plugin client; semua aset wajib masuk build.

### CP2 Tool bootstrap dan binding run dengan legacy support

File: `lib/authoring/mcp-workflows.ts`, `lib/authoring/mcp-server.ts`, boundary auth terkait jika diperlukan, contract tests. Route transport tetap sama kecuali dibutuhkan untuk meneruskan environment/audience yang diverifikasi server.

- Tambah token schema/helper dan tool `workflow.get_playbook` dengan `authoring:read` serta read-only annotations.
- Perluas start/get contract/get run dengan input optional dan compatibility output.
- Bind context pada principal dan environment yang diperoleh server. Jangan menerima host/environment claim dari client sebagai sumber kebenaran.
- Sediakan stage transition dan refresh tanpa mengubah run scope atau source checksum.
- Implementasikan pemeriksaan konteks eksplisit pada operasi yang dipetakan; tidak menolak legacy yang tidak mengirim konteks pada release ini.
- Tambah petunjuk bootstrap ringkas pada server metadata/tool descriptions. Jangan ubah nama tool lama atau bentuk response yang diandalkan caller secara tidak kompatibel.

Exit gate: legacy contract tests tetap lulus; valid bootstrap bekerja; konteks palsu/stale/cross-environment ditolak sebelum content mutation; refresh tidak mengubah scope; tidak ada gate legacy aktif.

### CP3 Thin skills dan generator multi-host

File: keenam `SKILL.md`, references yang dipindahkan, `agents/openai.yaml`, manifests, `.mcp.json`, `mcp_config.json`, template Claude chat, `scripts/configure_environment.py`, metadata rilis paket.

- Pangkas skill setelah CP1/CP2 lengkap. Local safety dan host adapter tetap tersedia ketika server gagal dihubungi.
- Setiap skill mencantumkan skill identity dan protocol literal, mengambil panduan stage, membaca semua modul wajib, serta berhenti bila tidak kompatibel. Server yang belum memiliki bootstrap menghasilkan blocker yang jelas, bukan fallback panduan usang.
- Pertahankan Creator/Critic/Student POV sebagai peran nyata ketika Product dibuat. Capability tidak tersedia berarti blocker stage, bukan self-review fiktif.
- Gunakan satu berkas release metadata kanonis, misalnya `release.json`, untuk SemVer dan protocol. Generator membaca sumber itu dan menghasilkan versi yang sama pada manifest host yang mendukung version.
- Rekomendasi rilis bootstrap awal `0.3.0`, ditetapkan saat CP3 dan diperiksa terhadap versi repository eksternal sebelum publikasi agar tidak memakai versi yang sudah terpakai.
- Hasilkan konfigurasi setiap host dari satu pemetaan environment, dengan adapter format yang divalidasi. Jangan copy field transport host lain tanpa verifikasi schema.
- Tolak environment tak dikenal, server ID legacy pada payload hasil, endpoint campur, duplicate entries, dan output di source/package root yang berisiko overwrite. Jangan menambah field custom pada manifest yang tidak mendukungnya.
- Generator bekerja pada build directory terpisah dan idempotent; tidak menulis profile pengguna atau credential.

Exit gate: keenam trigger tetap ada; tidak ada reference lokal wajib yang hilang; output kedua environment valid dan byte-identik pada input sama; tidak ada server ID legacy atau credential; isi panduan server tidak kembali diduplikasi ke paket.

### CP4 Packaging, doctor, sync, dan CI

File: helper packaging pada `plugins/zyx-authoring-mcp/scripts/`, CLI lokal dengan subcommand `doctor`/`sync`, `.github/workflows/sync-plugin.yml`, tests Python standard library. Tambahkan script Bun hanya jika memudahkan entrypoint yang sudah dipakai.

Packaging memakai daftar file/pola sempit untuk manifests, metadata rilis, README, aset brand tertentu, enam SKILL, host metadata, dan helper yang memang dibutuhkan. Artifact tidak memuat ZIP lain, `.env`, `.git`, cache, symlink/reparse point, source binary privat, atau berkas tak dikenal. Input di luar allowlist menyebabkan diagnostic; payload disusun hanya dari file sah. Fixture credential memakai nilai sintetis.

`doctor`:

- Default read-only, tanpa panggilan provider AI atau refresh OAuth.
- Temukan sumber host dari lokasi/metadata yang didukung; path eksplisit tersedia untuk instalasi nonstandard.
- Laporkan hanya versi host bila tersedia, plugin ID/version, path terpilih, checksum skill, server ID, dan origin endpoint yang dinormalisasi tanpa query/userinfo.
- Bandingkan isi file/release metadata; jangan menganggap nama folder versi membuktikan isinya.
- Pisahkan status absent, unknown, legacy ID, drift, dan perlu reload. Konfigurasi tidak terbaca bukan bukti plugin sehat.
- Jangan cetak keseluruhan config, environment, cookies, tokens, atau exception yang memuat credential.

`sync`:

- Default hanya build varian ke `artifacts/authoring-plugin/<environment>/...` dan tampilkan tindakan host yang diperlukan.
- Pemilihan target environment wajib eksplisit; staging dan production memakai direktori terpisah.
- Penggunaan mekanisme update resmi host bersifat opt-in dan hanya dijalankan setelah host/version/target dikenali.
- Tidak menulis `~/.codex/plugins/cache` atau `~/.claude/plugins/cache`, tidak menebak registry internal, dan tidak menjalankan uninstall.
- Untuk direktori development yang dikelola script, gunakan ownership marker, backup, temporary sibling directory, validasi, lalu rename ketika host tidak sedang memuatnya. Jika pertukaran gagal, pulihkan backup. Jangan menyebut dua kali rename sebagai transaksi atomik yang dijamin platform.
- Resolve absolute target sebelum move/delete. Tolak target root, source checkout, overlap input/output, path traversal, symlink/reparse point tak dikelola, dan target yang belum diberi ownership marker.
- Perubahan config host hanya pada entri Zyx yang endpoint-nya telah dicocokkan. Konflik legacy ambigu memerlukan keputusan, bukan penghapusan otomatis.
- Jangan menjalankan `agy` atau wrapper AGY sebagai updater otomatis; integrasi Antigravity yang memerlukan CLI tersebut tetap petunjuk operator sampai ada otorisasi eksplisit.

CI:

- Job validasi berjalan pada PR dan push perubahan paket, packaging helpers, registry/playbooks/contracts yang relevan, serta workflow. Job mirror tetap hanya pada rilis paket yang sah dari staging/main atau dispatch yang diperiksa.
- Generate dan validasi kedua environment sebelum menyentuh repository eksternal.
- Gunakan job environment resolution lalu concurrency group per target environment; hindari ekspresi group yang bergantung pada env yang baru tersedia di step. Serialisasi mirror dan periksa head yang akan dirilis agar job lama tidak memublikasikan payload usang.
- Batasi production pada ref main dan sumber rilis sah; dispatch staging dari ref lain tidak boleh dipromosikan menjadi production.
- Bandingkan versi dan payload hash dengan artifact/release terakhir. Versi sama dengan hash sama adalah no-op; versi sama dengan payload berbeda adalah failure. Versi baru harus maju sesuai urutan SemVer per channel.
- Pisahkan payload hash dari diagnostics source SHA agar commit unrelated tidak mengubah hash paket. Metadata environment termasuk hash varian; timestamp build tidak termasuk.
- Catalog update dilakukan bila katalog menyimpan versi/ref/hash sendiri. Jangan menganggap push mirror otomatis memperbarui marketplace atau instalasi.
- Gunakan output allowlist yang sama untuk lokal dan CI, permission minimum, no credential logging, dan artifact rollback. Jangan mengubah fallback clone error menjadi inisialisasi branch baru untuk semua kegagalan autentikasi/network.

Exit gate: doctor aman pada config sintetis berisi secret; sync default tidak memutasi profile; packaging dan version reuse guard teruji; invalid target tidak menulis; CI dry run tidak push; mirror hanya setelah otorisasi dan target read-back.

### CP5 Verifikasi host dan migrasi staging

Deploy server kompatibel terlebih dahulu, verifikasi registry/tool dan aset, lalu rilis thin skills. Jangan menerbitkan paket yang mewajibkan bootstrap sebelum server target menyediakannya.

| Host | Bukti yang wajib dicatat |
| --- | --- |
| Codex Desktop | Marketplace/source yang digunakan, paket efektif, bootstrap dari sesi baru/reload yang didukung, environment, compatibility response. |
| Claude Code termasuk Code tab | Update atau development load tanpa uninstall, effective version, reload, bootstrap dan context binding. |
| Antigravity IDE | Effective plugin directory, generated `mcp_config.json`, server ID benar, reload dan bootstrap; jangan samakan dengan Gemini CLI. |
| Claude Desktop chat | Remote connector yang benar, tool bootstrap terlihat, teks modul dapat dibaca tanpa mengasumsikan local skills. |
| ChatGPT Developer Mode | Refresh/scan tool yang relevan, bootstrap terlihat dan respons terbaca; tanpa mengasumsikan dukungan resource/prompt tertentu. |

Periksa read-only setelah deployment/installation dengan environment tepat. Uji penulisan hanya pada fixture staging yang diotorisasi; historical submit bukan smoke test read-only karena langsung published. Uji capability Product tanpa subagent menghasilkan blocker, lalu jalur dengan subagent nyata hanya bila sesi authoring tersebut diminta.

Simpan evidence sanitized: perintah, exit code, host version, endpoint origin, tool metadata/revision, status kompatibilitas, dan artifact hashes. Token tidak masuk evidence. Operasi UI host dapat didokumentasikan dengan capture tanpa source privat atau credential. Playwright learner/admin visual suite tidak relevan jika tidak ada frontend yang berubah.

Exit gate: seluruh host yang akan dipertahankan telah diuji, atau gap ditandai sebagai blocker rollout. Perubahan satu modul playbook terambil pada sesi bootstrap berikutnya tanpa reinstall paket. Perubahan schema tool diuji dengan refresh connector, terpisah dari runtime playbook update.

### CP6 Aktivasi gate dan penutupan transisi

CP6 memerlukan otorisasi rollout eksplisit setelah evidence CP5. Sebelum coding perilaku baru atau flag, tentukan mekanisme dengan operator sesuai AGENTS.md. Default rencana: release kompatibel tidak menambahkan `FEATURE_*`; gate legacy belum aktif.

Jika dipilih flag rollout, catat key, rationale, default off, scope environment/operasi, owner, rollback, expiry dan removal condition; tambah pada env/flag catalog/docs yang relevan. Jika dipilih release terpisah tanpa flag, catat rollback ke artifact kompatibel yang tidak memerlukan rollback database. Jangan menambah flag atau mengaktifkan gate diam-diam.

- Setujui daftar operasi yang diblokir untuk legacy serta pesan pemulihan.
- Aktifkan staging dahulu; jalankan positive/negative mutation tests pada fixture yang diotorisasi dan pastikan penolakan terjadi sebelum write.
- Verifikasi tool recovery/read tetap bisa dipakai, run lama mendapat jalur refresh, dan scope auth tetap dipertahankan.
- Tetapkan window observasi sebelum production berdasarkan penggunaan authoring nyata. Tidak ada aktivasi berdasarkan waktu saja bila belum ada evidence host.
- Production rollout terpisah dari staging, dengan backup/evidence dan target environment yang diperiksa.
- Hapus jalur transisi dan flag sementara hanya setelah seluruh client yang dipertahankan telah bermigrasi dan rollback window dinyatakan selesai.

Exit gate: legacy mutation tidak lolos; valid context berhasil; invalid/stale context tidak menyebabkan partial write; recovery tersedia; rollback teruji; dokumentasi mencerminkan keadaan yang benar-benar dirilis.

## Matriks pengujian

| Kelompok | Kasus minimum |
| --- | --- |
| Legacy compatibility | Start/get contract/validation lama tetap bekerja pada release transisi; metadata unknown jujur; explicit invalid context tidak turun menjadi legacy. |
| Protocol | Versi didukung, versi tak dikenal, field wajib hilang, tipe salah, pasangan skill/workflow/stage invalid. |
| Capability | Product tanpa independent subagents blocked; Source dan read-only tetap bisa; klaim capability tidak diperlakukan sebagai bukti review. |
| Token | Signature rusak, token kind salah, expired, payload schema invalid, user/session berbeda, environment/audience berbeda. |
| Run | Scope/source tak berubah saat refresh; stage transition sah; token legacy tidak dapat diambil alih; get run tidak membocorkan binding principal. |
| Drift | Revisi berubah sebelum module fetch, sesudah start, sebelum validate, sebelum submit, dan saat resume; setiap kasus menghasilkan recovery deterministik. |
| Contract | Hash stabil lintas scope/token/waktu; schema/quality-policy/capability change tercermin; tidak ada contract schema tandingan yang drift diam-diam. |
| Registry | Modul hilang, module ID unknown, traversal, urutan modul/hash stabil, tautan dapat diselesaikan, respons lengkap dan bounded. |
| Mutation gates | Semua tool mutasi tercakup dalam policy map, termasuk source.ingest dan quiz tanpa run; rejected call tidak mencapai mocked write service; legacy hanya diizinkan saat transisi. |
| Publication | Response/docs Idea/Product/original/historical/quiz sesuai service; test tidak mempublikasikan data nyata. |
| Generator | Kedua environment, rerun idempotent, canonical SemVer, identity/endpoint tepat, format host valid, legacy/ambiguous server entries ditolak. |
| Packaging | ZIP/.env/unknown files/symlink dikecualikan atau ditolak sesuai policy; required files ada; payload hash deterministik; version collision gagal. |
| Doctor/sync | Secret redaction, config invalid, non-Zyx preserved, explicit target, ownership marker, overlap/traversal rejected, rollback rename failure. |
| CI | Environment mapping, production ref restriction, concurrent/stale release, valid no-op, version advance, pre-mirror failures tanpa push. |
| Runtime artifact | Production build menyertakan seluruh modul; POST initialization/tools/list/bootstrap berjalan; GET/DELETE dan auth tetap mengikuti kontrak. |
| Host | Paket efektif dan runtime playbook diperiksa terpisah dari Git mirror, connector registry, dan sesi OAuth. |

Reuse `tests/contracts/authoring-mcp.test.ts`, source persistence/source files, CP3 authoring dan quiz assembly tests yang sudah ada. Tambah test terfokus seperti `authoring-mcp-playbook.test.ts` dan `authoring-mcp-bootstrap.test.ts`; nama akhir mengikuti penempatan helper yang benar. Tes Python menggunakan `unittest` dan temporary directories untuk generator/packaging/CLI, bukan profile asli.

## Validasi dan evidence implementasi

- CP0 dan perubahan dokumen: `git diff --check`; baca ulang semantics, links, dan inventory.
- CP1/CP2: focused Bun contracts dan regression contracts terkait. Token/security branches wajib mempunyai negative tests.
- CP3/CP4: Python unittest, manifest validator host yang tersedia, deterministic build kedua environment, packaging inspect, CI dry run tanpa credential/push.
- Setelah perubahan server lintas modul: `bun run lint` dan `bun run typecheck`, catat exit code dan baseline failures terpisah. Tidak mengulang full suite untuk setiap edit Markdown.
- Jalankan `bun run build` karena aset runtime/build boundary berubah. Build tidak menggantikan typecheck; konfigurasi saat ini memakai `ignoreBuildErrors: true`.
- Jalankan production server lokal dan smoke MCP dengan principal fixture yang aman. Kegagalan karena dependency/env harus dipisahkan dari regression. Jangan mengambil production credential agar local test mudah.
- CP5/CP6: actual authorized staging/host smoke, dengan read-back dan bukti yang dipetakan ke checkpoint. Local test tidak membuktikan host atau deployment berhasil.

## Dokumentasi dan susunan perubahan

Update hanya dokumen yang menjadi tidak akurat: README plugin, `docs/features.md` untuk workflow/compatibility, `docs/ARCHITECTURE.md` untuk boundary instruksi dan context, `docs/DEVELOPMENT.md` untuk generator/doctor/sync, dan `docs/DEPLOYMENT.md` untuk urutan server/package, mirror, dan rollback. Tambahkan satu runbook rollout jika detail operasional tidak cukup ringkas untuk deployment guide. Tidak mengubah dokumen DB schema tanpa perubahan schema.

Setiap perubahan Markdown di `docs/` atau `plans/` disertai update `docs/README.md`. Plan tetap `OPEN / IN PROGRESS` sampai semua checkpoint termasuk host verification dan rollout yang disepakati benar-benar selesai; local implementation saja tidak cukup.

Susunan perubahan yang disarankan:

1. Rekonsiliasi docs, inventory, dan package hygiene.
2. Registry, bootstrap tools, binding run, serta security/compatibility tests.
3. Thin skills, canonical version, generator multi-host, packaging tests.
4. Doctor/sync dan penguatan CI.
5. Evidence staging/host dan operational documentation.
6. Gate rollout terotorisasi dan penutupan transisi.

Setiap perubahan harus dapat direview mandiri. Jika thin skills akan dirilis sebelum server tersedia, gabungkan release sequence atau tunda publication paket. Jangan merge/deploy urutan yang menyebabkan client baru kehilangan bootstrap.

## Rollback dan risiko yang diterima

| Risiko | Mitigasi dan rollback |
| --- | --- |
| Aturan penting hilang saat pemangkasan | Mapping CP0, content parity review, pulihkan modul/paket sebelumnya. |
| Aset Markdown tidak ikut deployment | Artifact inspection dan runtime smoke sebelum paket thin dirilis. |
| Client/tool registry stale | Doctor, effective version, explicit refresh/reload; runtime tool menjaga bootstrap stabil. |
| Run berhenti setelah pembaruan playbook | Refresh deterministik dan revalidasi; artifact dan source tetap dipertahankan. |
| Salah environment | Konfigurasi generated, server-verified audience, binding token, negative tests. |
| Metadata versi dipalsukan oleh client | Tidak menganggap metadata/receipt sebagai auth atau bukti pedagogi; validators tetap authoritative. |
| Gate mengunci operator | Read/recovery tetap tersedia; kembali ke release transisi atau flag off bila dipilih. |
| Mirror gagal atau rilis paket salah | Stop tanpa mengubah installed state; pulihkan artifact sah melalui versi baru yang maju, jangan menimpa isi versi lama. |
| Sync merusak konfigurasi lokal | Default build-only, ownership marker, targeted edit, backup dan pemulihan. |

Rollback server yang menghapus tool bootstrap dapat merusak thin skills yang sudah terpasang. Simpan artifact server kompatibel yang tetap melayani bootstrap. Jika bootstrap server itu sendiri harus ditarik, koordinasikan pemulihan paket client sebelum menghapus endpoint/tool. Tidak memerlukan rollback database karena rencana awal tidak menambah schema.

## Definisi selesai

Pekerjaan selesai ketika keenam skill menggunakan panduan runtime yang lengkap, compatibility dan drift ditangani sebelum write, generator/packaging deterministik untuk kedua environment, update tanpa uninstall terbukti pada host yang dipertahankan, dan gate diterapkan hanya sesuai rollout yang disetujui.

Handoff menyertakan checkpoint selesai/belum selesai, daftar file dan commits, commands/exit codes, revision/hash paket dan playbook, status tiap host, environment yang benar-benar diuji, remote mirror/deployment state, batas yang belum diuji, serta prosedur rollback. Tidak menyatakan remote atau host berhasil berdasarkan source lokal saja.
