# Audit Rute API Beban Komputasi Berat

Tanggal: 2026-09-06. Status: OPEN / IN PROGRESS.
Lingkup: Audit rute API Next.js (`app/api/**`) untuk identifikasi komputasi berat, inferensi AI sinkron, dan transformasi berkas.

## Ringkasan Eksekutif

Dalam arsitektur Zyx Academy pasca-migrasi Deno Deploy, seluruh background job berat dieksekusi di Deno Deploy via Inngest worker. Vercel Next.js dipertahankan sebagai edge/SSR web tier yang ringan. Rute API pada Vercel harus mematuhi prinsip:
1. Menghindari inferensi AI LLM (Gemini) secara sinkron pada siklus request-response HTTP.
2. Menggunakan pola **Enqueue and Return 202 Accepted** untuk proses komputasi yang memerlukan waktu lebih dari 1 detik.
3. Melakukan polling status atau memanfaatkan event bus Inngest untuk pembaruan status pengerjaan.

## Hasil Audit Rute API

| Rute API | Metode | Kategori Beban | Status Penanganan | Rekomendasi / Tindakan |
|---|---|---|---|---|
| `/api/quiz/attempts/[id]/analytics` | GET | Diagnosis AI & komputasi metrik kuis | Terdecouple | Mengembalikan 202 `{ status: "processing" }` dan enqueue event `quiz/analytics.requested`. Client melakukan polling tiap 4 detik. |
| `/api/quiz/attempts/[id]/analytics` | POST | Re-queue diagnosis AI | Terdecouple | Menyetel `status: "processing"`, enqueue event `quiz/analytics.requested`, dan mengembalikan 202. |
| `/api/quiz/weekly-generate` | POST | Generasi soal Gemini AI via Bank | Terdecouple parsial | Bila stok bank soal kurang, memicu `startGenerationJob` dan mengembalikan 202 dengan `jobId`. Klien mem-poll `/api/admin/generation-jobs/[id]`. |
| `/api/admin/quiz-insights/[id]/analyze` | POST | Inferensi Gemini untuk analisis butir soal | Sinkron (Admin) | Berjalan sinkron untuk admin saat ini. Direkomendasikan dimigrasikan ke Inngest event jika jumlah submission kuis > 100 siswa. |
| `/api/courses/[id]/material/[materialId]/thumbnail` | GET | Ekstraksi cover PDF dan WebP Sharp | Terdecouple penuh | Mengembalikan redirect jika thumbnail siap, atau enqueue event `pdf/thumbnail.requested` dan langsung mengembalikan placeholder SVG berbobot ringan. Worker Deno mengekstrak halaman dan mengonversi WebP. |
| `/api/admin/bundles/product/[id]/pdf` | POST | Rendering dan kompilasi Diktat PDF | Terdecouple penuh | Enqueue `product.diktat.pdf.requested`, mengembalikan 202 `{ status: "pending" }`. Worker Deno menjalankan kompilasi dan upload R2. |
| `/api/mcp/authoring` | POST | Parsing PDF buku sumber dan resolusi Source Pack | Terdecouple via RPC | Web tier mendelegasikan parsing halaman dan resolusi byte berkas ke Deno Compute RPC (`/internal/pdf/pages` dan `/internal/authoring/source-pack/resolve`). |
| `/api/admin/questions/bulk-markdown` | POST | Parsing teks markdown & insert batch | Sinkron (Admin) | Ringan untuk batch < 50 soal. Perlu batch chunking jika mengimpor > 100 soal sekaligus. |
| `/api/admin/analytics/sync` | POST | Sinkronisasi analitik agregat | Terdecouple | Memicu job snapshot berkala via Inngest cron (`course-analytics-snapshot-cron`). |

## Kebijakan Web Tier Zero-Native Compute

Untuk menjaga stabilitas Vercel Serverless dan mencegah lonjakan memori atau cold start akibat binary native:

1. **Larangan Library Native Berat di Web Tier**: Modul `sharp`, `pdf-parse`, `puppeteer`, dan sejenisnya dilarang diimpor oleh kode di dalam direktori `app/**`.
2. **Pemisahan Entri Inngest**:
   - Vercel Web Tier: `@/jobs/web` mendaftarkan `webFunctions` (hanya fungsi ringan, saat ini array kosong).
   - Deno Compute Tier: `@/jobs/compute` mendaftarkan `computeFunctions` (seluruh fungsi background berat).
3. **Pola Enqueue dan Respons Cepat**:
   - Inisialisasi DB: Buat entitas dengan `status: "processing"` atau `status: "queued"`.
   - Kirim Event Inngest: `await inngest.send({ name: "<domain>/<action>.requested", data: { ... } })`.
   - Kembalikan HTTP `202 Accepted` atau placeholder grafis ringan.
4. **Validasi Statis CI**: Perintah `bun run audit:web-boundaries` dan `bun run worker:deno:audit` memverifikasi kepatuhan batas arsitektur secara otomatis.
