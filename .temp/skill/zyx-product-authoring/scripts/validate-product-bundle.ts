import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(code: string, detail: unknown): never {
  process.stderr.write(`${JSON.stringify({ valid: false, code, detail }, null, 2)}\n`);
  process.exit(1);
}

function findRepoRoot(start: string): string {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, "lib/bundle/product-validator.ts"))) return cursor;
    const parent = dirname(cursor);
    if (parent === cursor) fail("ZYX_REPOSITORY_NOT_FOUND", "Run inside the Zyx repository.");
    cursor = parent;
  }
}

const input = process.argv[2];
if (!input) fail("PRODUCT_BUNDLE_PATH_REQUIRED", "Usage: bun scripts/validate-product-bundle.ts <product-bundle.zip>");
const path = resolve(input);
if (!existsSync(path)) fail("PRODUCT_BUNDLE_NOT_FOUND", path);

try {
  const root = findRepoRoot(process.cwd());
  const module = await import(pathToFileURL(join(root, "lib/bundle/product-validator.ts")).href);
  const result = module.validateProductBundle(new Uint8Array(readFileSync(path)));
  if (!result.success) fail("PRODUCT_BUNDLE_INVALID", result.issues);
  if (result.data.publicationBlocked) fail("PRODUCT_BUNDLE_PUBLICATION_BLOCKED", result.data.issues);
  const counts: Record<string, number> = {};
  for (const product of result.data.products) counts[product.productType] = (counts[product.productType] ?? 0) + 1;
  process.stdout.write(`${JSON.stringify({
    valid: true,
    bundleId: result.data.manifest.bundleId,
    checksum: result.data.manifest.bundleChecksum,
    counts,
    dependencies: result.data.dependencies.length,
  }, null, 2)}\n`);
} catch (error) {
  fail("PRODUCT_BUNDLE_VALIDATION_FAILED", error instanceof Error ? error.message : String(error));
}
