import { mkdir, writeFile } from "node:fs/promises";
import { compileProductDiktatHtml } from "@/lib/bundle/product-diktat-pdf";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { materializeArticleParts } from "@/lib/materials/article-parts";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, prepareAuthoredDiktatVisuals } from "@/lib/materials/diktat-v4";
import { visualSpecSchema, type VisualSpec } from "@/lib/materials/visual-contract";
import { renderSourceFigure, figureChecksum } from "@/lib/compute/source-figure";

const hash = "a".repeat(64);
const sourceRefs = [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }];
const common = { courseId: "science", version: 1, status: "draft", sourceRefs, ideaLinks: [{ id: "science", version: 1, semanticHash: hash, weight: 1, role: "primary" }], sourceHash: hash, generationHash: hash, creatorId: "fixture" };
const fallback = { summary: "Hubungan besaran ilmiah.", columns: [{ id: "x", label: "$x$" }, { id: "y", label: "$y$" }], rows: [["$1$", "$2$"]] };
const base = { version: "zyra-learning-canvas-v1", title: "Hubungan besaran", purpose: "Memahami representasi besaran ilmiah.", variables: [], controls: [], claimRefs: [], altText: "Hubungan besaran ilmiah.", fallback };
function canvas(type: string, fields: object): VisualSpec { return visualSpecSchema.parse({ id: type, kind: "learning_canvas", label: type.replaceAll("_", " "), description: "Hubungan variabel dengan notasi matematis.", interactive: false, canvas: { ...base, type, ...fields } }); }
const visuals = [
  canvas("function_plot", { domain: { min: 0, max: 0.002, sampleCount: 41, unit: "s" }, series: [{ id: "f", label: "$f$", expression: "x/2", unit: "m" }] }),
  canvas("data_plot", { xLabel: "$t$", yLabel: "$F$", xUnit: "s", yUnit: "N", points: [{ x: 0.0002, y: 0.0004 }, { x: 0.0004, y: 0.0008 }, { x: 0.0008, y: 0.0016 }] }),
  canvas("derivation", { steps: [{ id: "s1", label: "Hukum Newton", expression: String.raw`F=ma`, explanation: "Untuk $m>0$, bagi kedua sisi dengan $m$." }, { id: "s2", label: "Percepatan", expression: String.raw`a=\frac{F}{m}`, explanation: "Satuan $a$ adalah $\\pu{m s-2}$." }] }),
  canvas("table", { rows: [["$\\alpha$", "1.7e-5"], ["$\\beta$", "$\\frac{1}{2}$"]] }),
  canvas("chemistry_reaction", { reactants: [{ formula: "H2", coefficient: 2, amount: 0.002, unit: "mol" }, { formula: "O2", coefficient: 1 }], products: [{ formula: "H2O", coefficient: 2 }] }),
  canvas("flowchart", { direction: "down", nodes: [{ id: "input", label: "$F,m$" }, { id: "output", label: "$a=F/m$" }], edges: [{ source: "input", target: "output", label: "$m>0$" }] }),
  canvas("concept_map", { direction: "right", nodes: [{ id: "force", label: "$\\vec F$" }, { id: "acceleration", label: "$\\vec a$" }], edges: [{ source: "force", target: "acceleration", label: "$\\vec F=m\\vec a$" }] }),
  ...["vector_diagram", "free_body"].map(type => canvas(type, { originLabel: "$O=(0,0)$", vectors: [{ id: "force", label: "$\\vec F$", x: 2, y: 3, unit: "N" }, { id: "weight", label: "$\\vec W$", x: 0, y: -2, unit: "N" }] })),
  visualSpecSchema.parse({ id: "geometry", kind: "geometry_2d", label: "Lingkaran $r=1$", description: "Sumbu memakai skala yang sama.", bounds: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 }, staticFallback: { type: "text", summary: "Lingkaran satuan.", content: "Pusat $O$, jari-jari $r=1$." }, geometry: { points: [{ id: "o", x: 0, y: 0, labelLatex: "O" }, { id: "a", x: 1, y: 0, labelLatex: "A" }], segments: [{ id: "radius", from: "o", to: "a", labelLatex: "r=1" }], circles: [{ id: "circle", center: "o", radius: 1 }] } }),
];
// The source bitmap comes from a real, deterministic PDF, not an authored SVG or remote URL.
const stream = "0 0 0 RG 1 w 40 40 m 260 40 l S 40 40 m 40 260 l S 40 40 m 220 220 l S BT /F1 22 Tf 245 15 Td (x) Tj ET BT /F1 22 Tf 15 245 Td (y) Tj ET";
const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>"];
let pdf = "%PDF-1.4\n"; const offsets = [0];
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = pdf.length; pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const sourceBytes = new TextEncoder().encode(pdf), sourceChecksum = figureChecksum(sourceBytes);
const figure = await renderSourceFigure(sourceBytes, 1, [0, 0, 1, 1]);
const image = figure.variants.find(variant => variant.name === "print")!;
const assetId = figureChecksum(JSON.stringify({ sourceChecksum, page: 1, crop: [0, 0, 1, 1] }));
visuals.push(visualSpecSchema.parse({ id: "source_figure", kind: "source_figure", label: "Gambar sumber $y=x$", description: "Grafik garis dari halaman PDF sumber.", assetId, materialId: "source", sourceChecksum, staticFallback: { type: "text", summary: "Garis $y=x$.", content: "Garis naik dengan kemiringan satu." } }));
const staticFigureAssets = { [assetId]: { bytes: image.png, mimeType: "image/png" as const, sourceChecksum } };
const groups = [visuals.slice(0, 2), visuals.slice(2, 5), visuals.slice(5, 7), visuals.slice(7, 9), visuals.slice(9)];
const folder = "artifacts/visual-quality/diktat-static-families";
await mkdir(folder, { recursive: true });
const outputs = [];
for (const [index, group] of groups.entries()) {
  const parts = group.map(visual => ({ id: `source-${visual.id}`, kind: "visual_ref" as const, visualId: visual.id }));
  const article = productEntitySchema.parse({ ...common, id: `article-${index}`, productType: "article", schemaVersion: "article.v4", title: "Representasi ilmiah", slug: `science-${index}`, visuals: group, sections: [{ id: `section-${index}`, kind: "topic", title: "Hubungan besaran", slug: "science", orderIndex: 0, learningObjective: "Membaca representasi ilmiah.", ideaIds: ["science"], sourceRefs, blocks: [{ id: `block-${index}`, blockType: "explanation", orderIndex: 0, contentMarkdown: materializeArticleParts(parts), ideaIds: ["science"], sourceRefs, parts }] }] });
  const units = prepareAuthoredDiktatVisuals(authoredDiktatUnitsSchema.parse(group.map(visual => ({ id: `unit-${visual.id}`, sourceElementRefs: [`source-${visual.id}`], ideaIds: ["science"], parts: [{ id: `print-${visual.id}`, kind: "visual_ref", visualId: visual.id, staticMarkdown: "Gunakan hubungan dan satuan yang ditampilkan untuk membaca visual." }] }))), group);
  const diktat = productEntitySchema.parse({ ...common, id: `diktat-${index}`, productType: "diktat", schemaVersion: "diktat.v4", title: "Representasi ilmiah", sourceArticleId: article.id, sourceArticleVersion: 1, sourceArticleHash: hash, units, contentMarkdown: materializeAuthoredDiktat(units) });
  if (article.productType !== "article" || diktat.productType !== "diktat") throw new Error("Fixture type mismatch");
  const file = `static-families-${index + 1}`;
  await writeFile(`${folder}/${file}.html`, compileProductDiktatHtml({ article, diktat, staticFigureAssets }));
  outputs.push({ file, visualIds: group.map(visual => visual.id) });
}
await writeFile(`${folder}/index.json`, JSON.stringify(outputs));
