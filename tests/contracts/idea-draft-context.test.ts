import { expect, test } from "bun:test";
import { loadIdeaDraftContext, type IdeaDraftSourcePorts } from "@/lib/authoring/idea-draft-context";
import type { IdeaDraftCreationPorts } from "@/lib/authoring/idea-draft-service";
import type { StoredSourcePackRecord } from "@/lib/bundle/source-staging";
import { issueMcpBootstrapToken, readMcpRunToken } from "@/lib/authoring/mcp-workflows";
import { evaluateSourcePackQuality } from "@/lib/authoring/quality/source-pack";
import { issueBoundMcpRunToken } from "../helpers/mcp-run";
import { ideaDraftFixture } from "../helpers/idea-draft";

function harness() {
  const { sourcePack } = ideaDraftFixture();
  const principal = { actorId: "author", userId: "author", sessionId: "session", authMethod: "session" as const, scopes: ["authoring:stage"] };
  const bootstrap = issueMcpBootstrapToken({ actorId: "author", sessionId: "session", stage: "idea", clientCapabilities: { independentSubagents: true, localArtifactFiles: true, pdfRendering: true } });
  const run = readMcpRunToken(issueBoundMcpRunToken({ runId: "run", courseId: "course", chapterId: "chapter", sourcePackId: "source-pack", sourcePackImportId: "source-import", sourcePackChecksum: sourcePack.archive.checksum }, bootstrap));
  const input: Parameters<IdeaDraftCreationPorts["loadContext"]>[0] = { run, principal, draftKey: "first" };
  const quality = evaluateSourcePackQuality(sourcePack, new Map(sourcePack.manifest.documents.map(document => [document.id, new TextEncoder().encode(`Original ${document.id}`)])));
  expect(quality.valid).toBe(true);
  const stored: StoredSourcePackRecord = { id: "source-import", bundleId: "source-pack", checksum: sourcePack.archive.checksum, courseId: "legacy-course", sourceUriOrKey: "private/source.zip", status: "validated", version: 1,
    requestedBy: "another-author", createdAt: new Date(), updatedAt: new Date(), validationReport: { valid: true, packId: "source-pack", checksum: sourcePack.archive.checksum,
      courseId: "course", chapterId: "chapter", documentCount: 1, quality } };
  const resolved: Parameters<IdeaDraftSourcePorts["resolve"]>[0][] = [], downloads: string[] = [];
  const ports: IdeaDraftSourcePorts = { async resolve(value) { resolved.push(value); return stored; }, async read(key) { downloads.push(key); return sourcePack; } };
  return { input, stored, sourcePack, ports, resolved, downloads };
}

test("lookup binds import and checksum, validates source bytes and derives retry-stable server metadata", async () => {
  const h = harness();
  const first = await loadIdeaDraftContext(h.input, h.ports), retry = await loadIdeaDraftContext(h.input, h.ports);
  expect(h.resolved[0]).toEqual({ packId: "source-pack", importId: "source-import", checksum: h.sourcePack.archive.checksum });
  expect(first).toEqual(retry);
  expect(first).toMatchObject({ courseId: "course", chapterId: "chapter", creatorId: "author", createdAt: new Date(h.input.run.issuedAt).toISOString() });
  expect(first.bundleId).not.toBe((await loadIdeaDraftContext({ ...h.input, draftKey: "second" }, h.ports)).bundleId);
  expect(first.bundleId).not.toBe((await loadIdeaDraftContext({ ...h.input, principal: { ...h.input.principal, actorId: "another" } }, h.ports)).bundleId);
});

test.each(["course", "chapter", "status", "valid", "quality", "import", "checksum", "pack", "reportChecksum", "reportPack"])("invalid %s binding rejects before private source download", async kind => {
  const h = harness();
  if (kind === "course") h.stored.validationReport.courseId = "foreign";
  if (kind === "chapter") h.stored.validationReport.chapterId = "foreign";
  if (kind === "status") h.stored.status = "withdrawn";
  if (kind === "valid") h.stored.validationReport.valid = false;
  if (kind === "quality") h.stored.validationReport.quality = undefined;
  if (kind === "import") h.stored.id = "foreign";
  if (kind === "checksum") h.stored.checksum = "a".repeat(64);
  if (kind === "pack") h.stored.bundleId = "foreign";
  if (kind === "reportChecksum") h.stored.validationReport.checksum = "a".repeat(64);
  if (kind === "reportPack") h.stored.validationReport.packId = "foreign";
  await expect(loadIdeaDraftContext(h.input, h.ports)).rejects.toThrow();
  expect(h.downloads).toHaveLength(0);
});

test("changed bytes or manifest identity cannot replace the checksum pinned to the run", async () => {
  const h = harness();
  h.ports.read = async () => ({ ...h.sourcePack, archive: { ...h.sourcePack.archive, checksum: "a".repeat(64) } });
  await expect(loadIdeaDraftContext(h.input, h.ports)).rejects.toThrow("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");
  h.ports.read = async () => ({ ...h.sourcePack, manifest: { ...h.sourcePack.manifest, packId: "foreign" } });
  await expect(loadIdeaDraftContext(h.input, h.ports)).rejects.toThrow("AUTHORING_MCP_SOURCE_PACK_IMPORT_MISMATCH");
});

test("legacy runs still pin an exact checksum and never request the latest pack", async () => {
  const h = harness();
  h.input.run.sourcePackImportId = null;
  await loadIdeaDraftContext(h.input, h.ports);
  expect(h.resolved[0]).toEqual({ packId: "source-pack", checksum: h.sourcePack.archive.checksum });
  h.input.run.sourcePackChecksum = null;
  await expect(loadIdeaDraftContext(h.input, h.ports)).rejects.toThrow("AUTHORING_MCP_SOURCE_PACK_REQUIRED");
  expect(h.resolved).toHaveLength(1);
});
