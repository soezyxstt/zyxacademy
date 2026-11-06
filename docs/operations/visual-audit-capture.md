# Visual capture dengan sesi staging

Gunakan prosedur ini hanya untuk capture lokal terhadap staging yang telah diotorisasi. Adapter saat ini memakai Neon PostgreSQL. Dokumen ini tidak menetapkan status deployment produksi; verifikasi target saat menjalankan prosedur.

## Batasan

- `loadVerifiedStagingEnvironment` membaca `.env.neon`, memeriksa project, branch, host dan bucket staging serta pemisahannya dari target produksi, lalu memasang `default_transaction_read_only=on` pada koneksi PostgreSQL. Jangan melewati pemeriksaan atau mematikan read-only ketika terjadi error.
- Read-only dapat menolak penulisan insidental saat navigasi. Cache rekomendasi terbaru bersifat best effort, tetapi pembuatan streak masih melakukan penulisan dan dapat gagal. Catat kegagalan dan batas cakupan; jangan menyimpulkan seluruh database tidak berubah. Hindari tindakan yang menulis ke storage atau layanan eksternal.
- Jangan cetak isi env, URL koneksi, token, tanda tangan, cookie, atau data pribadi ke terminal, log, laporan, atau chat. Screenshot dapat memuat PII staging; simpan hanya di `artifacts/` yang diabaikan git dan jangan bagikan.
- Hanya primary agent yang menjalankan pemeriksaan visual dan membuka setiap screenshot. Gunakan viewport 380 x 844 dan 1536 x 864, serta breakpoint tambahan bila relevan.

## Build dan server

Dari root repository, pastikan `.env.neon` tersedia dan port 3100 bebas. Jangan hentikan proses milik pihak lain. Loader gagal tertutup jika identitas target tidak sesuai. Build candidate sekali, lalu start dari build yang sama:

```bash
mkdir -p artifacts/visual-quality
bun scripts/performance/run-next-staging.ts build --build-kind candidate
setsid bun scripts/performance/run-next-staging.ts start --build-kind candidate --port 3100 --server-record artifacts/visual-quality/staging-server.json > artifacts/visual-quality/staging-server.log 2>&1 &
staging_pid=$!
```

Build candidate memerlukan baseline asli atau arsip baseline valid; jika prasyarat tidak ada, berhenti dan catat kegagalannya. Launcher memverifikasi build ID, hash sumber dan identitas target saat start, serta menolak port yang sudah digunakan atau record yang sudah ada. Hash sumber mengecualikan `docs/`, `plans/`, env dan artifacts; perubahan sumber lain setelah build memerlukan build candidate baru. Jangan mengganti build saat server masih berjalan. Log dapat berisi informasi sensitif, jangan bagikan.

## Autentikasi dan capture

`tests/visual/staging-readonly-auth.ts` memanggil loader, mengambil sesi admin aktif yang segar melalui query read-only, menandatangani cookie lokal, lalu mencoba kedua nama cookie pada `/api/auth/get-session`. Probe harus mengembalikan user ID yang hash-nya cocok dengan sesi terpilih. Jika gagal atau sesi berotasi, hentikan atau ulangi navigasi dengan sesi segar; jangan menebak nama cookie. Helper dipanggil sebelum navigasi pada pemeriksaan visual standar. Untuk spec interaksi, panggil `prepareReadOnlyStagingCapture(page, baseUrl)` tepat sebelum setiap navigasi terproteksi dan gunakan sesi segar untuk setiap navigasi.

Dengan server milik sendiri yang sudah siap, jalankan rute yang relevan:

```bash
VISUAL_CHECK_STAGING_SESSION=1 PLAYWRIGHT_BASE_URL=http://localhost:3100 VISUAL_CHECK_PATHS=/admin bun run test:visual
```

Ganti daftar rute sesuai perubahan. Untuk state interaktif, gunakan spec terfokus yang menangkap setiap state pada kedua viewport. `VISUAL_CHECK_STUB_VERCEL=1` secara opsional mengganti skrip analytics lokal dengan respons kosong; itu tidak memverifikasi pengiriman analytics. Periksa setiap screenshot langsung di `artifacts/visual-quality/results/`, termasuk overflow, clipping, hierarki dan focus. Catat command, exit status, matriks rute dan state, viewport, path screenshot, respons HTTP gagal, redirect tak terduga, error halaman atau konsol, serta batas yang belum terverifikasi. Jangan menganggap screenshot default cukup untuk state interaktif.

## Pembersihan

Hentikan hanya process group yang dibuat oleh perintah `setsid` di atas. Pastikan `$staging_pid` masih menunjuk launcher yang dimiliki sesi ini dan merupakan pemimpin process group sebelum mengirim sinyal; jika identitas tidak cocok, jangan kirim sinyal. Jangan gunakan `pkill -f` atau mematikan proses berdasarkan port saja.

```bash
ps -o pid,pgid,args -p "$staging_pid"
kill -TERM -- "-$staging_pid"
wait "$staging_pid" 2>/dev/null || true
```

Pastikan proses berhenti dan record server dihapus oleh launcher. Jika proses sudah tidak ada tetapi record tertinggal, verifikasi record tersebut milik sesi ini sebelum menghapusnya. Simpan artifacts secara lokal dan periksa status worktree tanpa membuang perubahan lain.
