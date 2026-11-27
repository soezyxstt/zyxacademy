import { and, asc, eq, isNull, max, sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { discountVouchers, importantLinks, pricingSettings } from "@/db/schema";
import { DEFAULT_ICON, isValidHttpUrl, normalizeCategory } from "@/lib/links";
import { pricingDiscountsSchema } from "@/lib/pricing-discounts";
import { ManagementFailure } from "@/packages/native-parity/operations/management-contract";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,180}$/);
const linkFields = z.strictObject({
  title: z.string().trim().min(1).max(500), url: z.string().trim().max(2048).refine(isValidHttpUrl),
  description: z.string().trim().max(2000), category: z.string().trim().max(200), icon: z.string().trim().max(100),
  color: z.string().trim().max(100), isActive: z.boolean(),
});
export const configurationOperations = [
  z.strictObject({ type: z.literal("link.save"), id: id.optional(), fields: linkFields }),
  z.strictObject({ type: z.literal("link.toggle"), id, isActive: z.boolean() }),
  z.strictObject({ type: z.literal("link.move"), id, sortOrder: z.number().int().nonnegative(), direction: z.enum(["up", "down"]) }),
  z.strictObject({ type: z.literal("link.delete"), id }),
  z.strictObject({ type: z.literal("pricing.discounts"), discounts: pricingDiscountsSchema }),
  z.strictObject({ type: z.literal("voucher.create"), voucher: z.strictObject({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/), discountPercent: z.number().int().min(1).max(100), maxQuota: z.number().int().positive(), expiresAt: z.iso.datetime(), description: z.string().trim().max(2000) }) }),
  z.strictObject({ type: z.literal("voucher.toggle"), id, isActive: z.boolean() }),
  z.strictObject({ type: z.literal("voucher.delete"), id }),
] as const;
type ConfigurationAction = z.infer<typeof configurationOperations[number]>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function applyConfiguration(tx: Transaction, actorId: string, action: ConfigurationAction) {
  const updatedAt = new Date();
  switch (action.type) {
    case "link.save": {
      const fields = { ...action.fields, category: normalizeCategory(action.fields.category), description: action.fields.description || null, color: action.fields.color || "neutral", icon: action.fields.icon || DEFAULT_ICON };
      if (action.id) {
        const [link] = await tx.update(importantLinks).set({ ...fields, updatedAt }).where(and(eq(importantLinks.id, action.id), isNull(importantLinks.deletedAt))).returning({ id: importantLinks.id });
        if (!link) throw new ManagementFailure("not-found");
        return link;
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('zyx:native-operations:link-order', 0))`);
      const [last] = await tx.select({ order: max(importantLinks.sortOrder) }).from(importantLinks);
      const [link] = await tx.insert(importantLinks).values({ ...fields, id: crypto.randomUUID(), createdById: actorId, sortOrder: (last?.order ?? 0) + 1 }).returning({ id: importantLinks.id });
      return link;
    }
    case "link.move": {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('zyx:native-operations:link-order', 0))`);
      const links = await tx.select({ id: importantLinks.id, sortOrder: importantLinks.sortOrder }).from(importantLinks).where(isNull(importantLinks.deletedAt)).orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt), asc(importantLinks.id)).for("update");
      const index = links.findIndex(link => link.id === action.id);
      if (index === -1) throw new ManagementFailure("not-found");
      const current = links[index];
      const target = links[index + (action.direction === "up" ? -1 : 1)];
      if (!target || target.sortOrder !== action.sortOrder) throw new ManagementFailure("conflict");
      await tx.update(importantLinks).set({ sortOrder: target.sortOrder, updatedAt }).where(eq(importantLinks.id, current.id));
      await tx.update(importantLinks).set({ sortOrder: current.sortOrder, updatedAt }).where(eq(importantLinks.id, target.id));
      return { id: current.id };
    }
    case "link.toggle":
    case "link.delete": {
      const [link] = await tx.update(importantLinks).set(action.type === "link.toggle" ? { isActive: action.isActive, updatedAt } : { deletedAt: updatedAt, updatedAt }).where(and(eq(importantLinks.id, action.id), isNull(importantLinks.deletedAt))).returning({ id: importantLinks.id });
      if (!link) throw new ManagementFailure("not-found");
      return link;
    }
    case "pricing.discounts": {
      const [item] = await tx.insert(pricingSettings).values({ id: "default", discounts: action.discounts })
        .onConflictDoUpdate({ target: pricingSettings.id, set: { discounts: action.discounts, updatedAt } }).returning({ id: pricingSettings.id });
      return item;
    }
    case "voucher.create": {
      const expiresAt = new Date(action.voucher.expiresAt);
      if (expiresAt <= updatedAt) throw new ManagementFailure("invalid");
      const [voucher] = await tx.insert(discountVouchers).values({ ...action.voucher, id: crypto.randomUUID(), expiresAt, description: action.voucher.description || null }).returning({ id: discountVouchers.id });
      return voucher;
    }
    case "voucher.toggle":
    case "voucher.delete": {
      const [voucher] = action.type === "voucher.toggle"
        ? await tx.update(discountVouchers).set({ isActive: action.isActive, updatedAt }).where(eq(discountVouchers.id, action.id)).returning({ id: discountVouchers.id })
        : await tx.delete(discountVouchers).where(eq(discountVouchers.id, action.id)).returning({ id: discountVouchers.id });
      if (!voucher) throw new ManagementFailure("not-found");
      return voucher;
    }
  }
}
