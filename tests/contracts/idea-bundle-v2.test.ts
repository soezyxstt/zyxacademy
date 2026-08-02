import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeIdeaBundleChecksum,
  serializeDeterministically,
  validateIdeaBundle,
  type IdeaBundleManifest,
} from "@/lib/bundle/idea-bundle-v2";
import { sha256Bytes } from "@/lib/bundle/validator";

const fixtureRoot = join(process.cwd(), "tests/fixtures/bundles/idea-v2");
const fixturePaths = [
  "manifest.json",
  "sources/kinematika.md",
  "entities/source-materials.json",
  "entities/source-chunks.json",
  "entities/ideas.json",
  "entities/provenance.json",
  "entities/relations.json",
];

function fixtureFiles(): Map<string, Uint8Array> {
  return new Map(fixturePaths.map((path) => [path, new Uint8Array(readFileSync(join(fixtureRoot, path)))]));
}

function parsedManifest(files: ReadonlyMap<string, Uint8Array>): IdeaBundleManifest {
  return JSON.parse(new TextDecoder().decode(files.get("manifest.json")));
}

function writeJson(files: Map<string, Uint8Array>, path: string, value: unknown): void {
  files.set(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

function refreshChecksums(files: Map<string, Uint8Array>): void {
  const manifest = parsedManifest(files);
  for (const entityFile of manifest.entityFiles) {
    entityFile.checksum = sha256Bytes(files.get(entityFile.path)!);
  }
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  writeJson(files, "manifest.json", manifest);
}

describe("Plan 006 pure Idea Bundle V2 validation", () => {
  it("accepts the strict fixture and exposes deterministic serialization", () => {
    const files = fixtureFiles();
    const result = validateIdeaBundle(files);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.manifest.bundleId).toBe("bundle-idea-motion-v2");
    expect(result.data.entities.ideas).toHaveLength(1);
    expect(serializeDeterministically({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(result.data.canonicalChecksum).toBe(result.data.manifest.bundleChecksum);
  });

  it("fails closed for unknown manifest fields and tampered entity checksums", () => {
    const unknown = fixtureFiles();
    const manifest = parsedManifest(unknown) as Record<string, unknown>;
    manifest.unexpected = true;
    writeJson(unknown, "manifest.json", manifest);
    expect(validateIdeaBundle(unknown)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_INVALID_MANIFEST" }] });

    const tampered = fixtureFiles();
    tampered.set("entities/ideas.json", new TextEncoder().encode("[]\n"));
    const tamperedManifest = parsedManifest(tampered);
    tamperedManifest.bundleChecksum = computeIdeaBundleChecksum(tamperedManifest, tampered);
    writeJson(tampered, "manifest.json", tamperedManifest);
    expect(validateIdeaBundle(tampered)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_CHECKSUM_MISMATCH" }] });
  });

  it("rejects invalid spans, duplicate stable keys, and prerequisite cycles", () => {
    const invalidSpan = fixtureFiles();
    const chunks = JSON.parse(new TextDecoder().decode(invalidSpan.get("entities/source-chunks.json")));
    chunks[0].endOffset = 3;
    writeJson(invalidSpan, "entities/source-chunks.json", chunks);
    refreshChecksums(invalidSpan);
    expect(validateIdeaBundle(invalidSpan)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_INVALID_SPAN" }] });

    const duplicate = fixtureFiles();
    const ideas = JSON.parse(new TextDecoder().decode(duplicate.get("entities/ideas.json")));
    ideas.push({ ...ideas[0], id: "idea-velocity-copy" });
    writeJson(duplicate, "entities/ideas.json", ideas);
    const duplicateManifest = parsedManifest(duplicate);
    duplicateManifest.entityFiles.find((file) => file.entityType === "ideas")!.stableIds.push("idea-velocity-copy");
    writeJson(duplicate, "manifest.json", duplicateManifest);
    refreshChecksums(duplicate);
    expect(validateIdeaBundle(duplicate)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_DUPLICATE_STABLE_KEY" }] });

    const cycle = fixtureFiles();
    const cycleIdeas = JSON.parse(new TextDecoder().decode(cycle.get("entities/ideas.json")));
    cycleIdeas.push({ ...cycleIdeas[0], id: "idea-position", stableKey: "course-physics:chapter-kinematics:position", code: "KIN-POSITION" });
    writeJson(cycle, "entities/ideas.json", cycleIdeas);
    const cycleRelations = [
      { id: "rel-a", sourceIdeaId: "idea-velocity", targetIdeaId: "idea-position", relationType: "prerequisite", version: 1, status: "active", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" },
      { id: "rel-b", sourceIdeaId: "idea-position", targetIdeaId: "idea-velocity", relationType: "prerequisite", version: 1, status: "active", createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z" },
    ];
    writeJson(cycle, "entities/relations.json", cycleRelations);
    const cycleManifest = parsedManifest(cycle);
    cycleManifest.entityFiles.find((file) => file.entityType === "ideas")!.stableIds.push("idea-position");
    cycleManifest.entityFiles.find((file) => file.entityType === "relations")!.stableIds.push("rel-a", "rel-b");
    writeJson(cycle, "manifest.json", cycleManifest);
    refreshChecksums(cycle);
    expect(validateIdeaBundle(cycle)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_PREREQUISITE_CYCLE" }] });
  });
});
