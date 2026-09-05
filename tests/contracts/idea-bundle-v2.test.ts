import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeIdeaBundleChecksum,
  serializeDeterministically,
  validateIdeaBundle,
  type IdeaBundleManifest,
  type LearningSection,
} from "@/lib/bundle/idea-bundle-v2";
import { sha256Bytes } from "@/lib/bundle/validator";
import { createIdeaBundleDraft, finalizeIdeaBundleDraft } from "@/lib/bundle/idea-draft";
import { previewIdeaBundle } from "@/lib/bundle/idea-preview";

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
  const files = new Map(
    fixturePaths.map((path) => {
      const raw = readFileSync(join(fixtureRoot, path));
      if (path.endsWith(".md")) {
        const normalized = raw.toString("utf8").replace(/\r\n/g, "\n");
        return [path, new Uint8Array(Buffer.from(normalized, "utf8"))];
      }
      return [path, new Uint8Array(raw)];
    })
  );
  refreshChecksums(files);
  return files;
}

function fixtureFilesV3(customSections?: LearningSection[]): Map<string, Uint8Array> {
  const files = fixtureFiles();
  const manifest = parsedManifest(files);
  manifest.schemaVersion = "idea-bundle.v3";
  manifest.bundleId = "bundle-idea-motion-v3";
  const sections: LearningSection[] = customSections ?? [
    {
      id: "sec-kinematics-intro",
      courseId: manifest.courseId,
      chapterId: "chapter-kinematics",
      stableKey: "course-physics:chapter-kinematics:section-intro",
      title: "Pengantar Kinematika",
      slug: "pengantar-kinematika",
      orderIndex: 0,
      learningObjective: "Memahami konsep dasar gerak dan kecepatan",
      primaryIdeaIds: ["idea-velocity"],
      supportingIdeaIds: [],
      sourceChunkIds: ["chunk-motion-1"],
    },
  ];
  writeJson(files, "entities/learning-sections.json", sections);
  manifest.entityFiles.push({
    path: "entities/learning-sections.json",
    entityType: "learning_sections",
    checksum: sha256Bytes(files.get("entities/learning-sections.json")!),
    stableIds: sections.map((s) => s.id),
  });
  writeJson(files, "manifest.json", manifest);
  refreshChecksums(files);
  return files;
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

describe("Plan 006 pure Idea Bundle V2 and V3 validation", () => {
  it("finalizes reviewed edits into a newly checksummed bundle without changing identity", () => {
    const parsed = validateIdeaBundle(fixtureFiles());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const draft = createIdeaBundleDraft(parsed.data);
    draft.ideas[0].canonicalStatement = "Kecepatan menyatakan perubahan posisi tiap satuan waktu.";
    draft.ideas[0].conciseExplanation = "Gunakan perpindahan, bukan hanya panjang lintasan.";
    const originalHash = parsed.data.entities.ideas[0].semanticHash;
    const finalized = finalizeIdeaBundleDraft(parsed.data, draft);
    expect(finalized.bundle.entities.ideas[0].id).toBe(parsed.data.entities.ideas[0].id);
    expect(finalized.bundle.entities.ideas[0].semanticHash).not.toBe(originalHash);
    expect(finalized.bundle.manifest.bundleChecksum).not.toBe(parsed.data.manifest.bundleChecksum);
  });

  it("rejects a draft that attempts to replace an Idea identity", () => {
    const parsed = validateIdeaBundle(fixtureFiles());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const draft = createIdeaBundleDraft(parsed.data);
    draft.ideas[0].id = "idea-replaced";
    expect(() => finalizeIdeaBundleDraft(parsed.data, draft)).toThrow("IDEA_DRAFT_IDENTITY_CHANGED");
  });

  it("accepts the strict fixture and exposes deterministic serialization", () => {
    const files = fixtureFiles();
    const result = validateIdeaBundle(files);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.manifest.bundleId).toBe("bundle-idea-motion-v2");
    expect(result.data.entities.ideas).toHaveLength(1);
    expect(result.data.entities.learningSections).toEqual([]);
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

  it("rejects non-publishable Ideas and inconsistent creator attribution", () => {
    const draft = fixtureFiles();
    const draftIdeas = JSON.parse(new TextDecoder().decode(draft.get("entities/ideas.json")));
    draftIdeas[0].status = "draft";
    writeJson(draft, "entities/ideas.json", draftIdeas);
    refreshChecksums(draft);
    expect(validateIdeaBundle(draft)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const inconsistentCreator = fixtureFiles();
    const ideas = JSON.parse(new TextDecoder().decode(inconsistentCreator.get("entities/ideas.json")));
    ideas[0].creatorId = "another-creator";
    writeJson(inconsistentCreator, "entities/ideas.json", ideas);
    refreshChecksums(inconsistentCreator);
    expect(validateIdeaBundle(inconsistentCreator)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });
  });

  it("maintains V2 backward compatibility and preview structure", () => {
    const files = fixtureFiles();
    const result = validateIdeaBundle(files);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.entities.learningSections).toEqual([]);

    const preview = previewIdeaBundle(result.data);
    expect(preview.summary.learningSectionCount).toBe(0);
    expect(preview.learningSections).toEqual([]);
    expect(preview.ideas[0].learningSection).toBeNull();

    const invalidV2 = fixtureFiles();
    const manifest = parsedManifest(invalidV2);
    writeJson(invalidV2, "entities/learning-sections.json", []);
    manifest.entityFiles.push({
      path: "entities/learning-sections.json",
      entityType: "learning_sections",
      checksum: sha256Bytes(invalidV2.get("entities/learning-sections.json")!),
      stableIds: [],
    });
    writeJson(invalidV2, "manifest.json", manifest);
    refreshChecksums(invalidV2);
    expect(validateIdeaBundle(invalidV2)).toMatchObject({
      success: false,
      issues: [{ code: "BUNDLE_ENTITY_INVALID" }],
    });
  });

  it("validates a complete and correct Idea Bundle V3", () => {
    const files = fixtureFilesV3();
    const result = validateIdeaBundle(files);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.manifest.schemaVersion).toBe("idea-bundle.v3");
    expect(result.data.entities.learningSections).toHaveLength(1);
    expect(result.data.entities.learningSections[0].id).toBe("sec-kinematics-intro");

    const preview = previewIdeaBundle(result.data);
    expect(preview.summary.learningSectionCount).toBe(1);
    expect(preview.learningSections).toHaveLength(1);
    expect(preview.learningSections[0].title).toBe("Pengantar Kinematika");
    expect(preview.ideas[0].learningSection).toEqual({
      id: "sec-kinematics-intro",
      title: "Pengantar Kinematika",
      slug: "pengantar-kinematika",
    });
  });

  it("rejects duplicate or missing Idea and source assignments in sections", () => {
    const duplicatePrimary = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity", "idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    expect(validateIdeaBundle(duplicatePrimary)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const duplicateSupporting = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: ["idea-velocity", "idea-velocity"],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    expect(validateIdeaBundle(duplicateSupporting)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const primaryAlsoSupporting = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: ["idea-velocity"],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    expect(validateIdeaBundle(primaryAlsoSupporting)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const missingPrimaryAssignment = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-other"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    const manifest = parsedManifest(missingPrimaryAssignment);
    const ideas = JSON.parse(new TextDecoder().decode(missingPrimaryAssignment.get("entities/ideas.json")));
    ideas.push({ ...ideas[0], id: "idea-other", stableKey: "course-physics:chapter-kinematics:other", code: "KIN-OTHER", sourcePolicy: "tutor_authored", curatorId: "curator-1" });
    writeJson(missingPrimaryAssignment, "entities/ideas.json", ideas);
    manifest.entityFiles.find((f) => f.entityType === "ideas")!.stableIds.push("idea-other");
    writeJson(missingPrimaryAssignment, "manifest.json", manifest);
    refreshChecksums(missingPrimaryAssignment);
    expect(validateIdeaBundle(missingPrimaryAssignment)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const multiplePrimaryAssignments = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-2",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-2",
        title: "Section 2",
        slug: "sec-2",
        orderIndex: 1,
        learningObjective: "Objective 2",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    expect(validateIdeaBundle(multiplePrimaryAssignments)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const missingChunk = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-non-existent"],
      },
    ]);
    expect(validateIdeaBundle(missingChunk)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_MISSING_SOURCE" }] });

    const duplicateStableKey = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:shared-key",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-2",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:shared-key",
        title: "Section 2",
        slug: "sec-2",
        orderIndex: 1,
        learningObjective: "Objective 2",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    expect(validateIdeaBundle(duplicateStableKey)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_DUPLICATE_STABLE_KEY" }] });
  });

  it("validates hierarchy depth, cycles, and parent consistency", () => {
    const cycle = fixtureFilesV3([
      {
        id: "sec-1",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-2",
        stableKey: "course-physics:chapter-kinematics:sec-1",
        title: "Section 1",
        slug: "sec-1",
        orderIndex: 0,
        learningObjective: "Objective 1",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-2",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-1",
        stableKey: "course-physics:chapter-kinematics:sec-2",
        title: "Section 2",
        slug: "sec-2",
        orderIndex: 0,
        learningObjective: "Objective 2",
        primaryIdeaIds: ["idea-other"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    const cycleManifest = parsedManifest(cycle);
    const ideas = JSON.parse(new TextDecoder().decode(cycle.get("entities/ideas.json")));
    ideas.push({ ...ideas[0], id: "idea-other", stableKey: "course-physics:chapter-kinematics:other", code: "KIN-OTHER", sourcePolicy: "tutor_authored", curatorId: "curator-1" });
    writeJson(cycle, "entities/ideas.json", ideas);
    cycleManifest.entityFiles.find((f) => f.entityType === "ideas")!.stableIds.push("idea-other");
    writeJson(cycle, "manifest.json", cycleManifest);
    refreshChecksums(cycle);
    expect(validateIdeaBundle(cycle)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });

    const maxDepthFiles = fixtureFilesV3([
      {
        id: "sec-root",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:root",
        title: "Root Section",
        slug: "root-section",
        orderIndex: 0,
        learningObjective: "Root objective",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-child",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-root",
        stableKey: "course-physics:chapter-kinematics:child",
        title: "Child Section",
        slug: "child-section",
        orderIndex: 0,
        learningObjective: "Child objective",
        primaryIdeaIds: ["idea-2"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-grandchild",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-child",
        stableKey: "course-physics:chapter-kinematics:grandchild",
        title: "Grandchild Section",
        slug: "grandchild-section",
        orderIndex: 0,
        learningObjective: "Grandchild objective",
        primaryIdeaIds: ["idea-3"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    const depthManifest = parsedManifest(maxDepthFiles);
    const depthIdeas = JSON.parse(new TextDecoder().decode(maxDepthFiles.get("entities/ideas.json")));
    depthIdeas.push(
      { ...depthIdeas[0], id: "idea-2", stableKey: "course-physics:chapter-kinematics:i2", code: "KIN-2", sourcePolicy: "tutor_authored", curatorId: "curator-1" },
      { ...depthIdeas[0], id: "idea-3", stableKey: "course-physics:chapter-kinematics:i3", code: "KIN-3", sourcePolicy: "tutor_authored", curatorId: "curator-1" }
    );
    writeJson(maxDepthFiles, "entities/ideas.json", depthIdeas);
    depthManifest.entityFiles.find((f) => f.entityType === "ideas")!.stableIds.push("idea-2", "idea-3");
    writeJson(maxDepthFiles, "manifest.json", depthManifest);
    refreshChecksums(maxDepthFiles);
    expect(validateIdeaBundle(maxDepthFiles).success).toBe(true);

    const exceedDepthFiles = fixtureFilesV3([
      {
        id: "sec-root",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        stableKey: "course-physics:chapter-kinematics:root",
        title: "Root Section",
        slug: "root-section",
        orderIndex: 0,
        learningObjective: "Root objective",
        primaryIdeaIds: ["idea-velocity"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-child",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-root",
        stableKey: "course-physics:chapter-kinematics:child",
        title: "Child Section",
        slug: "child-section",
        orderIndex: 0,
        learningObjective: "Child objective",
        primaryIdeaIds: ["idea-2"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-grandchild",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-child",
        stableKey: "course-physics:chapter-kinematics:grandchild",
        title: "Grandchild Section",
        slug: "grandchild-section",
        orderIndex: 0,
        learningObjective: "Grandchild objective",
        primaryIdeaIds: ["idea-3"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
      {
        id: "sec-great-grandchild",
        courseId: "course-physics",
        chapterId: "chapter-kinematics",
        parentSectionId: "sec-grandchild",
        stableKey: "course-physics:chapter-kinematics:great-grandchild",
        title: "Great Grandchild Section",
        slug: "great-grandchild-section",
        orderIndex: 0,
        learningObjective: "Exceeds depth",
        primaryIdeaIds: ["idea-4"],
        supportingIdeaIds: [],
        sourceChunkIds: ["chunk-motion-1"],
      },
    ]);
    const exceedManifest = parsedManifest(exceedDepthFiles);
    const exceedIdeas = JSON.parse(new TextDecoder().decode(exceedDepthFiles.get("entities/ideas.json")));
    exceedIdeas.push(
      { ...exceedIdeas[0], id: "idea-2", stableKey: "course-physics:chapter-kinematics:i2", code: "KIN-2", sourcePolicy: "tutor_authored", curatorId: "curator-1" },
      { ...exceedIdeas[0], id: "idea-3", stableKey: "course-physics:chapter-kinematics:i3", code: "KIN-3", sourcePolicy: "tutor_authored", curatorId: "curator-1" },
      { ...exceedIdeas[0], id: "idea-4", stableKey: "course-physics:chapter-kinematics:i4", code: "KIN-4", sourcePolicy: "tutor_authored", curatorId: "curator-1" }
    );
    writeJson(exceedDepthFiles, "entities/ideas.json", exceedIdeas);
    exceedManifest.entityFiles.find((f) => f.entityType === "ideas")!.stableIds.push("idea-2", "idea-3", "idea-4");
    writeJson(exceedDepthFiles, "manifest.json", exceedManifest);
    refreshChecksums(exceedDepthFiles);
    expect(validateIdeaBundle(exceedDepthFiles)).toMatchObject({ success: false, issues: [{ code: "BUNDLE_ENTITY_INVALID" }] });
  });

  it("allows permitted draft edits and locks immutable section fields", () => {
    const files = fixtureFilesV3();
    const parsed = validateIdeaBundle(files);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const draft = createIdeaBundleDraft(parsed.data);
    expect(draft.learningSections).toHaveLength(1);

    draft.learningSections[0].title = "Pengantar Kinematika Lanjutan";
    draft.learningSections[0].learningObjective = "Tujuan pembelajaran diperbarui secara terstruktur";
    draft.learningSections[0].orderIndex = 2;

    const finalized = finalizeIdeaBundleDraft(parsed.data, draft);
    expect(finalized.bundle.entities.learningSections[0].title).toBe("Pengantar Kinematika Lanjutan");
    expect(finalized.bundle.entities.learningSections[0].learningObjective).toBe("Tujuan pembelajaran diperbarui secara terstruktur");
    expect(finalized.bundle.entities.learningSections[0].orderIndex).toBe(2);
    expect(finalized.bundle.manifest.bundleChecksum).not.toBe(parsed.data.manifest.bundleChecksum);

    const lockedSlugDraft = createIdeaBundleDraft(parsed.data);
    lockedSlugDraft.learningSections[0].slug = "modified-slug";
    expect(() => finalizeIdeaBundleDraft(parsed.data, lockedSlugDraft)).toThrow("IDEA_DRAFT_SECTION_LOCKED_FIELD_CHANGED");

    const lockedStableKeyDraft = createIdeaBundleDraft(parsed.data);
    lockedStableKeyDraft.learningSections[0].stableKey = "course-physics:chapter-kinematics:new-key";
    expect(() => finalizeIdeaBundleDraft(parsed.data, lockedStableKeyDraft)).toThrow("IDEA_DRAFT_SECTION_LOCKED_FIELD_CHANGED");

    const lockedIdeaMappingDraft = createIdeaBundleDraft(parsed.data);
    lockedIdeaMappingDraft.learningSections[0].primaryIdeaIds = ["idea-changed"];
    expect(() => finalizeIdeaBundleDraft(parsed.data, lockedIdeaMappingDraft)).toThrow("IDEA_DRAFT_SECTION_LOCKED_FIELD_CHANGED");

    const lockedSourceMappingDraft = createIdeaBundleDraft(parsed.data);
    lockedSourceMappingDraft.learningSections[0].sourceChunkIds = ["chunk-changed"];
    expect(() => finalizeIdeaBundleDraft(parsed.data, lockedSourceMappingDraft)).toThrow("IDEA_DRAFT_SECTION_LOCKED_FIELD_CHANGED");
  });
});
