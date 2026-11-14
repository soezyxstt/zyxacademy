import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import {
  BlogServiceError, blogChangesSchema, blogFieldsSchema, blogSearchSchema,
  createBlogArticle, getBlogArticle, getBlogEditContext, inspectBlogChange,
  searchBlogArticles, setBlogPublication, updateBlogArticle,
} from "@/lib/blog/service";
import { adminId, adminRevision, adminToolkit } from "./toolkit";
import { AdminMcpError } from "./mutations";

async function blogOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    if (error instanceof BlogServiceError) throw new AdminMcpError(error.code);
    if (error instanceof Error && error.message === "BLOG_FORBIDDEN") throw new AdminMcpError("BLOG_FORBIDDEN");
    throw error;
  }
}
export function registerBlogTools(server: McpServer, principal: McpPrincipal): void {
  const { read, write } = adminToolkit(server, principal);
  const actorId = principal.actorId;
  const impact = (input: Parameters<typeof inspectBlogChange>[1]) => blogOperation(async () => {
    const inspected = await inspectBlogChange(actorId, input);
    return { ...inspected.impact, normalized: inspected.normalized, ...(inspected.expectedRevision ? { expectedRevision: inspected.expectedRevision } : {}) };
  });
  read("blog.list", "blog:read", blogSearchSchema, "List filtered blog metadata and exact revisions. Use blog.search for continuation metadata.", input => blogOperation(async () => (await searchBlogArticles(actorId, input)).items));
  read("blog.search", "blog:read", blogSearchSchema, "Search blog title or slug before pagination; returns metadata, revisions and continuation without article bodies.", input => blogOperation(() => searchBlogArticles(actorId, input)));
  read("blog.get", "blog:read", z.object({ id: adminId }), "Read a blog article and its exact observed revision.", ({ id }) => blogOperation(() => getBlogArticle(actorId, id)));
  read("blog.get_edit_context", "blog:read", z.object({ id: adminId }), "Read editable content, exact revision, publication visibility and supported workflow. Scheduled publication is not implemented.", ({ id }) => blogOperation(() => getBlogEditContext(actorId, id)));
  const validation = z.object({
    article: blogFieldsSchema.optional(), id: adminId.optional(), expectedRevision: adminRevision.optional(), changes: blogChangesSchema.optional(),
  }).superRefine((value, context) => {
    const creating = value.article !== undefined && value.id === undefined && value.expectedRevision === undefined && value.changes === undefined;
    const editing = value.article === undefined && value.id !== undefined && value.expectedRevision !== undefined;
    if (!creating && !editing) context.addIssue({ code: "custom", path: ["article"], message: "Provide article for a new draft, or id and expectedRevision with optional changes" });
  });
  read("blog.validate", "blog:read", validation, "Normalize a draft or observed edit and inspect metadata, URL and live visibility without saving, fetching media, rendering or spending AI quota. This does not publish or reserve a slug.", input => blogOperation(() => inspectBlogChange(actorId, input)));
  write("blog.create", "blog:write", blogFieldsSchema, "Create a draft blog article. Slug and summary can be derived without AI; readMinutes is server-calculated. Publishing is a separate explicit action.", (tx, article) => blogOperation(() => createBlogArticle(tx, { actorId, article, status: "draft" })), article => impact({ article }));
  write("blog.update", "blog:write", z.object({ id: adminId, expectedRevision: adminRevision, changes: blogChangesSchema }), "Update the observed blog revision. An update to a published article changes live content; inspect the signed plan before committing. Title edits preserve the URL unless slug is explicit.", (tx, input) => blogOperation(() => updateBlogArticle(tx, { actorId, ...input })), input => impact(input));
  write("blog.set_publication", "blog:write", z.object({ id: adminId, expectedRevision: adminRevision, published: z.boolean() }), "Explicitly publish or unpublish the observed blog revision. Inspect its public visibility and URL. This is not a scheduler.", (tx, input) => blogOperation(() => setBlogPublication(tx, { actorId, ...input })), input => impact(input));
}
