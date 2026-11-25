import { expect, test } from "bun:test";
import { createIdeaAuthoringClient, IdeaAuthoringClientError } from "@/lib/authoring/idea-authoring-client";
import { createProductAuthoringClient } from "@/lib/authoring/product-authoring-client";

const first = "a".repeat(64), next = "b".repeat(64);
test("Idea edits carry successor identity into targeted reads and release planning", async () => {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const client = createIdeaAuthoringClient({ bootstrapToken: "idea-bootstrap", identity: { importId: "original", revision: first }, transport: async (name, input) => {
    calls.push({ name, input });
    return { structuredContent: { ok: true, kind: "idea", importId: "successor", revision: next } };
  } });
  await client.createRevision(["idea-one"]);
  await client.patch([{ op: "set", target: { entityType: "idea", entityId: "idea-one" }, field: "conciseExplanation", value: "Perjelas syarat rumus." }]);
  await client.read({ entityType: "idea", entityId: "idea-one" });
  await client.readFull();
  await client.planRelease();
  expect(calls[0].input).toMatchObject({ kind: "idea", baseImportId: "original", expectedRevision: first });
  expect(calls[1].input).toMatchObject({ kind: "idea", importId: "successor", expectedRevision: next });
  expect(calls[2].input).toMatchObject({ responseMode: "compact", target: { entityType: "idea", entityId: "idea-one" } });
  expect(calls[3].input.responseMode).toBe("full");
  expect(calls[4].input).toMatchObject({ bootstrapTokens: { idea: "idea-bootstrap" }, entries: [{ kind: "idea", importId: "successor", expectedRevision: next }] });
  expect(client).not.toHaveProperty("verificationInput");
});

test("clients reject wrong-kind or unexpected exact-read revisions without silently rebasing", async () => {
  for (const kind of ["idea", "product"] as const) {
    for (const response of [
      { kind: kind === "idea" ? "product" : "idea", importId: "original", revision: first },
      { kind, importId: "unexpected", revision: first },
      { kind, importId: "original", revision: next },
    ]) {
      const create = kind === "idea" ? createIdeaAuthoringClient : createProductAuthoringClient;
      const client = create({ bootstrapToken: "bootstrap", identity: { importId: "original", revision: first }, transport: async () => ({ ok: true, ...response }) });
      await expect(client.read()).rejects.toThrow(`${kind.toUpperCase()}_AUTHORING_RESPONSE_INVALID`);
      expect(client.snapshot()).toEqual({ importId: "original", revision: first });
    }
  }
});

test("Idea conflicts preserve diagnostics and never retry a write", async () => {
  let count = 0;
  const client = createIdeaAuthoringClient({ bootstrapToken: "bootstrap", identity: { importId: "original", revision: first }, transport: async () => {
    count += 1;
    return { isError: true, structuredContent: { ok: false, error: "REVISION_STALE_CONTEXT", nextAction: "reconcile_revision" } };
  } });
  try { await client.patch([]); throw new Error("Expected conflict"); }
  catch (error) {
    expect(error).toBeInstanceOf(IdeaAuthoringClientError);
    expect((error as IdeaAuthoringClientError).details.nextAction).toBe("reconcile_revision");
  }
  expect(count).toBe(1);
  expect(client.snapshot().revision).toBe(first);
});
