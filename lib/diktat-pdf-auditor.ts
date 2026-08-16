import { DiktatStructure } from "./diktat-generator";
import { generateContentWithFallback } from "./gemini";
import { USE_CASES } from "@/lib/ai-router";

export interface PDFAuditResult {
  status: "pass" | "warn" | "fail" | "unavailable";
  warnings: string[];
  errorMessage?: string;
}

export async function auditRenderedPDF(
  pdfBuffer: Buffer,
  structure: DiktatStructure
): Promise<PDFAuditResult> {
  const warnings: string[] = [];

  let extractedText = "";
  try {
    const { PDFParse } = await import("pdf-parse");
    const path = await import("path");
    const { pathToFileURL } = await import("url");
    
    const workerPath = path.resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(pathToFileURL(workerPath).href);

    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const result = await parser.getText();
    extractedText = result.text;
  } catch (err) {
    console.warn("[diktat-pdf-auditor] pdf-parse extraction failed:", err);
    return { status: "warn", warnings: ["PDF text extraction failed; skipping AI audit."] };
  }

  if (!extractedText.trim() || extractedText.trim().length < 50) {
    return { status: "warn", warnings: ["PDF has extremely low text density; potential blank or unrendered pages."] };
  }

  if (extractedText.includes("[object Object]") || extractedText.includes("\\undefined")) {
    warnings.push("PDF contains unrendered raw object or undefined LaTeX artifacts.");
  }

  // Sample: first 3000 chars + any lines likely containing LaTeX artefacts
  const formulaLines = extractedText
    .split("\n")
    .filter(l => l.includes("\\") || l.includes("frac") || l.includes("sqrt") || l.includes("Delta"))
    .slice(0, 20)
    .join("\n");

  const sample = extractedText.substring(0, 3000) + (formulaLines ? "\n\n[Formula lines]\n" + formulaLines : "");

  // Expected formulas from structure for reference
  const expectedFormulas = structure.sections.formulaHandbook
    .slice(0, 5)
    .map(f => `${f.title}: ${f.latex}`)
    .join("\n");

  const prompt = `Kamu memeriksa kualitas rendering PDF diktat matematika.

Teks hasil ekstraksi PDF (sample):
${sample}

Rumus yang diharapkan ada di PDF:
${expectedFormulas}

Periksa apakah ada:
1. Formula atau simbol matematika yang corrupt/rusak
2. Persamaan terpotong atau tidak lengkap
3. Simbol LaTeX yang muncul mentah (misalnya: \\frac, \\sqrt tampil sebagai teks biasa)
4. Teks yang hilang secara tidak wajar

Berikan output JSON:
{
  "status": "PASS" | "WARN",
  "warnings": ["peringatan 1", "peringatan 2"]
}

Jika tidak ada masalah, berikan status PASS dengan array kosong.`;

  try {
    const { response } = await generateContentWithFallback({ useCase: USE_CASES.DIKTAT_PDF_AUDIT, contents: prompt });
    const text: string = typeof response.text === "function" ? response.text() : response.text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { status: "unavailable", warnings: ["Model returned non-JSON output"], errorMessage: "Malformed output" };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const rawStatus = typeof parsed.status === "string" ? parsed.status.toLowerCase() : "";
    const status: PDFAuditResult["status"] =
      rawStatus === "pass" ? "pass" : rawStatus === "warn" ? "warn" : rawStatus === "fail" ? "fail" : "unavailable";
    const parsedWarnings: string[] = Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w: any): w is string => typeof w === "string")
      : [];

    warnings.push(...parsedWarnings);
    return { status, warnings };
  } catch (err) {
    console.warn("[diktat-pdf-auditor] AI audit call failed:", err);
    return { status: "unavailable", warnings: ["Audit worker unavailable"], errorMessage: String(err) };
  }
}
