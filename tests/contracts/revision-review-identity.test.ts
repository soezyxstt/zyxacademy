import { expect, test } from "bun:test";
import { eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

test("revision migrations preserve review ownership and distinguish exact dependency versions", async () => {
  const { client, testDb } = await createPostgresTestDb();
  try {
    await testDb.insert(schema.user).values({ id: "review-admin", name: "Admin", email: "review-admin@example.test", role: "admin" });
    await testDb.insert(schema.pengguna).values({ id: "review-admin" });
    await testDb.insert(schema.imporBundle).values({ id: "review-import", bundleId: "review-bundle", bundleType: "product", checksum: "a".repeat(64), sourceUriOrKey: "memory/review.zip", version: 3, status: "draft", requestedBy: "review-admin" });
    const target = { imporBundleId: "review-import", reviewerId: "review-admin", targetType: "article_section" as const, targetId: "section", status: "approved" as const };
    await testDb.insert(schema.reviewItemBundle).values([
      { ...target, id: "review-a", productId: "article-a" },
      { ...target, id: "review-b", productId: "article-b" },
    ]);
    expect(await testDb.select().from(schema.reviewItemBundle)).toHaveLength(2);
    await expect(Promise.resolve(testDb.insert(schema.reviewItemBundle).values({ ...target, id: "review-duplicate", productId: "article-a" }))).rejects.toMatchObject({ cause: { code: "23505" } });
    const idea = { ...target, id: "review-idea", targetType: "idea" as const, targetId: "idea", productId: null };
    await testDb.insert(schema.reviewItemBundle).values(idea);
    await expect(Promise.resolve(testDb.insert(schema.reviewItemBundle).values({ ...idea, id: "review-idea-duplicate" }))).rejects.toMatchObject({ cause: { code: "23505" } });
    await testDb.insert(schema.reviewItemBundle).values({ ...idea, id: "review-idea-upsert" }).onConflictDoUpdate({
      target: [schema.reviewItemBundle.imporBundleId, schema.reviewItemBundle.reviewerId, schema.reviewItemBundle.targetType, schema.reviewItemBundle.targetId, schema.reviewItemBundle.productId],
      set: { notes: "Confirmed exact Idea decision" },
    });
    const rows = await testDb.select().from(schema.reviewItemBundle).where(isNull(schema.reviewItemBundle.productId));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("review-idea");
    expect(rows[0].notes).toBe("Confirmed exact Idea decision");
    expect(await testDb.select().from(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.targetId, "section"))).toHaveLength(2);
    const dependency = { upstreamEntityType: "idea", upstreamEntityId: "idea", upstreamVersion: 1, upstreamHash: "b".repeat(64), downstreamEntityType: "article", downstreamEntityId: "article", downstreamVersion: 1, downstreamHash: "c".repeat(64), freshness: "UP_TO_DATE" as const };
    await testDb.insert(schema.ketergantunganProduk).values([
      { ...dependency, id: "edge-v1" },
      { ...dependency, id: "edge-v2", downstreamVersion: 2, downstreamHash: "d".repeat(64) },
      { ...dependency, id: "edge-new-idea", upstreamVersion: 2, upstreamHash: "e".repeat(64), downstreamVersion: 2, downstreamHash: "d".repeat(64) },
    ]);
    expect(await testDb.select().from(schema.ketergantunganProduk)).toHaveLength(3);
    await expect(Promise.resolve(testDb.insert(schema.ketergantunganProduk).values({ ...dependency, id: "duplicate-edge" }))).rejects.toMatchObject({ cause: { code: "23505" } });
    expect((await testDb.select().from(schema.ketergantunganProduk).where(eq(schema.ketergantunganProduk.id, "edge-v1")))[0].downstreamHash).toBe(dependency.downstreamHash);
  } finally { await client.close(); }
});
