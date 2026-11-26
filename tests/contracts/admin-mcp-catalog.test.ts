import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { ADMIN_MCP_SCOPES } from "@/lib/admin-mcp/registry";
import { operationsCatalog } from "@/lib/admin-mcp/operations-catalog";

test("Admin PDF viewing uses the interactive Admin session and grants no MCP scope", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic/material-pdf/route.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toEqual(["GET", "HEAD"]);
  expect(entry?.tools).toEqual([]);
});

test("live coding question and grade operations stay in the verified learner experience", () => {
  for (const source of ["app/api/coding/problems/[problemId]/route.ts", "app/api/coding/submissions/route.ts"]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
  }
});

test("native Admin discussion targets and report reads stay in the interactive workspace", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/operations/management/route.ts")!;
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.actions).toEqual(["GET", "POST"]);
});

test("native tutorial booking overrides remain human Admin operations", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic-administration/tutorial-operations/route.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toEqual(["POST"]);
  expect(entry?.tools).toEqual([]);
  expect(entry?.reason).toContain("quota");
});

test("native Admin media file writes keep their interactive authorization and MCP media grants", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/operations/management/media/route.ts")!;
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.actions).toEqual(["POST"]);
  expect(entry.reason).toContain("live Admin account, session");
  expect(entry.reason).toContain("MCP media.list and media.upload");
});

test("native form media and native Sheets exports preserve separate MCP response grants", () => {
  for (const source of ["app/api/native/operations/forms/[formId]/responses/[responseId]/attachment/[index]/route.ts", "app/api/admin/custom-forms/image/route.ts"]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
  }
  const native = operationsCatalog.find(item => item.source === "app/api/native/operations/management/route.ts");
  expect(native?.reason).toContain("observed sheet revision");
  expect(native?.reason).toContain("MCP forms.responses.* scopes");
});

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

test("reader term lookup stays in the signed Student experience", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/student/reading/route.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toEqual(["GET", "POST"]);
  expect(entry?.tools).toEqual([]);
});

test("Student assessment operations are limited to learner app sessions", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/student/assessment/[courseId]/[...segments]/route.ts")!;
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.actions).toContain("submitTryout");
});

test("Expo download and storage recovery stay device-local", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/app/offline.tsx");
  expect(entry?.status).toBe("excluded");
  expect(entry?.tools).toEqual([]);
  expect(entry?.actions).toEqual(["download", "read", "forget", "revalidateSaved", "purgeUnavailable"]);
});

test("device sign-in, role context, photo recovery and OS permissions stay user-scoped", () => {
  for (const source of [
    "app/api/auth/native/complete/route.ts",
    "app/api/auth/native/expo/exchange/route.ts",
    "app/api/native/context/route.ts",
    "apps/mobile-native/routing/BrowserHandoff.tsx",
    "apps/mobile-native/device/reminder-controller.ts",
    "apps/mobile-native/device/file-controller.ts",
    "apps/mobile-native/device/audio-controller.ts",
    "apps/mobile-native/device/photo-controller.ts",
    "apps/mobile-native/device/notifications-controller.ts",
    "apps/mobile-native/features/notification-inbox/staff-device-push.tsx",
  ]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
  }
});

test("staff inbox push opt-in stays an interactive OS action", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/features/notification-inbox/staff-device-push.tsx");
  expect(entry?.actions).toEqual(["requestPermission", "openSettings"]);
  expect(entry?.status).toBe("excluded");
  expect(entry?.tools).toEqual([]);
});

test("live public form writes stay separate from MCP preview and simulation", () => {
  for (const source of ["app/api/forms/[idOrSlug]/route.ts", "app/api/forms/upload/route.ts"]) {
    const entry = operationsCatalog.find(item => item.source === source);
    expect(entry?.status).toBe("excluded");
    expect(entry?.tools).toEqual([]);
    expect(entry?.actions).toContain("POST");
  }
});

test("native academic reads and legacy Diktat PDF keep signed-in UI authorization", () => {
  const native = operationsCatalog.find(item => item.source === "app/api/native/academic-administration/[...resource]/route.ts")!;
  const pdf = operationsCatalog.find(item => item.source === "app/api/admin/bundles/product/[id]/pdf/route.ts")!;
  expect(native.status).toBe("excluded");
  expect(native.actions).toEqual(["GET", "POST", "PATCH"]);
  expect(native.tools).toEqual([]);
  expect(native.reason).toContain("confirmed audience snapshot");
  expect(native.reason).toContain("receipts isolated from MCP jobs");
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

test("native tryout lifecycle and submission use interactive academic authority", () => {
  const admin = operationsCatalog.find(item => item.source === "app/api/native/academic-assessment/[...resource]/route.ts")!;
  const learner = operationsCatalog.find(item => item.source === "app/api/native/student/assessment/[courseId]/[...segments]/route.ts")!;
  expect(admin.status).toBe("excluded");
  expect(admin.tools).toEqual([]);
  expect(admin.reason).toContain("lifecycle saves");
  expect(admin.reason).toContain("original Admin session");
  expect(admin.reason).toContain("retain submitted snapshots");
  expect(learner.status).toBe("excluded");
  expect(learner.tools).toEqual([]);
  expect(learner.reason).toContain("same exam lock");
});

test("native Tutor bank changes require interactive course authority", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic-assessment/[...resource]/route.ts")!;
  expect(entry.actions).toEqual(["GET", "POST", "PATCH", "DELETE"]);
  expect(entry.tools).toEqual([]);
  expect(entry.reason).toContain("an assigned course");
  expect(entry.reason).toContain("Source references remain immutable");
});

test("native course commands reuse administrative projections with session authorization", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic/[...resource]/route.ts")!;
  expect(entry.actions).toEqual(["GET", "POST", "PATCH", "DELETE"]);
  expect(entry.tools).toEqual([]);
  expect(entry.reason).toContain("chapters.*");
  expect(entry.reason).toContain("Chapter reorder");
  expect(entry.reason).toContain("materials.update_metadata");
});

test("native text material preview and manual publication require a course-scoped Admin session", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic-document/[slug]/[materialId]/route.ts")!;
  expect(entry.actions).toEqual(["GET", "PATCH"]);
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.reason).toContain("course and source ownership");
  expect(entry.reason).toContain("same-session receipts");
});

test("native reading progress and formative feedback remain scoped learner interactions", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/student/reading/learning/route.ts")!;
  expect(entry.actions).toEqual(["GET", "POST"]);
  expect(entry.status).toBe("excluded");
  expect(entry.tools).toEqual([]);
  expect(entry.reason).toContain("current published revision");
  expect(entry.reason).toContain("Tutorial PKA still checks registration");
});

test("confirmed native group deletion is independent of MCP token expiry", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic-administration/group-deletion/route.ts")!;
  expect(entry.actions).toEqual(["GET", "POST"]);
  expect(entry.tools).toEqual([]);
  expect(entry.status).toBe("excluded");
  expect(entry.reason).toContain("confirmed impact");
  expect(entry.reason).toContain("MCP tokens.revoke retains expiry");
});

test("tryout essay files require the interactive Tutor session and stay outside MCP", () => {
  const entry = operationsCatalog.find(row => row.source.endsWith("/grading/[submissionId]/attachment/[questionId]/route.ts"));
  expect(entry).toMatchObject({ actions: ["GET"], tools: [], status: "excluded" });
  expect(entry?.reason).toContain("exact stored answer");
  expect(entry?.reason).toContain("upload ownership");
});
