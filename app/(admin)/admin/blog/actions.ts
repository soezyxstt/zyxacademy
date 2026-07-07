"use server";

import { z } from "zod";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

const saveArticleSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Judul tidak boleh kosong"),
  summary: z.string().min(1, "Ringkasan tidak boleh kosong"),
  content: z.string().min(1, "Konten tidak boleh kosong"),
  thumbnailUrl: z.string().optional().nullable(),
  category: z.enum(["tips_kuliah", "pojok_kampus", "fakta_seru", "kegiatan_zyx"]),
  status: z.enum(["draft", "published", "scheduled"]),
  tags: z.array(z.string()).default([]),
});

function calculateReadMinutes(content: string): number {
  const wordCount = content.trim().split(/\s+/).length;
  // Assume average reading speed of 200 words per minute
  return Math.max(1, Math.ceil(wordCount / 200));
}

export async function saveArticle(rawData: any) {
  const { user } = await assertTutorOrAdmin();
  
  const parsed = saveArticleSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }
  const data = parsed.data;

  // Derive readMinutes dynamically
  const readMinutes = calculateReadMinutes(data.content);

  let baseSlug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
    
  let slug = baseSlug || "artikel"; // Fallback aman
  let suffix = 1;
  
  // Tabrakan slug
  while (true) {
    const collision = await db.query.blogArticles.findFirst({
      where: and(
        eq(blogArticles.slug, slug),
        data.id ? ne(blogArticles.id, data.id) : undefined
      )
    });
    if (!collision) break;
    slug = `${baseSlug || "artikel"}-${suffix}`;
    suffix++;
  }

  const isPublished = data.status === "published";
  const now = new Date();

  try {
    if (data.id) {
      // Update existing
      await db.update(blogArticles).set({
        title: data.title,
        slug,
        summary: data.summary,
        content: data.content,
        thumbnailUrl: data.thumbnailUrl || null,
        category: data.category,
        status: data.status,
        tags: data.tags,
        readMinutes,
        updatedAt: now,
        ...(isPublished ? { publishedAt: now } : {}), // Update publishedAt if it is published just now (or keep old logic, here we simplify to set now if published)
      }).where(eq(blogArticles.id, data.id));
    } else {
      // Insert new
      await db.insert(blogArticles).values({
        id: nanoid(),
        title: data.title,
        slug,
        summary: data.summary,
        content: data.content,
        thumbnailUrl: data.thumbnailUrl || null,
        category: data.category,
        status: data.status,
        tags: data.tags,
        readMinutes,
        createdById: user.id,
        createdAt: now,
        updatedAt: now,
        publishedAt: isPublished ? now : null,
      });
    }

    revalidatePath("/blog");
    revalidatePath("/admin/blog");

    return { success: true };
  } catch (error: any) {
    console.error("Failed to save article", error);
    return { success: false, error: "Gagal menyimpan artikel" };
  }
}
