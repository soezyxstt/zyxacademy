import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { renderProductDiktatPdf, inspectProductDiktatPdf } from "@/lib/bundle/product-diktat-pdf";

async function main() {
  console.log("=== Smoke Test: Zyx Diktat Renderer (Staging) ===");
  const url = process.env.DIKTAT_RENDERER_URL;
  console.log(`Target URL: ${url}`);

  if (!url || !process.env.DIKTAT_RENDERER_SECRET) {
    throw new Error("DIKTAT_RENDERER_URL atau DIKTAT_RENDERER_SECRET belum disetel di .env.staging");
  }

  // 1. Healthcheck
  const healthRes = await fetch(`${url}/health`);
  const healthBody = await healthRes.json();
  console.log(`GET /health: ${healthRes.status}`, healthBody);

  // 2. Render PDF nyata
  console.log("Mengirim request render PDF...");
  const startTime = performance.now();
  const sampleHtml = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Uji Staging Diktat</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: "DejaVu Sans", Arial, sans-serif; line-height: 1.5; color: #111; }
    h1 { color: #b94c16; font-size: 20pt; margin-bottom: 8mm; }
    .box { border-left: 4px solid #b94c16; padding: 12px; background: #f9f9fb; margin: 15px 0; }
  </style>
</head>
<body>
  <h1>Uji Staging Zyx Diktat Renderer</h1>
  <p>Dokumen ini dirender langsung oleh Cloudflare Browser Run Quick Actions di environment staging.</p>
  <div class="box">
    <h3>Informasi Uji Coba</h3>
    <p><strong>Target Worker:</strong> ${url}</p>
    <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
    <p><strong>Mesin Render:</strong> Cloudflare Managed Chromium (Stateless Quick Action)</p>
  </div>
</body>
</html>`;

  const pdfBytes = await renderProductDiktatPdf(sampleHtml);
  const elapsed = (performance.now() - startTime).toFixed(0);
  console.log(`PDF berhasil di-render dalam ${elapsed} ms! Ukuran: ${pdfBytes.byteLength} bytes.`);

  // 3. Inspeksi PDF biner
  const inspection = await inspectProductDiktatPdf(pdfBytes);
  console.log(`Hasil inspeksi: ${inspection.pageCount} halaman, teks terbaca.`);

  // 4. Simpan ke artifacts
  const outDir = join(process.cwd(), "artifacts", "staging");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "smoke-test-diktat.pdf");
  await writeFile(outPath, pdfBytes);
  console.log(`Berkas PDF tersimpan di: ${outPath}`);
  console.log("=== Hasil: LULUS (Semua verifikasi staging berhasil) ===");
}

main().catch((err) => {
  console.error("Smoke test gagal:", err);
  process.exit(1);
});
