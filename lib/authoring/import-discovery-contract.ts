import { z } from "zod";

const identifier = z.string().trim().min(1).max(256);
const statuses = ["received", "validated", "rejected", "approved", "draft", "published", "withdrawn", "discarding"] as const;
export const importDiscoveryInputSchema = z.object({
  bundleType: z.enum(["source", "idea", "product"]),
  limit: z.number().int().min(1).max(100).default(50),
  responseMode: z.enum(["full", "compact"]).optional(),
  courseId: identifier.optional(), chapterId: identifier.optional(),
  query: z.string().trim().min(1).max(200).optional(),
  statuses: z.array(z.enum(statuses)).min(1).max(statuses.length).optional(),
  headsOnly: z.boolean().optional(),
  cursor: z.string().min(1).max(1024).optional(),
}).strict();
export type ImportDiscoveryInput = z.input<typeof importDiscoveryInputSchema>;
export const compactImportProjectionsSchema = z.array(z.enum(["inventory", "readiness"])).max(2).optional();

export const importDiscoveryContract = {
  listTool: "authoring.list_imports", getTool: "authoring.get_import", responseMode: "compact",
  filters: ["courseId", "chapterId", "query", "statuses", "headsOnly", "cursor"],
  courseId: "Canonical ID or an unambiguous legacy alias; unknown or ambiguous IDs return no matches.",
  headsOnly: "Keeps the current live head and newest editable candidate per revision lineage; omits withdrawn/discarding history.",
  projections: ["inventory", "readiness"],
  inventory: "At most 256 non-dependency entities; truncation is explicit. Use full get_import for complete inventory.",
  readiness: "Compact discovery never evaluates readiness. Only product get_import with projections:[readiness] requests current checks; validationSnapshot is historical.",
  compatibility: "Omitted responseMode keeps the existing full response. Search filters and cursor require compact mode.",
} as const;
