import { randomUUID } from "node:crypto";
import { and, asc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { blogArticles } from "@/db/schema";
import { assertAuthoringActor } from "@/lib/auth/authoring-actor";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { assertSafeKey } from "@/lib/storage/keys";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";

export type BlogConnection = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
export type BlogTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type BlogArticle = typeof blogArticles.$inferSelect;
export type BlogRecord = BlogArticle & { revision: string };
export class BlogServiceError extends Error {
  constructor(public readonly code: string) { super(code); }
}
export const blogCategorySchema = z.enum(["tips_kuliah", "pojok_kampus", "fakta_seru", "kegiatan_zyx"]);
const slugSchema = z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const thumbnailSchema = z.string().trim().max(2048).nullable().refine(value => !value || isBlogThumbnail(value), "Use a public media path or a supported HTTPS image origin");
export const blogFieldsSchema = z.object({
  title: z.string().trim().max(500).nullable().optional(),
  slug: slugSchema.optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
  content: z.string().trim().min(1).max(200_000),
  thumbnailUrl: thumbnailSchema.optional(),
  category: blogCategorySchema.optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  // Retained for older clients. This value never controls stored reading time.
  readMinutes: z.number().int().min(1).max(1000).optional(),
}).strict();
export const blogChangesSchema = blogFieldsSchema.partial().strict().refine(value => Object.keys(value).length > 0, "Provide at least one changed field");
export const blogSearchSchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.enum(["draft", "published", "scheduled"]).optional(),
  category: blogCategorySchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(100_000).default(0),
}).strict();
export type BlogFields = z.infer<typeof blogFieldsSchema>;
export type BlogChanges = z.infer<typeof blogChangesSchema>;
type Prepared = Pick<BlogArticle, "title" | "slug" | "summary" | "content" | "thumbnailUrl" | "category" | "tags" | "readMinutes">;
type Publication = "draft" | "published" | "scheduled";

