import { notFound } from "next/navigation";
import { productEntitySchema } from "@/lib/bundle/product-validator";
import { ProductV4EditorFixture } from "./visual-fixture";

export const dynamic = "force-dynamic";

export default function ProductV4EditorPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const hash = "a".repeat(64);
  const common = {
    courseId: "math", version: 1, status: "draft", schemaVersion: "article.v4",
    ideaLinks: [{ id: "idea", version: 1, semanticHash: hash, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source", version: 1, checksum: hash, excerptIds: ["excerpt"] }],
    sourceHash: hash, generationHash: hash, creatorId: "fixture",
  };
  const article = productEntitySchema.parse({
    ...common, id: "article", productType: "article", title: "Syarat fungsi linear", slug: "fungsi-linear", blocks: [],
    sections: [{ id: "section", kind: "topic", title: "Jarak keluaran", slug: "jarak", orderIndex: 0, learningObjective: "Menghubungkan jarak input dan keluaran.", ideaIds: ["idea"], sourceRefs: common.sourceRefs,
      blocks: [{ id: "block", blockType: "explanation", orderIndex: 0, ideaIds: ["idea"], sourceRefs: common.sourceRefs, contentMarkdown: "$$|2x|=2|x|$$\n\nJarak keluaran dua kali jarak input.", parts: [{ id: "formula", kind: "math_unit", latex: "|2x|=2|x|", meaningMarkdown: "Jarak keluaran dua kali jarak input." }] }],
    }],
  });
  const diktat = productEntitySchema.parse({
    ...common, id: "diktat", productType: "diktat", title: "Ringkasan fungsi linear", schemaVersion: "diktat.v4", sourceArticleId: "article", sourceArticleVersion: 1, sourceArticleHash: hash,
    contentMarkdown: "$$|2x|=2|x|$$\n\nJarak keluaran dua kali jarak input.",
    units: [{ id: "unit", sourceElementRefs: ["formula"], ideaIds: ["idea"], parts: [{ id: "summary-formula", kind: "math_unit", latex: "|2x|=2|x|", meaningMarkdown: "Jarak keluaran dua kali jarak input." }] }],
  });
  return <ProductV4EditorFixture products={[article, diktat]} />;
}
