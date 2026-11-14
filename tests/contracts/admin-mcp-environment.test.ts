import { afterEach, expect, mock, test } from "bun:test";
import { mcpEnvironmentIdentity, assertMcpTarget } from "@/lib/authoring/mcp-environment";
const keys = ["BETTER_AUTH_URL", "NEXT_PUBLIC_APP_URL", "ZYX_MCP_ENVIRONMENT", "VERCEL_ENV", "BETTER_AUTH_SECRET"] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => { for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; } });
function configure(origin: string, declared?: string) {
  process.env.BETTER_AUTH_URL = origin; delete process.env.NEXT_PUBLIC_APP_URL;
  if (declared) process.env.ZYX_MCP_ENVIRONMENT = declared; else delete process.env.ZYX_MCP_ENVIRONMENT;
}
test("Vercel production tier does not turn the staging application into production", () => {
 configure("https://staging.zyxacademy.com"); process.env.VERCEL_ENV = "production";
 expect(mcpEnvironmentIdentity()).toEqual({ environment: "staging", origin: "https://staging.zyxacademy.com", resource: "https://staging.zyxacademy.com/api/mcp/authoring" });
});
test("contradictory environment configuration fails closed", () => {
 configure("https://www.zyxacademy.com", "staging"); expect(() => mcpEnvironmentIdentity()).toThrow("MCP_ENVIRONMENT_CONFIG_MISMATCH");
 configure("https://staging.zyxacademy.com"); process.env.NEXT_PUBLIC_APP_URL = "https://www.zyxacademy.com";
 expect(() => mcpEnvironmentIdentity()).toThrow("MCP_ENVIRONMENT_CONFIG_MISMATCH");
});
test("unknown origins need an explicit environment; invalid hosted URLs are rejected", () => {
 configure("https://unknown.example.test"); expect(() => mcpEnvironmentIdentity()).toThrow("AUTHORING_MCP_ENVIRONMENT_UNKNOWN");
 configure("http://www.zyxacademy.com"); expect(() => mcpEnvironmentIdentity()).toThrow("MCP_ENVIRONMENT_CONFIG_INVALID");
 configure("https://user:password@staging.zyxacademy.com"); expect(() => mcpEnvironmentIdentity()).toThrow("MCP_ENVIRONMENT_CONFIG_INVALID");
});
test("an explicit target must match both environment and exact origin", () => {
 configure("https://staging.zyxacademy.com");
 expect(() => assertMcpTarget("production", "https://www.zyxacademy.com")).toThrow("MCP_TARGET_ENVIRONMENT_MISMATCH");
 expect(() => assertMcpTarget("staging", "https://other.example.test")).toThrow("MCP_TARGET_ENVIRONMENT_MISMATCH");
 expect(assertMcpTarget("staging", "https://staging.zyxacademy.com").environment).toBe("staging");
});
let effects = 0;
mock.module("@/lib/db", () => ({ db: {} }));
mock.module("@/lib/authoring/mcp-auth", () => ({ MCP_MANUAL_CLIENT_ID: "zyx-admin-connection", requireMcpScope: () => undefined, resolveMcpAdmin: async () => undefined }));
const { adminToolkit } = await import("@/lib/admin-mcp/toolkit");
const { registerOperationsTools } = await import("@/lib/admin-mcp/operations-tools");
const { registerFormsTools } = await import("@/lib/admin-mcp/forms-tools");
const { mutationPlan, verifyMutationPlan } = await import("@/lib/admin-mcp/mutations");
const { z } = await import("zod");
const principal = { userId: "admin", actorId: "admin", sessionId: "session", authMethod: "oauth" as const, scopes: ["forms:write"] };
test("mutation guards reject a different target or missing target before any business effect", async () => {
 configure("https://staging.zyxacademy.com");
 const handlers = new Map<string, (input: Record<string, unknown>) => Promise<any>>();
 const server = { registerResource: () => undefined, registerTool: (name: string, _: unknown, callback: any) => handlers.set(name, callback) } as never;
 adminToolkit(server, principal).write("fixture.write", "forms:write", z.object({}), "Fixture", async () => { effects++; return {}; });
 registerFormsTools(server, principal);
 registerOperationsTools(server, principal);
 adminToolkit(server, principal).read("fixture.read", "forms:write", z.object({}), "Read fixture", async () => { effects++; return {}; });
 for (const name of ["fixture.write", "fixture.read", "forms.create", "forms.list", "courses.list"]) {
  const definition = name === "forms.create" ? { definition: { title: "Test", slug: "test", questions: [{ type: "TEXT", title: "Name" }] } } : {};
  const controls = name.endsWith("write") || name.endsWith("create") ? { requestKey: "environment-guard-test" } : {};
  const missing = await handlers.get(name)!({ ...definition, ...controls });
  expect(missing.structuredContent.error).toBe("INVALID_INPUT");
  const wrong = await handlers.get(name)!({ ...definition, ...controls, expectedEnvironment: "production", expectedOrigin: "https://www.zyxacademy.com" });
  expect(wrong.structuredContent.error).toBe("MCP_TARGET_ENVIRONMENT_MISMATCH");
 }
 expect(effects).toBe(0);
});
test("signed plans cannot cross environments even if signing secrets are equal", () => {
 process.env.BETTER_AUTH_SECRET = "synthetic-environment-bound-signing-secret";
 configure("https://staging.zyxacademy.com");
 const plan = mutationPlan(principal, "forms.create", { id: "same" }, {});
 expect(plan.environment).toBe("staging");
 configure("https://www.zyxacademy.com");
 expect(() => verifyMutationPlan(principal, "forms.create", { id: "same" }, plan.confirmationToken)).toThrow("CONFIRMATION_INVALID");
});
