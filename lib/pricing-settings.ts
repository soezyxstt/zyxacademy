import "server-only";
import { db } from "@/db";
import { pricingSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_PRICING_DISCOUNTS, pricingDiscountsSchema } from "@/lib/pricing-discounts";

export async function getPricingDiscounts() {
  const [row] = await db.select().from(pricingSettings).where(eq(pricingSettings.id, "default")).limit(1);
  return pricingDiscountsSchema.parse(row?.discounts ?? DEFAULT_PRICING_DISCOUNTS);
}
