import { describe, expect, test } from "bun:test";
import { createProductAuthoringClient, ProductAuthoringClientError, type ProductAuthoringPatch } from "@/lib/authoring/product-authoring-client";

const revisionA = "a".repeat(64);
const revisionB = "b".repeat(64);
const observedPlan = { contentHash: "c".repeat(64), planHash: "d".repeat(64) };
const patch: ProductAuthoringPatch[] = [{ op: "set", target: { entityType: "article", entityId: "article", sectionId: "section", blockId: "block" }, field: "title", value: "Judul" }];

describe("Product authoring client", () => {
  test("sends only explicit derived review or print refresh inputs with the current identity", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = createProductAuthoringClient({ bootstrapToken: "bootstrap", identity: { importId: "draft", revision: revisionA },
      transport: async (_name, input) => {
        calls.push(input);
        return { ok: true, kind: "product", importId: "successor", revision: revisionB };
      },
    });
    const derivedContentReviews = [{ entityId: "diktat", sourceArticleId: "article", expectedArticleHash: "c".repeat(64), unitIds: ["unit"], notes: "The revised source still supports this unchanged summary." }];
    await client.patch([], { derivedContentReviews });
    await client.patch([], { refreshPrintEvidence: true });
    expect(calls).toEqual([
      { kind: "product", bootstrapToken: "bootstrap", importId: "draft", expectedRevision: revisionA, responseMode: "compact", operations: [], derivedContentReviews },
      { kind: "product", bootstrapToken: "bootstrap", importId: "successor", expectedRevision: revisionB, responseMode: "compact", operations: [], refreshPrintEvidence: true },
    ]);
  });

  test("threads successor identity and execution into the next exact-revision call", async () => {
    const calls: { name: string; input: Record<string, unknown> }[] = [];
    const client = createProductAuthoringClient({ bootstrapToken: "bootstrap", identity: { importId: "original", revision: revisionA },
      transport: async (name, input) => {
        calls.push({ name, input });
        return { structuredContent: { ok: true, kind: "product", importId: "successor", revision: revisionB, stagingRunId: "run", execution: { runId: "run", runToken: "current-session-token" } } };
      },
    });
    await client.createRevision(["article"]);
    await client.patch(patch);
    expect(calls[0].input).toMatchObject({ baseImportId: "original", expectedRevision: revisionA, responseMode: "compact" });
    expect(calls[1].input).toMatchObject({ importId: "successor", expectedRevision: revisionB, responseMode: "compact", operations: patch });
    expect(client.verificationInput(observedPlan)).toEqual({ importId: "successor", bootstrapToken: "bootstrap", runToken: "current-session-token", expectedContentHash: observedPlan.contentHash, expectedPlanHash: observedPlan.planHash });
    const snapshot = client.snapshot();
    snapshot.importId = "tampered";
    expect(client.snapshot().importId).toBe("successor");
  });

  test("surfaces stale errors without retrying or replacing the observed revision", async () => {
    let count = 0;
    const client = createProductAuthoringClient({ bootstrapToken: "bootstrap", identity: { importId: "draft", revision: revisionA }, transport: async () => {
      count += 1;
      return { isError: true, structuredContent: { ok: false, error: "REVISION_STALE_CONTEXT", remediation: "Reconcile the current revision", revision: revisionB } };
    } });
    try { await client.patch(patch); throw new Error("Expected conflict"); }
    catch (error) {
      expect(error).toBeInstanceOf(ProductAuthoringClientError);
      expect((error as ProductAuthoringClientError).code).toBe("REVISION_STALE_CONTEXT");
    }
    expect(count).toBe(1);
    expect(client.snapshot()).toEqual({ importId: "draft", revision: revisionA });
  });

  test("rejects overlapping operations and invalid execution identity", async () => {
    let resolve: (value: unknown) => void = () => {};
    const client = createProductAuthoringClient({ bootstrapToken: "bootstrap", identity: { importId: "draft", revision: revisionA }, transport: () => new Promise(value => { resolve = value; }) });
    const pending = client.patch(patch);
    await expect(client.patch(patch)).rejects.toThrow("PRODUCT_AUTHORING_OPERATION_IN_FLIGHT");
    resolve({ ok: true, kind: "product", importId: "next", revision: revisionB, stagingRunId: "expected-run", execution: { runId: "wrong-run", runToken: "token" } });
    await expect(pending).rejects.toThrow("PRODUCT_AUTHORING_RESPONSE_INVALID");
    expect(client.snapshot().revision).toBe(revisionA);
  });

  test("renews execution only by reading the exact context after bootstrap renewal", async () => {
    const requests: Record<string, unknown>[] = [];
    const client = createProductAuthoringClient({ bootstrapToken: "old-bootstrap", identity: { importId: "draft", revision: revisionA, execution: { runId: "run", runToken: "old-run-token" } }, transport: async (_name, input) => {
      requests.push(input);
      return { content: [{ type: "text", text: JSON.stringify({ ok: true, kind: "product", importId: "draft", revision: revisionA, stagingRunId: "run", execution: { runId: "run", runToken: "new-run-token" } }) }] };
    } });
    client.setBootstrapToken("new-bootstrap");
    expect(() => client.verificationInput(observedPlan)).toThrow("PRODUCT_AUTHORING_EXECUTION_REQUIRED");
    await client.read({ entityType: "article", entityId: "article", sectionId: "section" });
    expect(requests[0]).toMatchObject({ bootstrapToken: "new-bootstrap", expectedRevision: revisionA, responseMode: "compact", target: { entityType: "article", entityId: "article", sectionId: "section" } });
    expect(client.verificationInput(observedPlan).runToken).toBe("new-run-token");
  });
});
