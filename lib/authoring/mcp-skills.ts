import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, ListResourcesRequestSchema, McpError, PaginatedRequestSchema, ReadResourceRequestSchema, type Result, type TextResourceContents } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { z } from "zod";
import { loadSkillCatalog, type SkillCatalogProfile } from "./skill-catalog";

const listSchema = PaginatedRequestSchema.extend({ method: z.literal("skills/list") });
const getSchema = ReadResourceRequestSchema.extend({ method: z.literal("skills/get") });
const catalogs = new Map<SkillCatalogProfile, ReturnType<typeof loadSkillCatalog>>();
// The installed SDK predates skills capabilities; validate the extension without weakening its Server type.
const skillsCapabilities = z.object({ resources: z.object({}), extensions: z.object({ "io.modelcontextprotocol/skills": z.object({}) }) }).parse({ resources: {}, extensions: { "io.modelcontextprotocol/skills": {} } });

export function registerAuthoringSkills(server: McpServer, profile: SkillCatalogProfile = "chatgpt", root = resolve(process.cwd(), "dist/skills"), environment?: "staging" | "production" | "local", additionalResources: readonly TextResourceContents[] = []): void {
  server.server.registerCapabilities(skillsCapabilities);
  // Load only on skill requests so a missing artifact cannot disable existing authoring tools.
  const catalog = () => {
    let result = root !== resolve(process.cwd(), "dist/skills") ? loadSkillCatalog(root, profile) : catalogs.get(profile);
    if (!result) { result = loadSkillCatalog(root, profile); catalogs.set(profile, result); }
    if (environment && environment !== "local" && "kind" in result.manifest.source) throw new Error("Local candidate skills cannot be served by a deployed environment");
    if (environment && environment !== "local" && result.manifest.source.environment !== environment) throw new Error("Skills artifact environment mismatch");
    return result;
  };
  server.server.setRequestHandler<typeof listSchema>(listSchema, async ({ params }): Promise<Result> => {
    const entries = catalog().entries;
    const offset = params?.cursor ? Number(params.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || (params?.cursor !== undefined && String(offset) !== params.cursor) || (offset > 0 && (offset % 5 !== 0 || offset >= entries.length))) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid skills cursor");
    }
    return { skills: entries.slice(offset, offset + 5), ...(offset + 5 < entries.length ? { nextCursor: String(offset + 5) } : {}) };
  });
  server.server.setRequestHandler<typeof getSchema>(getSchema, async ({ params }): Promise<Result> => {
    const skill = catalog().entries.find((entry) => entry.uri === params.uri);
    if (!skill) throw new McpError(ErrorCode.InvalidParams, "Unknown skill URI");
    return { skill };
  });
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    let resources: Array<{ uri: string; name: string; mimeType?: string }>;
    try {
      resources = [...catalog().resources.values()].map(({ uri, mimeType }) => ({ uri, name: uri.split("/").at(-1)!, mimeType }));
    } catch (error) {
      // Skills remain fail-closed through skills/list and skills/get. Independent UI resources still work.
      if (!additionalResources.length) throw error;
      resources = [];
    }
    return { resources: [...resources, ...additionalResources.map(({ uri, mimeType }) => ({ uri, name: uri.split("/").at(-1)!, mimeType }))] };
  });
  server.server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    const content = additionalResources.find(resource => resource.uri === params.uri) ?? catalog().resources.get(params.uri);
    if (!content) throw new McpError(ErrorCode.InvalidParams, "Unknown skill resource URI");
    return { contents: [content] };
  });
}
