import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { importantLinks } from "@/db/schema";
import type { PublicLink } from "@/packages/public-links/directory";

export async function listPublicLinks(): Promise<PublicLink[]> {
  return db
    .select({
      id: importantLinks.id,
      title: importantLinks.title,
      url: importantLinks.url,
      description: importantLinks.description,
      icon: importantLinks.icon,
      category: importantLinks.category,
      color: importantLinks.color,
    })
    .from(importantLinks)
    .where(
      and(
        eq(importantLinks.isActive, true),
        isNull(importantLinks.deletedAt)
      )
    )
    .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));
}
