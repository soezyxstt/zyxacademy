import { describe, expect, it, mock } from "bun:test";
import { createHmac } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
mock.module("server-only", () => ({}));
const { createAuthoringMcpServer } = await import("@/lib/authoring/mcp-server");
import {
  AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
  RECOMMENDED_PLUGIN_VERSION,
  AUTHORING_MCP_SKILLS,
  AUTHORING_PLAYBOOK_MODULE_KEYS,
  AUTHORING_PLAYBOOK_STAGES,
  buildPlaybookResponse,
  evaluatePlaybookCompatibility,
  listAllPlaybookModules,
} from "@/lib/authoring/mcp-playbook";
import {
  computeAuthoringContractDigest,
  authoringContractSnapshot,
  getMcpPlaybook,
  issueMcpBootstrapToken,
  issueMcpRunToken,
  publicMcpRun,
  readMcpBootstrapToken,
  readMcpRunToken,
  verifyMcpExecutionBootstrap,
  workflowContract,
} from "@/lib/authoring/mcp-workflows";

const testPrincipal = {
  userId: "test-admin",
  actorId: "test-admin",
  sessionId: "test-session",
  scopes: ["authoring:read", "authoring:stage", "authoring:review", "authoring:withdraw"],
  authMethod: "session" as const,
};

const fullCapabilities = {
  independentSubagents: true,
  localArtifactFiles: true,
  pdfRendering: false,
};

