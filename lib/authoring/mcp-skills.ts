import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, ListResourcesRequestSchema, McpError, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { z } from "zod";
import { loadSkillCatalog, type SkillCatalogProfile } from "./skill-catalog";

const listSchema = z.object({ method: z.literal("skills/list"), params: z.object({ cursor: z.string().min(1).optional() }).optional() });
const getSchema = z.object({ method: z.literal("skills/get"), params: z.object({ uri: z.string() }) });
const catalogs = new Map<SkillCatalogProfile, ReturnType<typeof loadSkillCatalog>>();

export function registerAuthoringSkills(server: McpServer, profile: SkillCatalogProfile = "chatgpt", root = resolve(process.cwd(), "dist/skills"), environment?: "staging" | "production" | "local"): void {
  server.server.registerCapabilities({ resources: {}, extensions: { "io.modelcontextprotocol/skills": {} } });
  // Load only on skill requests so a missing artifact cannot disable existing authoring tools.
  const catalog = () => {
    if (root !== resolve(process.cwd(), "dist/skills")) return loadSkillCatalog(root, profile);
    let result = catalogs.get(profile);
    if (!result) { result = loadSkillCatalog(root, profile); catalogs.set(profile, result); }
    if (environment && environment !== "local" && result.manifest.source.environment !== environment) throw new Error("Skills artifact environment mismatch");
    return result;
  };
  server.server.setRequestHandler(listSchema, async ({ params }) => {
    const entries = catalog().entries;
    const offset = params?.cursor ? Number(params.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || (params?.cursor && String(offset) !== params.cursor) || (offset > 0 && (offset % 5 !== 0 || offset >= entries.length))) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid skills cursor");
    }
    return { skills: entries.slice(offset, offset + 5), ...(offset + 5 < entries.length ? { nextCursor: String(offset + 5) } : {}) };
  });
  server.server.setRequestHandler(getSchema, async ({ params }) => {
    const skill = catalog().entries.find((entry) => entry.uri === params.uri);
    if (!skill) throw new McpError(ErrorCode.InvalidParams, "Unknown skill URI");
    return { skill };
  });
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [...catalog().resources.values()].map(({ uri, mimeType }) => ({ uri, name: uri.split("/").at(-1)!, mimeType })),
  }));
  server.server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    const content = catalog().resources.get(params.uri);
    if (!content) throw new McpError(ErrorCode.InvalidParams, "Unknown skill resource URI");
    return { contents: [content] };
  });
}
