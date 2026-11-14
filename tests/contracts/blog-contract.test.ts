import { expect, test } from "bun:test";
import { blogFieldsSchema, isBlogThumbnail, normalizeBlogFields, normalizeBlogThumbnail, type BlogArticle } from "@/lib/blog/service";

test("normalization removes only a genuine leading title and never a heading inside code", () => {
  const normalized = normalizeBlogFields({ content: "# Belajar efektif\n\nTinjau konsep dan periksa hasilnya." });
  expect(normalized.title).toBe("Belajar efektif");
  expect(normalized.content).toBe("Tinjau konsep dan periksa hasilnya.");
  expect(normalized.summary).toBe(normalized.content);
  const code = "```markdown\n# Contoh heading\n```\n\nPenjelasan.";
  expect(normalizeBlogFields({ title: "Sintaks Markdown", content: code }).content).toBe(code);
  expect(normalizeBlogFields({ title: "Judul artikel", content: "# Bagian isi\n\nPenjelasan." }).content).toStartWith("# Bagian isi");
  expect(() => normalizeBlogFields({ content: "# Judul saja" })).toThrow("BLOG_CONTENT_REQUIRED");
  expect(() => normalizeBlogFields({ content: `# ${"a".repeat(501)}\n\nIsi artikel.` })).toThrow();
});

test("server derives reading time, deduplicates tags and keeps a stored slug across title changes", () => {
  const original = { id: "article", title: "Judul lama", slug: "alamat-tetap", summary: "Ringkas", content: "Isi awal", thumbnailUrl: null, category: "tips_kuliah", tags: [], status: "draft", readMinutes: 1, createdById: "admin", createdAt: new Date(0), updatedAt: new Date(0), publishedAt: null } satisfies BlogArticle;
  const changed = normalizeBlogFields({ title: "Judul baru", content: Array(401).fill("kata").join(" "), readMinutes: 999, tags: ["belajar", "belajar", "kampus"] }, original);
  expect(changed.slug).toBe("alamat-tetap");
  expect(changed.readMinutes).toBe(3);
  expect(changed.tags).toEqual(["belajar", "kampus"]);
});

test("thumbnails reject active and private-storage references while accepting public media", () => {
  for (const url of ["javascript:alert(1)", "data:image/png;base64,AA==", "//example.test/a.png", "/api/storage/file/overhaul/idea-bundles/private.zip", "/api/storage/file/media/../private.png", "/images/%2e%2e/private.png", "https://example.test/api/storage/file/overhaul/private.png", "https://example.test/hero.png", "http://images.unsplash.com/hero.png", "https://images.unsplash.com:8443/hero.png"]) {
    expect(isBlogThumbnail(url)).toBe(false);
    expect(() => blogFieldsSchema.parse({ title: "Judul", content: "Isi artikel", thumbnailUrl: url })).toThrow();
  }
  for (const url of ["https://images.unsplash.com/image.png", "https://lh3.googleusercontent.com/image.png", "/api/storage/file/blog/hero.png", "/api/storage/file/media/posts/hero.png", "/images/hero.png"]) expect(isBlogThumbnail(url)).toBe(true);
  expect(() => blogFieldsSchema.parse({ title: "Judul", content: "Isi", status: "published" })).toThrow();
});

test("an own-origin media URL becomes a relative path accepted by the public image renderer", () => {
  const origin = new URL(process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").origin;
  const path = "/api/storage/file/media/blog/cover%20image.png";
  expect(normalizeBlogThumbnail(`${origin}${path}`)).toBe(path);
  expect(normalizeBlogFields({ title: "Judul", content: "Isi", thumbnailUrl: `${origin}${path}` }).thumbnailUrl).toBe(path);
  expect(() => normalizeBlogThumbnail("https://example.test/unsupported.png")).toThrow("BLOG_THUMBNAIL_UNSUPPORTED");
});
