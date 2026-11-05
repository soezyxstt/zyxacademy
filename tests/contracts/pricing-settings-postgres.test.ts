import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { pricingSettings } from "../../db/schema";
import { DEFAULT_PRICING_DISCOUNTS } from "../../lib/pricing-discounts";

test("PostgreSQL persists both discount schedules atomically in one singleton", async () => {
  const { testDb, client } = await createPostgresTestDb();
  try {
    await testDb.insert(pricingSettings).values({ id: "default", discounts: DEFAULT_PRICING_DISCOUNTS });
    const changed = { ...DEFAULT_PRICING_DISCOUNTS, platform: { ...DEFAULT_PRICING_DISCOUNTS.platform, percent: 15 } };
    await testDb.insert(pricingSettings).values({ id: "default", discounts: changed })
      .onConflictDoUpdate({ target: pricingSettings.id, set: { discounts: changed } });
    const [row] = await testDb.select().from(pricingSettings).where(eq(pricingSettings.id, "default"));
    expect(row.discounts).toEqual(changed);
    expect(row.updatedAt).toBeInstanceOf(Date);
    expect(await testDb.select().from(pricingSettings)).toHaveLength(1);
    await expect(testDb.insert(pricingSettings).values({ id: "another", discounts: changed }).execute()).rejects.toThrow();
  } finally { await client.close(); }
}, 60_000);
