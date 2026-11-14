import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { asc, eq, isNull, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { importantLinks } from "@/db/schema";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import { DEFAULT_ICON, isValidHttpUrl, normalizeCategory } from "@/lib/links";
import { adminId, adminPagination, adminRevision, adminToolkit } from "./toolkit";
import { AdminMcpError, revisionOf } from "./mutations";

const text = z.string().trim().min(1).max(500);
const httpUrl = z.string().trim().max(2048).refine(isValidHttpUrl);
const linkFields = z.object({ title: text, url: httpUrl, description: z.string().trim().max(2000).nullable().optional(), category: z.string().trim().max(200).nullable().optional(), icon: z.string().trim().max(100).optional(), color: z.string().trim().max(100).optional(), isActive: z.boolean().optional() });
const withRevision = <T,>(row: T) => ({ ...row, revision: revisionOf(row) });

export function registerCommunicationsTools(server: McpServer, principal: McpPrincipal): void {
  const { read, write } = adminToolkit(server, principal);
  read("links.list", "links:read", z.object(adminPagination), "List active important links.", async ({ limit, offset }) => (await db.select().from(importantLinks).where(isNull(importantLinks.deletedAt)).orderBy(asc(importantLinks.sortOrder), asc(importantLinks.id)).limit(limit).offset(offset)).map(withRevision));
  read("links.get", "links:read", z.object({ id: adminId }), "Get an important link and its revision.", async ({ id }) => { const [row] = await db.select().from(importantLinks).where(eq(importantLinks.id, id)); if (!row || row.deletedAt) throw new AdminMcpError("NOT_FOUND"); return withRevision(row); });
  write("links.create", "links:write", linkFields, "Create an important link.", async (tx, input) => { const [order] = await tx.select({ value: max(importantLinks.sortOrder) }).from(importantLinks); const [row] = await tx.insert(importantLinks).values({ ...input, category: normalizeCategory(input.category), icon: input.icon || DEFAULT_ICON, color: input.color || "neutral", id: crypto.randomUUID(), sortOrder: (order.value ?? 0) + 1, createdById: principal.actorId }).returning(); return withRevision(row); });
  write("links.update", "links:write", z.object({ id: adminId, expectedRevision: adminRevision, changes: linkFields.partial().strict().refine(v => Object.keys(v).length > 0) }), "Update an important link.", async (tx, { id, expectedRevision, changes }) => { const [old] = await tx.select().from(importantLinks).where(eq(importantLinks.id, id)); if (!old || old.deletedAt) throw new AdminMcpError("NOT_FOUND"); if (revisionOf(old) !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT"); const [row] = await tx.update(importantLinks).set({ ...changes, ...(changes.category !== undefined ? { category: normalizeCategory(changes.category) } : {}), updatedAt: new Date() }).where(eq(importantLinks.id, id)).returning(); return withRevision(row); });
  write("links.delete", "links:write", z.object({ id: adminId, expectedRevision: adminRevision }), "Archive an important link.", async (tx, { id, expectedRevision }) => { const [old] = await tx.select().from(importantLinks).where(eq(importantLinks.id, id)); if (!old || old.deletedAt) throw new AdminMcpError("NOT_FOUND"); if (revisionOf(old) !== expectedRevision) throw new AdminMcpError("REVISION_CONFLICT"); const [row] = await tx.update(importantLinks).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(importantLinks.id, id)).returning(); return withRevision(row); });
}
