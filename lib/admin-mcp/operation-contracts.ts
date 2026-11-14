import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpPrincipal } from "@/lib/authoring/mcp-auth";
import type { z } from "zod";
import { redactActivationTokens } from "./sensitive-data";

export type AdminOperationDescriptor = {
  name: string;
  domain: string;
  description: string;
  requiredScopes: string[];
  mode: "read" | "mutation";
  protocol: "admin-plan" | "authoring-revision";
  risk: "read" | "reversible_write" | "public_write" | "sensitive";
  requiredInputs: string[];
  conditionalScopes: string[];
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  confirmation: { required: boolean; expiresInSeconds?: number; controls?: string[] };
  retry: { strategy: "read_again" | "same_request_key" | "exact_revision"; receiptTool?: string; unknownProvider?: "reconcile_without_replay" };
};
const operations = new WeakMap<object, Map<string, AdminOperationDescriptor>>();
const sensitive = new Set(["users.set_roles", "users.set_status", "tokens.reveal", "tokens.create", "tokens.revoke", "notifications.send", "adminjobs.reconcile", "meet.end", "forms.responses.get", "forms.responses.list", "forms.responses.export", "forms.responses.export_sheet"]);
const publicWrites = /^(?:blog\.(?:update|set_publication)|links\.(?:update|delete)|shortlinks\.(?:update|delete)|forms\.(?:archive|set_acceptance)|courses\.archive|chapters\.archive|videos\.delete)$/;
const external = new Set(["media.upload", "media.list", "media.get", "meet.create", "meet.end", "notifications.send", "forms.responses.sheet_state", "forms.responses.export_sheet", "generation.start"]);
const destructive = new Set(["users.set_roles", "users.set_status", "tokens.revoke", "notifications.send", "meet.end", "adminjobs.reconcile", "groups.members.remove", "groups.adjust_quota", "groups.set_status", "forms.archive", "forms.set_acceptance", "shortlinks.delete", "links.delete", "courses.archive", "chapters.archive", "videos.delete", "schedules.delete", "forms.presets.delete", "blog.update", "blog.set_publication"]);
const secondary: Record<string, string[]> = { "forms.responses.export_sheet": ["forms:responses:read"], "forms.responses.export": ["forms:responses:read"], "forms.responses.sheet_state": ["forms:responses:read"] };

export function registerOperationDescriptor(server: McpServer, input: { name: string; scope: string | readonly string[]; description: string; schema: z.ZodObject; write?: boolean; protocol?: AdminOperationDescriptor["protocol"] }) {
  const write = input.write === true;
  const protocol = input.protocol ?? "admin-plan";
  const descriptor: AdminOperationDescriptor = {
    name: input.name, domain: input.name.split(".", 1)[0], description: input.description,
    requiredScopes: [...new Set([...(typeof input.scope === "string" ? [input.scope] : input.scope), ...(secondary[input.name] ?? [])])],
    mode: write ? "mutation" : "read", protocol,
    risk: sensitive.has(input.name) ? "sensitive" : !write ? "read" : publicWrites.test(input.name) || protocol === "authoring-revision" && input.name === "authoring.publish_release" ? "public_write" : "reversible_write",
    requiredInputs: Object.entries(input.schema.shape).filter(([, value]) => !(value as z.ZodType).isOptional()).map(([name]) => name).sort(),
    conditionalScopes: input.name === "users.set_roles" ? ["users:roles:admin"] : input.name === "users.get" || input.name === "users.list" ? ["users:pii:read"] : input.name.startsWith("adminjobs.") ? ["originating job operation scope"] : [],
    annotations: { readOnlyHint: !write, destructiveHint: write && (destructive.has(input.name) || input.name === "authoring.publish_release"), idempotentHint: !write || protocol === "admin-plan", openWorldHint: external.has(input.name) },
    confirmation: write && protocol === "admin-plan" ? { required: true, expiresInSeconds: 600, controls: ["dryRun", "requestKey", "confirmationToken"] } : { required: write },
    retry: !write ? { strategy: "read_again" } : protocol === "admin-plan" ? { strategy: "same_request_key", receiptTool: "admin.operation_receipt", ...(external.has(input.name) ? { unknownProvider: "reconcile_without_replay" } : {}) } : { strategy: "exact_revision" },
  };
  let registry = operations.get(server);
  if (!registry) { registry = new Map(); operations.set(server, registry); }
  registry.set(input.name, descriptor);
  return descriptor;
}
export function registeredOperations(server: McpServer): readonly AdminOperationDescriptor[] { return [...(operations.get(server)?.values() ?? [])].sort((a, b) => a.name.localeCompare(b.name)); }
export function registeredOperation(server: McpServer, name: string) { return operations.get(server)?.get(name); }
/** Apply the same operation policy to live results and historical mutation receipts. */
export function sanitizeAdminOperationResult(operation: string, value: unknown, principal: Pick<McpPrincipal, "scopes">): unknown {
  return operation.startsWith("groups.") && !principal.scopes.includes("access:secrets:read") ? redactActivationTokens(value) : value;
}
