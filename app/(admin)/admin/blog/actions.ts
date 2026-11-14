"use server";

import { z } from "zod";
import { db } from "@/db";
import { assertTutorOrAdmin } from "@/lib/auth/admin-guards";
import { revalidatePath } from "next/cache";
import { generateContentWithFallback } from "@/lib/gemini";
import { BlogServiceError, blogFieldsSchema, createBlogArticle, getBlogArticle, normalizeBlogFields, updateBlogArticle } from "@/lib/blog/service";

const saveArticleSchema = blogFieldsSchema.extend({
  id: z.string().optional(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  status: z.enum(["draft", "published", "scheduled"]),
}).strict();
const messages: Record<string, string> = {
  BLOG_TITLE_REQUIRED: "Isi judul atau awali konten dengan heading judul.",
  BLOG_CONTENT_REQUIRED: "Isi artikel tidak boleh kosong.",
  BLOG_REVISION_REQUIRED: "Muat ulang artikel sebelum menyimpan. Salin perubahan lokal terlebih dahulu.",
  REVISION_CONFLICT: "Artikel telah berubah. Salin perubahan lokal, lalu muat ulang sebelum menyimpan.",
  BLOG_SLUG_CONFLICT: "Alamat artikel sudah dipakai. Pilih alamat lain atau muat ulang artikel.",
  BLOG_THUMBNAIL_UNSUPPORTED: "Gunakan gambar dari pustaka media atau sumber gambar yang didukung.",
  BLOG_SCHEDULING_UNAVAILABLE: "Publikasi terjadwal belum tersedia. Simpan sebagai draf atau pilih terbit.",
  BLOG_FORBIDDEN: "Akses untuk menyimpan artikel tidak tersedia.",
  NOT_FOUND: "Artikel tidak ditemukan.",
};

export async function saveArticle(rawData: unknown) {
  const { user } = await assertTutorOrAdmin();
  try {
    const { id, expectedRevision, status, ...article } = saveArticleSchema.parse(rawData);
    let oldSlug: string | undefined;
    if (id) {
      if (!expectedRevision) throw new BlogServiceError("BLOG_REVISION_REQUIRED");
      const previous = await getBlogArticle(user.id, id);
      if (previous.revision !== expectedRevision) throw new BlogServiceError("REVISION_CONFLICT");
      oldSlug = previous.slug;
    }
    if (status === "scheduled") throw new BlogServiceError("BLOG_SCHEDULING_UNAVAILABLE");
    const prepared = normalizeBlogFields(article);
    // Keep the existing Admin summary-generation boundary. MCP normalization
    // never calls a provider and never spends this quota implicitly.
    if (!article.summary?.trim()) {
      try {
        const generated = await generateContentWithFallback({
          userId: user.id, feature: "blog-summary", useCase: "chapter-summary",
          contents: `Tolong buatkan ringkasan untuk artikel berikut:\n\n${prepared.content}`,
          config: { temperature: 0.3, maxOutputTokens: 100, systemInstruction: { parts: [{ text: "Tulis ringkasan artikel Zyx Academy maksimal 2 kalimat dalam bahasa Indonesia yang komunikatif. Gunakan sentence case. Hindari tanda seru, tanda hubung panjang, dan filler. Kembalikan ringkasan saja." }] } },
        });
        const summary = generated.response.text?.trim().replace(/[\u2013\u2014]/g, ", ").replace(/!/g, ".").replace(/\bZYX\b/gi, "Zyx");
        if (summary) prepared.summary = summary.slice(0, 2000);
      } catch {
        // Deterministic prepared.summary remains available without provider data.
      }
    }
    const result = await db.transaction(async tx => id
      ? updateBlogArticle(tx, { actorId: user.id, id, expectedRevision: expectedRevision!, changes: { ...article, content: prepared.content, title: prepared.title, summary: prepared.summary }, status })
      : createBlogArticle(tx, { actorId: user.id, article: { ...article, content: prepared.content, title: prepared.title, summary: prepared.summary }, status }));
    revalidatePath("/blog");
    revalidatePath("/admin/blog");
    revalidatePath(`/blog/${result.slug}`);
    if (oldSlug && oldSlug !== result.slug) revalidatePath(`/blog/${oldSlug}`);
    return { success: true as const, id: result.id, revision: result.revision, slug: result.slug, status: result.status };
  } catch (error) {
    const code = error instanceof BlogServiceError ? error.code : error instanceof Error && error.message === "BLOG_FORBIDDEN" ? "BLOG_FORBIDDEN" : "BLOG_SAVE_FAILED";
    return { success: false as const, code, error: error instanceof z.ZodError ? "Periksa judul, kategori, isi, dan alamat gambar artikel." : messages[code] ?? "Artikel belum tersimpan. Periksa akses dan coba lagi." };
  }
}