async function callMcpTool(
  principal: typeof testPrincipal,
  name: string,
  args: Record<string, unknown>,
) {
  const server = createAuthoringMcpServer(principal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(
    new Request("http://localhost/api/mcp/authoring", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
      structuredContent?: Record<string, any>;
    };
  };
}

describe("authoring MCP playbook registry and checksum determinism (CP1)", () => {
  it("loads all 15 canonical playbook modules with non-empty LF-normalized content and 64-char SHA-256 checksums", () => {
    const modules = listAllPlaybookModules();
    expect(modules).toHaveLength(15);
    expect(modules.map((m) => m.key)).toEqual([...AUTHORING_PLAYBOOK_MODULE_KEYS]);
    for (const mod of modules) {
      expect(mod.markdown.length).toBeGreaterThan(200);
      expect(mod.markdown.includes("\r\n")).toBe(false);
      expect(mod.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(mod.revision).toBe(`pb-mod-${mod.checksum.slice(0, 12)}`);
    }
  });

  it("computes deterministic stage manifests across all 6 skills and all stages", () => {
    for (const skill of AUTHORING_MCP_SKILLS) {
      const stageA = buildPlaybookResponse({ skill });
      const stageB = buildPlaybookResponse({ skill });
      expect(stageA.playbookChecksum).toBe(stageB.playbookChecksum);
      expect(stageA.playbookRevision).toBe(stageB.playbookRevision);
      expect(stageA.modules.length).toBeGreaterThanOrEqual(2);
      expect(stageA.instructionsMarkdown).toContain("# Zyx Authoring Playbook");
    }

    for (const stage of AUTHORING_PLAYBOOK_STAGES) {
      const manifest = buildPlaybookResponse({ stage });
      expect(manifest.stage).toBe(stage);
      expect(manifest.playbookChecksum).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("computes a deterministic contract revision and checksum", () => {
    const digestA = computeAuthoringContractDigest();
    const digestB = computeAuthoringContractDigest();
    expect(digestA).toEqual(digestB);
    expect(digestA.contractChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(digestA.contractRevision).toBe(`contract-v1-${digestA.contractChecksum.slice(0, 12)}`);
  });
});

describe("authoring MCP bootstrap token, compatibility matrix, and drift checks (CP2)", () => {
  it("rejects mixed stage guides and stale progressive module fetches", () => {
    expect(() => buildPlaybookResponse({ skill: "zyx-product-bundle-mcp", stage: "source" })).toThrow("STAGE_MISMATCH");
    expect(() => buildPlaybookResponse({ stage: "product", modules: ["reference/workflow"] })).toThrow("MODULE_OUT_OF_STAGE");
    expect(() => buildPlaybookResponse({ stage: "product", expectedPlaybookRevision: "old-revision" })).toThrow("PLAYBOOK_STALE");
  });
  it("evaluates protocol, version, and capability compatibility accurately", () => {
    const okStatus = evaluatePlaybookCompatibility({
      bootstrapProtocol: AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      stage: "product",
      clientCapabilities: fullCapabilities,
    });
    expect(okStatus.status).toBe("compatible");
    expect(evaluatePlaybookCompatibility({ stage: "common", pluginVersion: "0.3.0" }).status).toBe("warning");

    const olderCompatible = evaluatePlaybookCompatibility({
      bootstrapProtocol: AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
      pluginVersion: "0.2.0",
      stage: "idea",
      clientCapabilities: fullCapabilities,
    });
    expect(olderCompatible.status).toBe("warning");
    expect(olderCompatible.code).toBe("AUTHORING_MCP_PLUGIN_OUTDATED");

    const unsupportedProtocol = evaluatePlaybookCompatibility({
      bootstrapProtocol: 99,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      stage: "idea",
      clientCapabilities: fullCapabilities,
    });
    expect(unsupportedProtocol.status).toBe("incompatible");
    expect(unsupportedProtocol.code).toBe("AUTHORING_MCP_BOOTSTRAP_PROTOCOL_UNSUPPORTED");

    const missingSubagents = evaluatePlaybookCompatibility({
      bootstrapProtocol: AUTHORING_MCP_BOOTSTRAP_PROTOCOL,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      stage: "product",
      clientCapabilities: { ...fullCapabilities, independentSubagents: false },
    });
    expect(missingSubagents.status).toBe("incompatible");
    expect(missingSubagents.code).toBe("AUTHORING_MCP_CAPABILITY_MISSING");
  });

  it("serves workflow.get_playbook over MCP with markdown content and signed bootstrapToken", async () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const body = await callMcpTool(testPrincipal, "workflow.get_playbook", {
      skill: "zyx-product-bundle-mcp",
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: fullCapabilities,
    });
    expect(body.result?.isError).toBeUndefined();
    const structured = body.result?.structuredContent;
    expect(structured?.ok).toBe(true);
    expect(structured?.stage).toBe("product");
    expect(structured?.compatibility?.status).toBe("compatible");
    expect(typeof structured?.bootstrapToken).toBe("string");
    expect(structured?.modules?.map((m: any) => m.key)).toEqual([
      "common/execution",
      "product/workflow",
      "product/editorial",
      "product/quality-rubric",
      "product/flashcards",
      "product/derivation-audit",
    ]);
    const textBlocks = body.result?.content?.filter((c) => c.type === "text") ?? [];
    expect(textBlocks).toHaveLength(1);
    const textPayload = JSON.parse(textBlocks[0].text!);
    expect(textPayload).toEqual(structured);
    expect(textPayload.instructionsMarkdown).toContain("## Module: product/editorial");
    expect(readMcpBootstrapToken(textPayload.bootstrapToken).stage).toBe("product");
  });

  it("delivers URL-only bootstrap metadata and a usable token without structuredContent", async () => {
    const body = await callMcpTool(testPrincipal, "workflow.get_playbook", { stage: "common", bootstrapProtocol: 1 });
    expect(body.result?.content).toHaveLength(1);
    const payload = JSON.parse(body.result!.content![0].text!);
    expect(payload).toEqual(body.result?.structuredContent);
    expect(payload.environment).toBeString();
    expect(payload.serverRevision).toBeString();
    expect(payload.contractRevision).toStartWith("contract-v1-");
    expect(payload.compatibility.code).toBe("AUTHORING_MCP_PLUGIN_OUTDATED");
    expect(readMcpBootstrapToken(payload.bootstrapToken).stage).toBe("common");
  });

  it("blocks workflow.get_playbook for product stage when independentSubagents is false", async () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const body = await callMcpTool(testPrincipal, "workflow.get_playbook", {
      skill: "zyx-product-bundle-mcp",
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: { ...fullCapabilities, independentSubagents: false },
    });
    expect(body.result?.isError).toBe(true);
    expect(body.result?.structuredContent?.ok).toBe(false);
    expect(body.result?.structuredContent?.compatibility?.code).toBe("AUTHORING_MCP_CAPABILITY_MISSING");
    expect(body.result?.structuredContent?.bootstrapToken).toBeNull();
    expect(body.result?.content).toHaveLength(1);
    expect(JSON.parse(body.result!.content![0].text!)).toEqual(body.result?.structuredContent);
  });

  it("binds bootstrap context into runToken and verifies matching principal, environment, and revisions", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const playbook = getMcpPlaybook({
      actorId: testPrincipal.actorId,
      skill: "zyx-idea-bundle-mcp",
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: fullCapabilities,
    });
    expect(playbook.bootstrapToken).toBeTruthy();
    const parsedBootstrap = readMcpBootstrapToken(playbook.bootstrapToken!);
    expect(parsedBootstrap.actorId).toBe(testPrincipal.actorId);
    expect(parsedBootstrap.stage).toBe("idea");

    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...bootstrapContext } = parsedBootstrap;

    const runToken = issueMcpRunToken({
      workflow: "idea_product",
      courseId: "course-1",
      courseLabel: "Kalkulus",
      chapterId: "chapter-1",
      chapterLabel: "Bab 1",
      sourcePackImportId: "import-1",
      sourcePackChecksum: "a".repeat(64),
      sourcePackId: "pack-1",
      sourcePackName: "Pack 1",
      bootstrap: bootstrapContext,
    });

    const publicRun = publicMcpRun(runToken);
    expect(publicRun.bootstrap).toMatchObject({
      skill: "zyx-idea-bundle-mcp",
      stage: "idea",
      playbookRevision: playbook.playbookRevision,
      contractRevision: playbook.contractRevision,
    });
    expect(publicRun.compatibility.mode).toBe("verified");
    expect(publicRun.compatibility.playbookFresh).toBe(true);
    expect(publicRun.compatibility.contractFresh).toBe(true);

    const contract = workflowContract(runToken, {
      actorId: testPrincipal.actorId,
      bootstrapToken: playbook.bootstrapToken!,
    });
    expect(contract.contractRevision).toBe(playbook.contractRevision);
    expect(contract.contractChecksum).toBe(playbook.contractChecksum);
    expect(contract.compatibility.mode).toBe("verified");
    expect(contract.compatibility.status).toBe("compatible");
  });

  it("detects principal mismatch, environment mismatch, playbook drift, and contract drift", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const playbook = getMcpPlaybook({
      actorId: testPrincipal.actorId,
      skill: "zyx-idea-bundle-mcp",
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: fullCapabilities,
    });

    expect(() =>
      verifyMcpExecutionBootstrap({
        actorId: "different-admin",
        bootstrapToken: playbook.bootstrapToken!,
        requiredStage: "idea",
      }),
    ).toThrow("AUTHORING_MCP_BOOTSTRAP_PRINCIPAL_MISMATCH");

    const wrongEnvToken = issueMcpBootstrapToken({
      actorId: testPrincipal.actorId,
      skill: "zyx-idea-bundle-mcp",
      stage: "idea",
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      bootstrapProtocol: 1,
      environment: "production",
      playbookRevision: playbook.playbookRevision,
      playbookChecksum: playbook.playbookChecksum,
      contractRevision: playbook.contractRevision,
      contractChecksum: playbook.contractChecksum,
      clientCapabilities: fullCapabilities,
    });
    expect(() =>
      verifyMcpExecutionBootstrap({
        actorId: testPrincipal.actorId,
        bootstrapToken: wrongEnvToken,
        requiredStage: "idea",
      }),
    ).toThrow("AUTHORING_MCP_BOOTSTRAP_ENVIRONMENT_MISMATCH");

    const stalePlaybookToken = issueMcpBootstrapToken({
      actorId: testPrincipal.actorId,
      skill: "zyx-idea-bundle-mcp",
      stage: "idea",
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      bootstrapProtocol: 1,
      environment: playbook.environment,
      playbookRevision: "pb-v1-idea-000000000000",
      playbookChecksum: "0".repeat(64),
      contractRevision: playbook.contractRevision,
      contractChecksum: playbook.contractChecksum,
      clientCapabilities: fullCapabilities,
    });
    expect(() =>
      verifyMcpExecutionBootstrap({
        actorId: testPrincipal.actorId,
        bootstrapToken: stalePlaybookToken,
        requiredStage: "idea",
      }),
    ).toThrow("AUTHORING_MCP_PLAYBOOK_STALE");

    const staleContractToken = issueMcpBootstrapToken({
      actorId: testPrincipal.actorId,
      skill: "zyx-idea-bundle-mcp",
      stage: "idea",
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      bootstrapProtocol: 1,
      environment: playbook.environment,
      playbookRevision: playbook.playbookRevision,
      playbookChecksum: playbook.playbookChecksum,
      contractRevision: "mc-v1-000000000000",
      contractChecksum: "0".repeat(64),
      clientCapabilities: fullCapabilities,
    });
    expect(() =>
      verifyMcpExecutionBootstrap({
        actorId: testPrincipal.actorId,
        bootstrapToken: staleContractToken,
        requiredStage: "idea",
      }),
    ).toThrow("AUTHORING_MCP_CONTRACT_STALE");
  });

  it("allows stage transition from idea run to product validation when a fresh product bootstrapToken is provided", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const ideaPlaybook = getMcpPlaybook({
      actorId: testPrincipal.actorId,
      skill: "zyx-authoring-pipeline",
      stage: "idea",
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: fullCapabilities,
    });
    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...ideaBootstrap } = readMcpBootstrapToken(
      ideaPlaybook.bootstrapToken!,
    );
    const runToken = issueMcpRunToken({
      workflow: "idea_product",
      courseId: "course-1",
      courseLabel: "Kalkulus",
      chapterId: "chapter-1",
      chapterLabel: "Bab 1",
      sourcePackImportId: "import-1",
      sourcePackChecksum: "a".repeat(64),
      sourcePackId: "pack-1",
      sourcePackName: "Pack 1",
      bootstrap: ideaBootstrap,
    });
    const run = readMcpRunToken(runToken);

    const productPlaybook = getMcpPlaybook({
      actorId: testPrincipal.actorId,
      skill: "zyx-authoring-pipeline",
      stage: "product",
      runToken,
      bootstrapProtocol: 1,
      pluginVersion: RECOMMENDED_PLUGIN_VERSION,
      clientCapabilities: fullCapabilities,
    });
    const verified = verifyMcpExecutionBootstrap({
      actorId: testPrincipal.actorId,
      run,
      bootstrapToken: productPlaybook.bootstrapToken!,
      requiredStage: "product",
    });
    expect(verified.mode).toBe("verified");
    expect(verified.bootstrap?.stage).toBe("product");
  });

  it("keeps legacy transition mode active without adding a rollout environment switch", () => {
    process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-for-mcp-contracts";
    const previousGate = process.env.AUTHORING_MCP_REQUIRE_BOOTSTRAP;
    try {
      delete process.env.AUTHORING_MCP_REQUIRE_BOOTSTRAP;
      const legacyResult = verifyMcpExecutionBootstrap({
        actorId: testPrincipal.actorId,
        requiredStage: "source",
      });
      expect(legacyResult.mode).toBe("legacy");
      expect(legacyResult.bootstrap).toBeNull();

      process.env.AUTHORING_MCP_REQUIRE_BOOTSTRAP = "true";
      expect(
        verifyMcpExecutionBootstrap({
          actorId: testPrincipal.actorId,
          requiredStage: "source",
        }),
      ).toMatchObject({ mode: "legacy", bootstrap: null });
    } finally {
      if (previousGate === undefined) {
        delete process.env.AUTHORING_MCP_REQUIRE_BOOTSTRAP;
      } else {
        process.env.AUTHORING_MCP_REQUIRE_BOOTSTRAP = previousGate;
      }
    }
  });

  it("rejects missing and false required capabilities, while keeping read-only common access available", async () => {
    for (const capabilities of [undefined, {}, { independentSubagents: true }, { localArtifactFiles: true }]) {
      const result = await callMcpTool(testPrincipal, "workflow.get_playbook", {
        skill: "zyx-product-bundle-mcp", bootstrapProtocol: 1, pluginVersion: RECOMMENDED_PLUGIN_VERSION, clientCapabilities: capabilities,
      });
      expect(result.result?.isError).toBe(true);
      expect(result.result?.structuredContent?.bootstrapToken).toBeNull();
    }
    expect(evaluatePlaybookCompatibility({ stage: "source", clientCapabilities: {} }).status).toBe("incompatible");
    expect(evaluatePlaybookCompatibility({ stage: "common", pluginVersion: RECOMMENDED_PLUGIN_VERSION }).status).toBe("compatible");
  });

  it("refreshes stale runs through the MCP contract tool without changing identity, scope, source, or expiry", async () => {
    const playbook = getMcpPlaybook({ ...testPrincipal, skill: "zyx-idea-bundle-mcp", clientCapabilities: fullCapabilities });
    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...fresh } = readMcpBootstrapToken(playbook.bootstrapToken!);
    for (const stale of [
      { ...fresh, playbookRevision: "old-playbook", playbookChecksum: "0".repeat(64) },
      { ...fresh, contractRevision: "old-contract", contractChecksum: "0".repeat(64) },
    ]) {
      const oldToken = issueMcpRunToken({ runId: "stable-run", courseId: "course", chapterId: "chapter", sourcePackChecksum: "a".repeat(64), sourcePackId: "pack", bootstrap: stale });
      const before = readMcpRunToken(oldToken);
      const response = await callMcpTool(testPrincipal, "workflow.get_contract", { runToken: oldToken, bootstrapToken: playbook.bootstrapToken });
      expect(response.result?.isError).toBeUndefined();
      const after = readMcpRunToken(response.result?.structuredContent?.runToken);
      expect<unknown>({ ...after, issuedAt: before.issuedAt, bootstrap: before.bootstrap, ttlMs: before.ttlMs }).toEqual(before);
      expect(after.bootstrap).toEqual(fresh);
      expect(after.expiresAt).toBe(before.expiresAt);
      expect(verifyMcpExecutionBootstrap({ ...testPrincipal, run: after, requiredStage: "idea" }).mode).toBe("verified");
      expect(response.result?.structuredContent?.compatibility.boundBootstrap.actorId).toBeUndefined();
      expect(response.result?.structuredContent?.compatibility.boundBootstrap.sessionId).toBeUndefined();
    }
    const legacy = issueMcpRunToken({ courseId: "course", chapterId: "chapter" });
    expect(() => workflowContract(legacy, { ...testPrincipal, bootstrapToken: playbook.bootstrapToken! })).toThrow("AUTHORING_MCP_LEGACY_RUN_RESTART_REQUIRED");
  });

  it("does not let a fresh token replace a different principal or session binding", () => {
    const playbook = getMcpPlaybook({ ...testPrincipal, skill: "zyx-idea-bundle-mcp", clientCapabilities: fullCapabilities });
    const { kind: _kind, issuedAt: _issuedAt, expiresAt: _expiresAt, ...context } = readMcpBootstrapToken(playbook.bootstrapToken!);
    for (const other of [{ ...context, actorId: "other-admin" }, { ...context, sessionId: "other-session" }]) {
      const runToken = issueMcpRunToken({ courseId: "course", chapterId: "chapter", bootstrap: other });
      expect(() => workflowContract(runToken, { ...testPrincipal, bootstrapToken: playbook.bootstrapToken! })).toThrow("MISMATCH");
    }
    expect(() => verifyMcpExecutionBootstrap({ ...testPrincipal, sessionId: "other-session", bootstrapToken: playbook.bootstrapToken! })).toThrow("SESSION_MISMATCH");
    const publicContext = publicMcpRun(issueMcpRunToken({ courseId: "course", chapterId: "chapter", bootstrap: context })).bootstrap;
    expect(publicContext).not.toHaveProperty("actorId");
    expect(publicContext).not.toHaveProperty("sessionId");
    expect(publicContext).not.toHaveProperty("audience");
  });

  it("validates signed bootstrap payload shape, audience, signature, and expiry", () => {
    const secret = "test-better-auth-secret-for-mcp-contracts";
    process.env.BETTER_AUTH_SECRET = secret;
    const playbook = getMcpPlaybook({ ...testPrincipal, skill: "zyx-idea-bundle-mcp", clientCapabilities: fullCapabilities });
    const valid = readMcpBootstrapToken(playbook.bootstrapToken!);
    const sign = (payload: unknown) => {
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const key = createHmac("sha256", secret).update("zyx-authoring-mcp.v1", "utf8").digest("hex");
      return `${body}.${createHmac("sha256", key).update(body, "utf8").digest("base64url")}`;
    };
    expect(() => readMcpBootstrapToken(sign({ ...valid, stage: "invented" }))).toThrow("BOOTSTRAP_INVALID");
    expect(() => readMcpBootstrapToken(sign({ ...valid, sessionId: 123 }))).toThrow("BOOTSTRAP_INVALID");
    expect(() => verifyMcpExecutionBootstrap({ ...testPrincipal, bootstrapToken: sign({ ...valid, audience: "https://other.example/mcp" }) })).toThrow("AUDIENCE_MISMATCH");
    expect(() => readMcpBootstrapToken(sign({ ...valid, expiresAt: 1 }))).toThrow("TOKEN_EXPIRED");
    expect(() => readMcpBootstrapToken(`${playbook.bootstrapToken}corrupt`)).toThrow("TOKEN_INVALID");
  });

  it("includes live schema and quality-policy changes in the contract digest", () => {
    const snapshot = authoringContractSnapshot();
    expect(snapshot.validation.schemas).toHaveProperty("article");
    expect(snapshot.validation.schemas).toHaveProperty("referenceDraft");
    const original = computeAuthoringContractDigest(snapshot);
    const schemaChange = structuredClone(snapshot);
    // The digest must detect even a deliberately invalid replacement schema.
    Reflect.set(schemaChange.validation.schemas, "article", { type: "string" });
    expect(computeAuthoringContractDigest(schemaChange)).not.toEqual(original);
    const policyChange = structuredClone(snapshot);
    policyChange.validation.qualityPolicyVersion = "new-policy";
    expect(computeAuthoringContractDigest(policyChange)).not.toEqual(original);
  });
});
