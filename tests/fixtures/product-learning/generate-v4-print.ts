import { mkdir, writeFile } from "node:fs/promises";
import { compileProductDiktatHtml } from "@/lib/bundle/product-diktat-pdf";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { materializeArticleParts } from "@/lib/materials/article-parts";
import { materializeAuthoredDiktat, authoredDiktatUnitsSchema } from "@/lib/materials/diktat-v4";
import { LIMIT_EPSILON_DELTA_GRAPH } from "./limit-epsilon-delta";

const hash = "a".repeat(64);
const sourceRefs = [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }];
const common = { courseId: "math", version: 1, status: "draft", sourceRefs,
  ideaLinks: [{ id: "limit", version: 1, semanticHash: hash, weight: 1, role: "primary" }],
  sourceHash: hash, generationHash: hash, creatorId: "fixture" };
const parts = [{ id: "linear-distance", kind: "math_unit" as const, latex: String.raw`|f(x)-L|=2|x|,\qquad\delta=\frac{\varepsilon}{2}`,
  meaningMarkdown: "Untuk $f(x)=2x$ di sekitar $c=0$, jarak keluaran dua kali jarak input. Pilih delta agar seluruh lingkungan input memenuhi toleransi keluaran.",
  conditionsMarkdown: "Syarat: $x$ real, $\\varepsilon>0$, dan $0<|x|<\\delta$. Nilai $x=0$ dikecualikan dari implikasi limit." }];
const visual = { ...LIMIT_EPSILON_DELTA_GRAPH, functionModel: { kind: "linear" as const, m: 2, b: 0 }, limitPoint: 0, limitValue: 0, bounds: { xMin: -2, xMax: 2, yMin: -4, yMax: 4 }, label: "Lingkungan $\\delta$ dan pita $\\varepsilon$", description: "Batas cukup untuk $f(x)=2x$ di sekitar $c=0$ dan $L=0$." };
const graphPart = { id: "linear-graph", kind: "visual_ref" as const, visualId: visual.id };
const article = productEntitySchema.parse({ ...common, id: "article", productType: "article", schemaVersion: "article.v4", title: "Bab 2: Fungsi dan Limit", slug: "fungsi-dan-limit", visuals: [visual],
  sections: [{ id: "section", kind: "topic", title: "Limit fungsi linear", slug: "linear", orderIndex: 0, learningObjective: "Memilih lingkungan input.", ideaIds: ["limit"], sourceRefs,
    blocks: [{ id: "block", blockType: "explanation", orderIndex: 0, contentMarkdown: materializeArticleParts([...parts, graphPart]), ideaIds: ["limit"], sourceRefs, parts: [...parts, graphPart] }] }] });
const units = authoredDiktatUnitsSchema.parse([{ id: "unit", sourceElementRefs: ["linear-distance", "linear-graph"], ideaIds: ["limit"], parts: [{ id: "heading", kind: "markdown", markdown: "## Menentukan delta dari epsilon" }, { ...parts[0], id: "summary-distance" }, { id: "summary-graph", kind: "visual_ref", visualId: visual.id, staticMarkdown: "Pita horizontal membatasi keluaran; pita vertikal membatasi input." }] }]);
const diktat = productEntitySchema.parse({ ...common, id: "diktat", productType: "diktat", schemaVersion: "diktat.v4", title: "Bab 2: Fungsi dan Limit", sourceArticleId: "article", sourceArticleVersion: 1, sourceArticleHash: hash, units, contentMarkdown: materializeAuthoredDiktat(units) });
if (article.productType !== "article" || diktat.productType !== "diktat") throw new Error("Invalid fixture");
const html = compileProductDiktatHtml({ article, diktat });
const folder = "artifacts/visual-quality/diktat-v4";
await mkdir(folder, { recursive: true });
await writeFile(`${folder}/diktat.html`, html);
