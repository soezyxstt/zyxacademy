import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
test("every registered and conditional permission is grantable, and tool names are unique", () => {
  const names: string[] = []; const scopes = new Set<string>();
  for (const file of readdirSync("lib/admin-mcp").filter(file => file.endsWith("-tools.ts"))) {
    const source = readFileSync(`lib/admin-mcp/${file}`, "utf8");
    for (const match of source.matchAll(/(?:read|write|register)\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)) { names.push(match[1]); scopes.add(match[2]); }
    for (const match of source.matchAll(/requireMcpScope\(principal,\s*"([^"]+)"/g)) scopes.add(match[1]);
  }
  expect(names.length).toBeGreaterThan(80);
  expect(new Set(names).size).toBe(names.length);
  expect(names.some(name => name.startsWith("pka."))).toBe(false);
  expect(ADMIN_MCP_SCOPES.some(scope => scope.startsWith("pka:"))).toBe(false);
  for (const scope of scopes) expect(ADMIN_MCP_SCOPES).toContain(scope);
  for (const scope of ADMIN_MCP_SCOPES) expect(scopes.has(scope)).toBe(true);
});
