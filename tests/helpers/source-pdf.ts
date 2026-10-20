export function sourcePdf(width = 200, height = 100) {
  const stream = "BT /F1 12 Tf 20 40 Td (Hello PDF) Tj ET";
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(source.length); source += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = source.length;
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(source);
}
