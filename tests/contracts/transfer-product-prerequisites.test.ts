import { expect, test } from "bun:test";
import { artikel } from "@/db/schema";
import { verifyDependencies } from "@/lib/bundle/product-publication";

type Tx = Parameters<typeof verifyDependencies>[0];
type Dependency = Parameters<typeof verifyDependencies>[1][number];

const dependency = { id: "dependency", freshness: "UP_TO_DATE", upstreamEntityType: "product", upstreamEntityId: "upstream", upstreamVersion: 1, upstreamHash: "a".repeat(64) } as Dependency;

function database(article: { id: string; version: number; hash: string } | null): Tx {
  return { select: () => ({ from: (table: unknown) => ({ where: async () => table === artikel && article ? [article] : [] }) }) } as unknown as Tx;
}

test("transfer waits for a missing external product while publication retains its existing error", async () => {
  await expect(verifyDependencies(database(null), [dependency], [], { distinguishMissingProduct: true })).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NOT_PUBLISHED:dependency");
  await expect(verifyDependencies(database(null), [dependency], [])).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:dependency");
});

test("transfer still rejects an existing product at the wrong revision", async () => {
  await expect(verifyDependencies(database({ id: "upstream", version: 2, hash: "a".repeat(64) }), [dependency], [], { distinguishMissingProduct: true })).rejects.toThrow("PRODUCT_BUNDLE_DEPENDENCY_NEEDS_REVIEW:dependency");
  await expect(verifyDependencies(database({ id: "upstream", version: 1, hash: "a".repeat(64) }), [dependency], [], { distinguishMissingProduct: true })).resolves.toBeUndefined();
});
