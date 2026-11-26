import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
import { operationsCatalog } from "@/lib/admin-mcp/operations-catalog";

test("model configuration and billed latency refresh remain explicitly UI-only", () => {
  const entry = operationsCatalog.find(item => item.source === "app/(admin)/admin/ops/models/page.tsx")!;
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.actions).toEqual(["listAiModelSettingsAction", "updateAiModelSettingAction", "resetAiModelSettingAction", "refreshAiModelLatenciesAction"]);
});
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

test("article reading presentation remains browser-only", () => {
  const diktat = operationsCatalog.find(item => item.source === "components/course/material-viewer.tsx")!;
  expect(diktat.status).toBe("excluded");
  expect(diktat.tools).toEqual([]);
  const entry = operationsCatalog.find(item => item.source === "components/course/structured-article-reader.tsx")!;
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.actions).toContain("toggleReadingFocus");
});

test("Expo download and storage recovery stay device-local", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/app/offline.tsx");
  expect(entry?.status).toBe("excluded");
  expect(entry?.tools).toEqual([]);
  expect(entry?.actions).toEqual(["download", "forget", "revalidateSaved", "purgeUnavailable"]);
});

test("device sign-in, role context, photo recovery and OS permissions stay user-scoped", () => {
  for (const source of [
    "app/api/auth/native/expo/exchange/route.ts",
    "app/api/native/context/route.ts",
    "apps/mobile-native/routing/BrowserHandoff.tsx",
    "apps/mobile-native/device/reminder-controller.ts",
    "apps/mobile-native/device/file-controller.ts",
    "apps/mobile-native/device/audio-controller.ts",
    "apps/mobile-native/device/photo-controller.ts",
    "apps/mobile-native/device/notifications-controller.ts",
  ]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
  }
});
