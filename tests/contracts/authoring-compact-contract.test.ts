import { expect, test } from "bun:test";
import { buildPlaybookResponse, RECOMMENDED_PLUGIN_VERSION } from "@/lib/authoring/mcp-playbook";
import { getMcpPlaybook, issueMcpRunToken, readMcpBootstrapToken, workflowContract } from "@/lib/authoring/mcp-workflows";
import { compactContractView } from "@/lib/authoring/contract-response";

const input = { skill: "zyx-product-bundle-mcp" as const, bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION,
  clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: false } };
const actor = { actorId: "compact-reader", sessionId: "compact-session" };
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));

test("compact playbook sends module content once and exact checksum reuse still issues a valid bootstrap", () => {
  const full = getMcpPlaybook({ ...input, ...actor });
  const compact = getMcpPlaybook({ ...input, ...actor, responseMode: "compact" });
  expect(full.instructionsMarkdown).toBeString();
  expect(compact).not.toHaveProperty("instructionsMarkdown");
  expect(compact.modules).toHaveLength(full.modules.length);
  expect(compact.modules.every(mod => "contentStatus" in mod && mod.contentStatus === "included")).toBe(true);
  const knownModuleChecksums = Object.fromEntries(compact.modules.map(mod => [mod.key, mod.checksum]));
  const resumed = getMcpPlaybook({ ...input, ...actor, responseMode: "compact", knownModuleChecksums });
  expect(resumed.modules.every(mod => !("markdown" in mod) && "contentStatus" in mod && mod.contentStatus === "unchanged")).toBe(true);
  const token = readMcpBootstrapToken(resumed.bootstrapToken!);
  expect(token.actorId).toBe(actor.actorId);
  expect(token.sessionId).toBe(actor.sessionId);
  expect(token.playbookChecksum).toBe(resumed.playbookChecksum);
  expect(token.expiresAt).toBeGreaterThan(Date.now());
  expect(bytes(compact)).toBeLessThan(bytes(full) * 0.65);
  expect(bytes(resumed)).toBeLessThan(15_000);
  const changed = getMcpPlaybook({ ...input, ...actor, responseMode: "compact", knownModuleChecksums: { ...knownModuleChecksums, "product/workflow": "0".repeat(64) } });
  expect(changed.modules.filter(mod => "markdown" in mod).map(mod => mod.key)).toEqual(["product/workflow"]);
  console.info(JSON.stringify({ fixture: "current-product-playbook", fullBytes: bytes(full), compactBytes: bytes(compact), cachedBytes: bytes(resumed) }));
});

test("full playbook and contract reject conditional omissions unless compact is explicit", () => {
  expect(() => buildPlaybookResponse({ ...input, knownModuleChecksums: {} })).toThrow("CACHE_REQUIRES_COMPACT");
  const original = { stage: "product", rules: ["retain"], outputs: { productBundle: { pilot: { legacy: true } }, ideaBundle: { legacy: true } } };
  expect(compactContractView(original, {})).toEqual({ rules: original.rules, outputs: original.outputs });
  expect(() => compactContractView(original, { productProfile: "v4" })).toThrow("PROJECTION_REQUIRES_COMPACT");
});

test("compact contract selects the bound stage/profile and skips only the exact cached view", () => {
  const bootstrap = getMcpPlaybook({ ...input, ...actor });
  const runToken = issueMcpRunToken({ workflow: "idea_product", courseId: "course", chapterId: "chapter", bootstrap: readMcpBootstrapToken(bootstrap.bootstrapToken!) });
  const options = { ...actor, bootstrapToken: bootstrap.bootstrapToken! };
  const full = workflowContract(runToken, options);
  const compact = workflowContract(runToken, { ...options, responseMode: "compact", productProfile: "v4" });
  const outputs = compact.outputs as Record<string, Record<string, unknown>>;
  expect(Object.keys(outputs)).toEqual(["productBundle"]);
  expect(outputs.productBundle).not.toHaveProperty("pilot");
  expect(outputs.productBundle).not.toHaveProperty("solutionCollection");
  expect(outputs.productBundle.discovery).toBeDefined();
  expect(full.outputs.ideaBundle).toBeDefined();
  expect(full.outputs.productBundle?.pilot).toBeDefined();
  const cached = workflowContract(runToken, { ...options, responseMode: "compact", productProfile: "v4", knownViewChecksum: compact.viewChecksum });
  expect(cached.contentStatus).toBe("unchanged");
  expect(cached).not.toHaveProperty("outputs");
  expect(cached).not.toHaveProperty("rules");
  expect(cached.runToken).toBeString();
  const v5 = workflowContract(runToken, { ...options, responseMode: "compact", productProfile: "v5", knownViewChecksum: compact.viewChecksum });
  expect(v5.contentStatus).toBe("included");
  expect((v5.outputs as Record<string, unknown>).productBundle).toMatchObject({ schemaVersion: "product-bundle.v5", writeEntityTypes: ["solution_collection"] });
  const v5Product = (v5.outputs as Record<string, Record<string, unknown>>).productBundle;
  expect(v5Product).not.toHaveProperty("verification");
  expect(v5Product.schemaDocuments).toContainEqual(expect.objectContaining({ name: "productDraftInput", path: expect.stringContaining("/product-v4?schema=productDraftInput&sha256="), sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  expect(v5Product.schemaDocuments).toContainEqual(expect.objectContaining({ name: "solutionCollection", path: expect.stringContaining("/product-v5?") }));
  expect(bytes(compact)).toBeLessThan(bytes(full));
  expect(bytes(cached)).toBeLessThan(8_000);
  expect(() => workflowContract(runToken, { ...options, actorId: "another-actor", responseMode: "compact", knownViewChecksum: compact.viewChecksum })).toThrow("PRINCIPAL_MISMATCH");
  console.info(JSON.stringify({ fixture: "current-product-contract", fullBytes: bytes(full), compactV4Bytes: bytes(compact), cachedBytes: bytes(cached) }));
});
