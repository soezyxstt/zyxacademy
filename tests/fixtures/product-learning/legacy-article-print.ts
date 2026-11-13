import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileProductArticleHtml } from "@/lib/bundle/product-diktat-pdf";

// Deterministic local visual fixture; no database, credentials or remote media.
export const legacyArticlePrintFixture = {
  id: "fixture-article", productType: "article", schemaVersion: "article.v3", title: "Perubahan energi", version: 1,
  generationHash: "a".repeat(64), blocks: [], visuals: [],
  sections: [{ id: "s1", title: "Energi dan usaha", learningObjective: "Menghubungkan usaha dengan perubahan energi kinetik.", orderIndex: 0, blocks: [
    { id: "b1", orderIndex: 0, blockType: "explanation", title: "Hubungan dasar", contentMarkdown: "Usaha mengubah energi kinetik benda. Lihat [hukum energi](https://example.test/energi). Rujukan: <https://example.test/a_b_c>. [Rumus $W$](https://example.test/$x$) dan <https://example.test/$z$>.\n\n$$\nW = \\Delta E_k = \\frac{1}{2}mv^2 - \\frac{1}{2}mu^2\n$$\n\nMassa $m$ dinyatakan dalam kilogram dan kecepatan $u$, $v$ dalam meter per sekon." },
    { id: "b2", orderIndex: 1, blockType: "worked_example", title: "Contoh", contentMarkdown: "Sebuah benda bermassa $2\\,\\mathrm{kg}$ berubah kecepatan dari $1$ menjadi $3\\,\\mathrm{m/s}$.", workedExamplePayload: { steps: [{ stepIndex: 0, label: "Hitung perubahan energi", explanation: "$\\Delta E_k = \\frac12(2)(3^2 - 1^2) = 8\\,\\mathrm{J}$.", reason: "Gunakan perubahan energi kinetik." }], verification: "Satuan hasil adalah joule." } },
    { id: "b3", orderIndex: 2, blockType: "retrieval_prompt", title: "Periksa pemahaman", contentMarkdown: "Apa yang terjadi pada energi kinetik saat laju bertambah?", formativeCheckPayload: { checkKind: "multiple_choice", answer: "Bertambah", explanation: "Laju bertambah.", options: [{ id: "a", text: "Berkurang", isCorrect: false }, { id: "b", text: "Bertambah", isCorrect: true }] } },
  ] }],
};

if (import.meta.main) {
  const output = path.resolve(process.argv[2] ?? "artifacts/visual-quality/legacy-article-print.html");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, compileProductArticleHtml(legacyArticlePrintFixture as any));
  console.log(output);
}