function safePublicStoragePath(path: string): boolean {
  if (!path.startsWith("/api/storage/file/")) return false;
  try {
    const key = decodeURIComponent(path.slice("/api/storage/file/".length));
    assertSafeKey(key);
    return key.startsWith("blog/") || key.startsWith("media/");
  } catch { return false; }
}
function publicRelativeThumbnail(value: string): boolean {
  if (/[\u0000-\u001f\\]/.test(value) || value.startsWith("//")) return false;
  if (!value.startsWith("/") || value.includes("?") || value.includes("#") || /(?:^|\/)\.\.(?:\/|$)/.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\u0000-\u001f\\]/.test(decoded) || decoded.startsWith("//") || /(?:^|\/)\.\.(?:\/|$)/.test(decoded) || /%(?:2e|2f|5c|25)/i.test(decoded)) return false;
  } catch { return false; }
  return safePublicStoragePath(value) || /^\/(?:images|assets)\/[A-Za-z0-9_./%-]+$/.test(value);
}
export function normalizeBlogThumbnail(value: string | null | undefined): string | null {
  const supplied = value?.trim();
  if (!supplied) return null;
  if (publicRelativeThumbnail(supplied)) return supplied;
  try {
    const url = new URL(supplied);
    if (url.username || url.password || /[\u0000-\u001f\\]/.test(supplied)) throw new Error();
    if (url.origin === new URL(resolveAuthBaseUrl()).origin && !url.search && !url.hash && publicRelativeThumbnail(url.pathname)) return url.pathname;
    // These are the external image origins allowed by next.config.ts. Public
    // storage URLs from this deployment become relative paths above instead.
    if (url.protocol === "https:" && !url.port && ["images.unsplash.com", "lh3.googleusercontent.com"].includes(url.hostname)) return url.href;
  } catch { /* Return only the stable domain error below. */ }
  throw new BlogServiceError("BLOG_THUMBNAIL_UNSUPPORTED");
}
export function isBlogThumbnail(value: string): boolean {
  try { normalizeBlogThumbnail(value); return true; }
  catch { return false; }
}
function slugFromTitle(title: string): string {
  return title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180).replace(/-+$/, "") || "artikel";
}
export function normalizeBlogFields(input: BlogFields | BlogChanges, previous?: BlogArticle): Prepared {
  const merged = { ...(previous ?? {}), ...input };
  let content = String(merged.content ?? "").trim();
  const heading = /^#\s+([^\r\n]+)(?:\r?\n|$)/.exec(content);
  const title = (merged.title?.trim() || heading?.[1]?.trim() || "");
  if (!title) throw new BlogServiceError("BLOG_TITLE_REQUIRED");
  // Only a true leading title is redundant. A heading in code or an authored
  // section with a different title stays in the Markdown.
  if (heading && heading[1].trim() === title) content = content.slice(heading[0].length).trim();
  if (!content) throw new BlogServiceError("BLOG_CONTENT_REQUIRED");
  const summary = merged.summary?.trim() || content.slice(0, 150).trim();
  const normalized: Prepared = {
    title, content, summary,
    slug: input.slug ?? previous?.slug ?? slugFromTitle(title),
    thumbnailUrl: normalizeBlogThumbnail(merged.thumbnailUrl),
    category: merged.category ?? "tips_kuliah",
    tags: [...new Set(merged.tags ?? [])],
    readMinutes: Math.max(1, Math.ceil(content.split(/\s+/).length / 200)),
  };
  // Derived titles and inherited metadata obey the same bounds as explicit input.
  blogFieldsSchema.parse(normalized);
  return normalized;
}
export const blogRecord = (row: BlogArticle): BlogRecord => ({ ...row, revision: revisionOf(row) });
async function authorize(connection: BlogConnection, actorId: string, lock = false) {
  await assertAuthoringActor(connection, actorId, { roles: ["admin", "tutor"], lock, error: "BLOG_FORBIDDEN" });
}
async function exactRow(connection: BlogConnection, id: string, expectedRevision?: string, lock = false) {
  const query = connection.select().from(blogArticles).where(eq(blogArticles.id, id)).limit(1);
  const [row] = await (lock ? query.for("update") : query);
  if (!row) throw new BlogServiceError("NOT_FOUND");
  if (expectedRevision !== undefined && (!/^[a-f0-9]{64}$/.test(expectedRevision) || revisionOf(row) !== expectedRevision)) throw new BlogServiceError("REVISION_CONFLICT");
  return row;
}
function requireRevision(revision: string | undefined) {
  if (!revision || !/^[a-f0-9]{64}$/.test(revision)) throw new BlogServiceError("BLOG_REVISION_REQUIRED");
}
async function slugAvailable(connection: BlogConnection, slug: string, exceptId?: string) {
  const [collision] = await connection.select({ id: blogArticles.id }).from(blogArticles).where(and(eq(blogArticles.slug, slug), exceptId ? ne(blogArticles.id, exceptId) : undefined)).limit(1);
  return !collision;
}
async function allocatedSlug(connection: BlogConnection, prepared: Prepared, explicit: boolean, exceptId?: string) {
  if (await slugAvailable(connection, prepared.slug, exceptId)) return prepared.slug;
  if (explicit) throw new BlogServiceError("BLOG_SLUG_CONFLICT");
  for (let suffix = 2; suffix <= 10_000; suffix++) {
    const candidate = `${prepared.slug}-${suffix}`;
    if (await slugAvailable(connection, candidate, exceptId)) return candidate;
  }
  throw new BlogServiceError("BLOG_SLUG_UNAVAILABLE");
}
async function lockWrites(connection: BlogConnection) {
  await connection.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"zyx:blog:mutation"}, 0))`);
}
function publicationState(previous: BlogArticle | undefined, status: Publication | undefined) {
  if (status === "scheduled") throw new BlogServiceError("BLOG_SCHEDULING_UNAVAILABLE");
  const next = status ?? previous?.status ?? "draft";
  if (next === "scheduled") return { status: next, publishedAt: previous?.publishedAt ?? null };
  return { status: next, publishedAt: next === "published" ? previous?.publishedAt ?? new Date() : null };
}
function metadata(row: BlogArticle) {
  const { content: _content, createdById: _createdById, ...value } = blogRecord(row);
  return value;
}

export async function getBlogArticle(actorId: string, id: string, connection: BlogConnection = db) {
  await authorize(connection, actorId);
  return blogRecord(await exactRow(connection, id));
}
export async function searchBlogArticles(actorId: string, raw: z.input<typeof blogSearchSchema>, connection: BlogConnection = db) {
  const input = blogSearchSchema.parse(raw);
  await authorize(connection, actorId);
  const search = input.query?.replace(/[\\%_]/g, value => `\\${value}`);
  const rows = await connection.select().from(blogArticles).where(and(
    input.status ? eq(blogArticles.status, input.status) : undefined,
    input.category ? eq(blogArticles.category, input.category) : undefined,
    search ? or(ilike(blogArticles.title, `%${search}%`), ilike(blogArticles.slug, `%${search}%`)) : undefined,
  )).orderBy(asc(blogArticles.title), asc(blogArticles.id)).limit(input.limit + 1).offset(input.offset);
  const hasMore = rows.length > input.limit;
  return { items: rows.slice(0, input.limit).map(metadata), pagination: { limit: input.limit, offset: input.offset, hasMore, nextOffset: hasMore ? input.offset + input.limit : null }, filters: { query: input.query ?? null, status: input.status ?? null, category: input.category ?? null } };
}
export async function getBlogEditContext(actorId: string, id: string, connection: BlogConnection = db) {
  const article = await getBlogArticle(actorId, id, connection);
  return { article, revision: article.revision, editableFields: ["title", "slug", "summary", "content", "thumbnailUrl", "category", "tags"],
    categories: blogCategorySchema.options,
    capabilities: { scheduling: false, writesRequireObservedRevision: true, validationSpendsAiQuota: false },
    publication: { isPublic: article.status === "published", publicPath: article.status === "published" ? `/blog/${article.slug}` : null },
    nextActions: ["blog.validate", "blog.update", "blog.set_publication"] };
}
export async function inspectBlogChange(actorId: string, input: { article?: BlogFields; id?: string; expectedRevision?: string; changes?: BlogChanges; published?: boolean }, connection: BlogConnection = db) {
  await authorize(connection, actorId);
  const previous = input.id ? await exactRow(connection, input.id, input.expectedRevision) : undefined;
  if (input.id) requireRevision(input.expectedRevision);
  const fields = input.article ? blogFieldsSchema.parse(input.article) : input.changes ? blogChangesSchema.parse(input.changes) : {};
  if (!previous && !input.article) throw new BlogServiceError("BLOG_CONTENT_REQUIRED");
  const normalized = input.published === false && previous ? { title: previous.title, slug: previous.slug, summary: previous.summary, content: previous.content, thumbnailUrl: previous.thumbnailUrl, category: previous.category, tags: previous.tags, readMinutes: previous.readMinutes } : normalizeBlogFields(fields, previous);
  normalized.slug = await allocatedSlug(connection, normalized, Boolean(input.article?.slug || input.changes?.slug || previous), previous?.id);
  const status = input.published === undefined ? previous?.status ?? "draft" : input.published ? "published" : "draft";
  return { valid: true as const, normalized, ...(previous ? { expectedRevision: revisionOf(previous) } : {}), diagnostics: [],
    impact: { articleId: previous?.id ?? null, previousStatus: previous?.status ?? null, status, isPublic: status === "published", changesLiveContent: previous?.status === "published" && (input.changes !== undefined || input.published !== undefined), removesPublicAccess: previous?.status === "published" && input.published === false,
      previousPublicPath: previous?.status === "published" ? `/blog/${previous.slug}` : null,
      publicPath: status === "published" ? `/blog/${normalized.slug}` : null,
      slugChanged: Boolean(previous && previous.slug !== normalized.slug), schedulingSupported: false } };
}
export async function createBlogArticle(connection: BlogTransaction, input: { actorId: string; article: BlogFields; status?: Publication }): Promise<BlogRecord> {
  await authorize(connection, input.actorId, true);
  await lockWrites(connection);
  const parsed = blogFieldsSchema.parse(input.article);
  const values = normalizeBlogFields(parsed);
  values.slug = await allocatedSlug(connection, values, Boolean(parsed.slug));
  const [row] = await connection.insert(blogArticles).values({ ...values, id: randomUUID(), createdById: input.actorId, ...publicationState(undefined, input.status) }).returning();
  return blogRecord(row);
}
export async function updateBlogArticle(connection: BlogTransaction, input: { actorId: string; id: string; expectedRevision: string; changes: BlogChanges; status?: Publication }): Promise<BlogRecord> {
  requireRevision(input.expectedRevision);
  await authorize(connection, input.actorId, true);
  await lockWrites(connection);
  const previous = await exactRow(connection, input.id, input.expectedRevision, true);
  const parsed = blogChangesSchema.parse(input.changes);
  const values = normalizeBlogFields(parsed, previous);
  values.slug = await allocatedSlug(connection, values, true, previous.id);
  const publication = publicationState(previous, input.status);
  const { updatedAt: _updatedAt, ...before } = previous;
  const after = { ...before, ...values, ...publication };
  if (revisionOf(before) === revisionOf(after)) return blogRecord(previous);
  const [row] = await connection.update(blogArticles).set({ ...values, ...publication, updatedAt: new Date() }).where(eq(blogArticles.id, previous.id)).returning();
  return blogRecord(row);
}
export async function setBlogPublication(connection: BlogTransaction, input: { actorId: string; id: string; expectedRevision: string; published: boolean }): Promise<BlogRecord> {
  requireRevision(input.expectedRevision);
  await authorize(connection, input.actorId, true);
  await lockWrites(connection);
  const previous = await exactRow(connection, input.id, input.expectedRevision, true);
  const publication = publicationState(previous, input.published ? "published" : "draft");
  const values = input.published ? normalizeBlogFields({}, previous) : {};
  const { updatedAt: _updatedAt, ...before } = previous;
  if (revisionOf(before) === revisionOf({ ...before, ...values, ...publication })) return blogRecord(previous);
  const [row] = await connection.update(blogArticles).set({ ...values, ...publication, updatedAt: new Date() }).where(eq(blogArticles.id, previous.id)).returning();
  return blogRecord(row);
}
