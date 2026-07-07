"use server";

import { z } from "zod";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { assertTutorOrAdmin } from "@/lib/uploadthing-admin";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { generateContentWithFallback } from "@/lib/gemini";

const saveArticleSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
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

  let content = data.content.trim();
  let title = data.title?.trim() || "";

  // Extract title from the first heading (# Title) in the markdown content if available
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    if (!title) {
      title = headingMatch[1].trim();
    }
    // Remove the heading line to avoid duplication on the reader page
    content = content.replace(/^#\s+.+$/m, "").trim();
  }

  if (!title) {
    return { 
      success: false, 
      error: "Judul tidak boleh kosong. Tulis judul pada kolom input atau gunakan heading H1 (`# Judul`) di baris pertama konten." 
    };
  }

  // Derive readMinutes dynamically
  const readMinutes = calculateReadMinutes(content);

  // Generate summary using Gemini key pool if left blank
  let summary = data.summary?.trim() || "";
  if (!summary) {
    const systemPrompt = `Anda adalah editor konten profesional untuk Zyx Academy. 
Tugas Anda adalah menulis ringkasan (summary) yang menarik, singkat (maksimal 2 kalimat), dan langsung pada sasaran (on point) berdasarkan artikel blog yang diberikan.

Patuhi aturan penulisan berikut dengan ketat:
1. Gunakan bahasa Indonesia yang santai, komunikatif, dan sesuai dengan target pembaca (mahasiswa/pelajar).
2. Tulis dalam bentuk kalimat utuh menggunakan format "sentence case".
3. JANGAN PERNAH menggunakan tanda hubung panjang em-dash (—) maupun en-dash (–). Gunakan tanda koma (,), titik (.), atau titik koma (;) sebagai gantinya.
4. JANGAN gunakan tanda seru (!). Gunakan titik (.) saja.
5. JANGAN gunakan kata-kata pengisi (filler) yang tidak penting.
6. Nama brand selalu ditulis sebagai "Zyx" (huruf Z kapital, diikuti yx kecil). Jangan gunakan "ZYX".

Hanya kembalikan teks ringkasan itu sendiri tanpa tambahan penjelasan, kutipan, atau format lainnya.`;

    try {
      const response = await generateContentWithFallback({
        useCase: "chapter-summary",
        contents: `Tolong buatkan ringkasan untuk artikel berikut:\n\n${content}`,
        config: {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          temperature: 0.3,
          maxOutputTokens: 100,
        },
      });
      summary = response.response.text?.trim() || "";
      
      // Post-processing sanitization for safety
      summary = summary
        .replace(/[—–]/g, ", ")
        .replace(/!/g, ".")
        .replace(/\bZYX\b/gi, "Zyx");
    } catch (geminiError) {
      console.error("Gemini failed to generate summary, using fallback", geminiError);
      // Fallback: take first 150 chars of content
      summary = content.substring(0, 150).trim() + "...";
    }
  }

  // If still empty fallback
  if (!summary) {
    summary = content.substring(0, 150).trim() + "...";
  }

  let baseSlug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
    
  let slug = baseSlug || "artikel";
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
        title,
        slug,
        summary,
        content,
        thumbnailUrl: data.thumbnailUrl || null,
        category: data.category,
        status: data.status,
        tags: data.tags,
        readMinutes,
        updatedAt: now,
        ...(isPublished ? { publishedAt: now } : {}),
      }).where(eq(blogArticles.id, data.id));
    } else {
      // Insert new
      await db.insert(blogArticles).values({
        id: nanoid(),
        title,
        slug,
        summary,
        content,
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
