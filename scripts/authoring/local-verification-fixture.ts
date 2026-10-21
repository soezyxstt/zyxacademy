import { zipSync } from "fflate";
import { createHash } from "node:crypto";
import { LIMIT_ARTICLE_FIXTURE, LIMIT_EPSILON_DELTA_GRAPH } from "../../tests/fixtures/product-learning/limit-epsilon-delta";
import { articlePartsSchema, materializeArticleParts } from "../../lib/materials/article-parts";
import { authoredDiktatUnitsSchema, materializeAuthoredDiktat, prepareAuthoredDiktatVisuals } from "../../lib/materials/diktat-v4";
import { computeProductBundleChecksum, deterministicProductSerialization, productEntitySchema, validateProductBundle, type ProductDependency } from "../../lib/bundle/product-validator";
import { finalizeProductBundleDraft } from "../../lib/bundle/product-draft";

const localBlockProse: Record<string, string> = {
  "block-ov-pka": "Sebelumnya kita memahami limit secara intuitif: $f(x)$ mendekati $L$ saat $x$ mendekati $c$. Namun kata mendekati masih menyisakan ambiguitas matematis.",
  "block-ov-exp": "Fungsi dapat berosilasi atau memiliki lompatan. Kita memerlukan batas jarak yang menjamin perilaku semua input dalam lingkungan, bukan hanya beberapa titik sampel.",
  "block-ed-pka": "Jarak antara $x$ dan $c$ dinyatakan oleh nilai mutlak $|x-c|$. Syarat $0<|x-c|$ mengecualikan titik $x=c$.",
  "block-ed-exp-def": "Pernyataan $\\lim_{x\\to c}f(x)=L$ berarti untuk setiap $\\varepsilon>0$ terdapat $\\delta>0$ sehingga $0<|x-c|<\\delta$ mengakibatkan $|f(x)-L|<\\varepsilon$.",
  "block-ed-exp-dep": "Penantang memberikan $\\varepsilon$ terlebih dahulu; kemudian kita mencari $\\delta$ yang cocok. Syarat $0<|x-c|$ mengecualikan $x=c$, sehingga nilai $f(c)$ tidak menentukan nilai limit.",
  "block-ed-example-linear": "Buktikan dengan definisi formal bahwa $\\lim_{x\\to3}(2x+1)=7$.",
  "block-ed-chk-mcq": "Manakah urutan penentuan $\\varepsilon$ dan $\\delta$ yang sesuai dengan definisi limit?",
  "block-ed-chk-short": "Untuk $f(x)=4x-3$, buktikan $\\lim_{x\\to2}f(x)=5$. Jika $\\varepsilon=0.04$, tentukan nilai $\\delta$ terbesar yang memenuhi syarat.",
  "block-sum-content": "Definisi limit menghubungkan jarak input dan toleransi keluaran. Untuk fungsi konstan $f(x)=k$ pada $\\mathbb{R}$, sembarang $\\delta>0$ menjamin limit $k$. Pada titik lompatan, kedua sisi tidak mendekati nilai yang sama.",
  "block-sum-close": "Mengapa definisi limit mensyaratkan $0<|x-c|$ dan bukan hanya $|x-c|<\\delta$?",
};
const localWorkedExample = {
  steps: [
    { stepIndex: 0, label: "Analisis pendahuluan", explanation: "Kita ingin $|(2x+1)-7|<\\varepsilon$. Bentuk ini sama dengan $2|x-3|<\\varepsilon$.", reason: "Hubungkan jarak keluaran $|f(x)-L|$ dengan kelipatan jarak input $|x-c|$." },
    { stepIndex: 1, label: "Memilih toleransi input", explanation: "Dari $2|x-3|<\\varepsilon$ diperoleh $|x-3|<\\varepsilon/2$. Pilih $\\delta=\\varepsilon/2$.", reason: "Pilihan ini positif karena $\\varepsilon>0$." },
    { stepIndex: 2, label: "Menyusun bukti formal", explanation: "Untuk sembarang $\\varepsilon>0$, pilih $\\delta=\\varepsilon/2$. Jika $0<|x-3|<\\delta$, maka $|(2x+1)-7|=2|x-3|<2(\\varepsilon/2)=\\varepsilon$.", reason: "Implikasi berlaku untuk seluruh lingkungan input yang dipilih." },
  ],
  verification: "Untuk setiap $\\varepsilon>0$, pilihan $\\delta=\\varepsilon/2$ menjamin $|f(x)-7|<\\varepsilon$ bagi seluruh input dengan $0<|x-3|<\\delta$.",
};
const localCheckExplanations: Record<string, string> = {
  "block-ed-chk-mcq": "$\\varepsilon$ diberikan terlebih dahulu sebagai toleransi keluaran, kemudian $\\delta$ dipilih untuk menjaminnya.",
  "block-ed-chk-short": "$|(4x-3)-5|=4|x-2|$. Pilihan $\\delta=\\varepsilon/4=0.01$ cukup dan terbesar untuk $\\varepsilon=0.04$.",
  "block-sum-close": "Limit menggambarkan perilaku di sekitar titik pusat, sehingga $f(c)$ tidak harus terdefinisi.",
};
const localOptions: Record<string, string> = { "opt-a": "$\\delta$ dipilih dahulu, lalu $\\varepsilon$ dihitung.", "opt-b": "$\\varepsilon>0$ diberikan dahulu, lalu $\\delta>0$ dipilih.", "opt-c": "$\\varepsilon$ dan $\\delta$ harus selalu sama." };
export function buildLocalVerificationFixture() {
  const hash = "a".repeat(64);
  const source = LIMIT_ARTICLE_FIXTURE;
  const visual = { ...LIMIT_EPSILON_DELTA_GRAPH, label: "Lingkungan $\\delta$ dan toleransi $\\varepsilon$", description: "Uji $f(x)=2x+1$ pada $c=3$ dan $L=7$.", staticFallback: { ...LIMIT_EPSILON_DELTA_GRAPH.staticFallback, summary: "Nilai $x$ dan $f(x)$ di dalam lingkungan $\\delta$ dan pita $\\varepsilon$.",
    ...(LIMIT_EPSILON_DELTA_GRAPH.staticFallback.type === "table" ? { headers: ["$x$", "$f(x)$", "$|x-3|$", "$|f(x)-7|$"] } : {}) } };
  const sections = source.sections.map((section) => ({ id: section.id, kind: section.kind, title: section.kind === "topic" ? "Definisi formal $\\varepsilon$ dan $\\delta$" : section.title, slug: section.slug,
    learningSectionId: section.kind === "topic" ? section.learningSectionId ?? "local-learning-section" : undefined,
    parentSectionId: section.parentSectionId, orderIndex: section.orderIndex, learningObjective: section.kind === "topic" ? "Menguasai urutan kuantor dan membatasi jarak input tanpa menggunakan nilai tepat di titik pusat." : section.learningObjective, ideaIds: section.ideaIds, sourceRefs: section.sourceRefs, pedagogy: section.pedagogy,
    blocks: section.blocks.map((block) => {
      const prose = localBlockProse[block.id];
      if (!prose) throw new Error(`LOCAL_FIXTURE_PROSE_MISSING:${block.id}`);
      const parts = articlePartsSchema.parse([{ id: `${block.id}-prose`, kind: "markdown", markdown: prose },
        ...(block.id === "block-ed-exp-def" ? [{ id: "local-epsilon-distance", kind: "math_unit", latex: "|f(x)-7|=2|x-3|,\\quad\\delta=\\frac{\\varepsilon}{2}", meaningMarkdown: "Jarak keluaran dua kali jarak masukan. Pilihan $\\delta=\\varepsilon/2$ cukup untuk membatasi seluruh lingkungan input.", conditionsMarkdown: "Untuk $\\varepsilon>0$ dan $0<|x-3|<\\delta$, berlaku $|f(x)-7|<\\varepsilon$." }] : []),
        ...(block.id === "block-ed-exp-def" ? [visual.id] : block.visualIds ?? []).map((visualId) => ({ id: `${block.id}-visual`, kind: "visual_ref", visualId }))]);
      return { id: block.id, blockType: block.blockType, title: block.id === "block-ed-example-linear" ? "Pembuktian limit fungsi linear" : block.title, orderIndex: block.orderIndex, contentMarkdown: materializeArticleParts(parts), parts, ideaIds: block.ideaIds, sourceRefs: block.sourceRefs, visualIds: block.id === "block-ed-exp-def" ? [visual.id] : block.visualIds,
        workedExamplePayload: block.workedExamplePayload ? localWorkedExample : undefined, formativeCheckPayload: block.formativeCheckPayload ? { ...block.formativeCheckPayload, explanation: localCheckExplanations[block.id], options: block.formativeCheckPayload.options?.map((option) => ({ ...option, text: localOptions[option.id] })) } : undefined };
    }) }));
  const common = { courseId: source.courseId, chapterId: "chapter-limit", version: 1, status: "draft", ideaLinks: [{ id: source.ideaIds[0], version: 1, semanticHash: hash, weight: 1, role: "primary" }], sourceRefs: sections[0].sourceRefs, sourceHash: sections[0].sourceRefs[0].checksum, generationHash: hash, creatorId: "local-verification-author", curatorId: "local-verification-reviewer" };
  const article = productEntitySchema.parse({ ...common, id: source.id, productType: "article", schemaVersion: "article.v4", title: "Bab 2: Fungsi dan Limit", slug: "local-limit-verification", sections, visuals: [visual] });
  if (article.productType !== "article") throw new Error("FIXTURE_ARTICLE_REQUIRED");
  const graphRef = article.sections.flatMap((section) => section.blocks.flatMap((block) => block.parts ?? [])).find((part) => part.kind === "visual_ref")!;
  const units = prepareAuthoredDiktatVisuals(authoredDiktatUnitsSchema.parse([{ id: "local-summary", sourceElementRefs: ["local-epsilon-distance", graphRef.id], ideaIds: source.ideaIds,
    parts: [{ id: "summary-heading", kind: "markdown", markdown: "## Menghubungkan toleransi input dan keluaran" }, { id: "summary-math", kind: "math_unit", latex: "|f(x)-7|=2|x-3|,\\quad\\delta=\\frac{\\varepsilon}{2}", meaningMarkdown: "Untuk $f(x)=2x+1$, pilih $\\delta=\\varepsilon/2$. Jarak keluaran selalu dua kali jarak input.", conditionsMarkdown: "Syarat: $\\varepsilon>0$ dan $0<|x-3|<\\delta$. Nilai pusat dikecualikan dalam implikasi limit." }, { id: "summary-graph", kind: "visual_ref", visualId: visual.id, staticMarkdown: "Pita horizontal membatasi keluaran; pita vertikal membatasi masukan. Titik pusat berada di $(3,7)$." }] }]), [visual]);
  const diktat = productEntitySchema.parse({ ...common, id: "local-diktat", productType: "diktat", schemaVersion: "diktat.v4", title: "Bab 2: Fungsi dan Limit", sourceArticleId: article.id, sourceArticleVersion: 1, sourceArticleHash: hash, units, contentMarkdown: materializeAuthoredDiktat(units) });
  const products = [article, diktat];
  const dependencies: ProductDependency[] = [{ id: "local-lineage", upstreamEntityType: "product", upstreamEntityId: article.id, upstreamVersion: 1, upstreamHash: hash, downstreamEntityType: "diktat", downstreamEntityId: diktat.id, downstreamVersion: 1, downstreamHash: hash, freshness: "UP_TO_DATE" }];
  const encode = (value: unknown) => new TextEncoder().encode(deterministicProductSerialization(value));
  const files = new Map([["products.json", encode(products)], ["dependencies.json", encode(dependencies)]]);
  const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  const base = { bundleId: "local-v4-verification", bundleType: "product" as const, schemaVersion: "product-bundle.v4" as const, courseId: source.courseId, creatorId: common.creatorId, curatorId: common.curatorId, createdAt: "2026-10-21T00:00:00.000Z", conflicts: [], entityFiles: [{ path: "products.json", entityType: "products" as const, checksum: sha(files.get("products.json")!), stableIds: products.map((product) => product.id) }, { path: "dependencies.json", entityType: "dependencies" as const, checksum: sha(files.get("dependencies.json")!), stableIds: dependencies.map((dependency) => dependency.id) }] };
  files.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, files) }));
  const validation = validateProductBundle(zipSync(Object.fromEntries(files)));
  if (!validation.success) throw new Error(`LOCAL_FIXTURE_INVALID:${JSON.stringify(validation.issues)}`);
  return finalizeProductBundleDraft(validation.data, { products: [...validation.data.products] });
}
