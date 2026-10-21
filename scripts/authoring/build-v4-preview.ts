import { writeFile } from "node:fs/promises";
import { buildLocalVerificationFixture } from "./local-verification-fixture";
import { semanticArticleParts } from "../../tests/fixtures/product-learning/article-semantics";
import { verificationPreviewSchema } from "../../lib/materials/verification-preview";

const article = buildLocalVerificationFixture().bundle.products.find(product => product.productType === "article");
if (!article || article.productType !== "article") throw new Error("V4_PREVIEW_ARTICLE_REQUIRED");
const preview = verificationPreviewSchema.parse({ type: "zyx-verification-preview.v1", title: "Limit fungsi", visuals: article.visuals,
  sections: [...article.sections.map(section => ({ id: section.id, title: section.title, blocks: section.blocks.map(block => ({ id: block.id, parts: block.parts })) })),
    { id: "worked-proof", title: "Contoh dengan alasan setiap langkah", blocks: [{ id: "worked-proof-block", parts: semanticArticleParts.filter(part => part.kind === "worked_example") }] }],
});
await writeFile("lib/materials/v4-preview.json", `${JSON.stringify(preview, null, 2)}\n`);
