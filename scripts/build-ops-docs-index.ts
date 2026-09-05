import fs from "node:fs/promises";
import path from "node:path";
import { buildDocsKnowledgeBase } from "../lib/admin-ops-ai/rag-store";

async function main() {
  console.log("Generating Ops AI documentation index...");
  const chunks = await buildDocsKnowledgeBase();
  const outputPath = path.join(process.cwd(), "lib", "admin-ops-ai", "ops-docs-index.json");
  await fs.writeFile(outputPath, JSON.stringify(chunks, null, 2), "utf-8");
  console.log(`Successfully generated Ops AI docs index with ${chunks.length} chunks at: ${outputPath}`);
}

main().catch((err) => {
  console.error("Failed to build ops docs index:", err);
  process.exit(1);
});
