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

test("native academic reads and legacy Diktat PDF keep signed-in UI authorization", () => {
  const native = operationsCatalog.find(item => item.source === "app/api/native/academic-administration/[...resource]/route.ts")!;
  const pdf = operationsCatalog.find(item => item.source === "app/api/admin/bundles/product/[id]/pdf/route.ts")!;
  expect(native.status).toBe("excluded");
  expect(native.actions).toEqual(["GET", "POST", "PATCH"]);
  expect(native.tools).toEqual([]);
  expect(pdf.status).toBe("excluded");
  expect(pdf.actions).toEqual(["GET", "POST"]);
  expect(pdf.tools).toEqual([]);
});

test("native academic transports use interactive sessions", () => {
  for (const source of [
    "app/api/native/academic/[...resource]/route.ts",
    "app/api/native/academic/tutor-support/[...resource]/route.ts",
    "app/api/native/academic-assessment/[...resource]/route.ts",
  ]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
  }
});

test("native course commands reuse administrative projections with session authorization", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic/[...resource]/route.ts")!;
  expect(entry.actions).toEqual(["GET", "POST", "PATCH"]);
  expect(entry.tools).toEqual([]);
  expect(entry.reason).toContain("chapters.create");
  expect(entry.reason).toContain("chapters.update");
  expect(entry.reason).toContain("materials.update_metadata");
});
