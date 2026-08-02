import { readFile } from "node:fs/promises";
import { compileArticleProduct } from "@/lib/materials/compiler";
import type { ProductEntity } from "@/lib/bundle/product-validator";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
async function main(): Promise<void> {
  const runId = argument("--run-id");
  const courseId = argument("--course");
  const productFile = argument("--product-file");
  const dryRun = process.argv.includes("--dry-run");
  if (!runId || !courseId || !dryRun) throw new Error("compile-product-preview requires --run-id, --course, and --dry-run");

  const products: ProductEntity[] = productFile
    ? JSON.parse(await readFile(productFile, "utf8"))
    : [];
  const articles = products.filter((product): product is Extract<ProductEntity, { productType: "article" }> => product.productType === "article" && product.courseId === courseId);
  const previews = articles.map((product) => {
    const compilation = compileArticleProduct(product, { strict: false });
    return {
      id: product.id,
      version: product.version,
      quality: compilation.quality,
      markdownHash: compilation.generationHash,
      astBlockCount: compilation.ast.blocks.length,
    };
  });
  console.log(JSON.stringify({ status: "dry-run", runId, courseId, productCount: articles.length, previews }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "blocked", code: "PRODUCT_PREVIEW_FAILED", message: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
