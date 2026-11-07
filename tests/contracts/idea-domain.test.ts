import { describe, expect, it } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import {
  ideaPublicationSchema,
  ideaRelationGraphSchema,
  ideaRelationSchema,
  ideaSchema,
  productDependencySchema,
  provenanceMatchesChunk,
  transitionDependencyFreshness,
  uniqueIdeaStableKeysSchema,
  type Idea,
} from "@/lib/ide/contracts";
import {
  applyDependencyChange,
  assertNoPrerequisiteCycle,
} from "@/lib/ide/dependencies";
import {
  computeIdeaSemanticHash,
  computeIdeaGenerationHash,
  computeProvenanceChecksum,
  computeSourceChecksum,
  generateStableIdeaKey,
  normalizeSourceText,
} from "@/lib/ide/identity";
import { hasExactSourceChunkOffsets, sourceChunkSchema, sourceMaterialSchema } from "@/lib/sumber/contracts";

const checksumA = "a".repeat(64);
const checksumB = "b".repeat(64);
const now = "2026-08-02T00:00:00.000Z";

const sourceMaterial = {
  id: "src-motion",
  courseId: "course-physics",
  chapterId: "chapter-kinematics",
  sourceType: "markdown" as const,
  title: "Kinematika",
  canonicalUriOrR2Key: "sources/course-physics/kinematics.md",
  version: 1,
  checksum: checksumA,
  status: "active" as const,
  creatorId: "pengguna-tutor",
  createdAt: now,
  updatedAt: now,
};

const sourceText = "Kecepatan adalah perubahan posisi terhadap waktu.";
const sourceChunk = {
  id: "chunk-motion-1",
  sourceMaterialId: sourceMaterial.id,
  sourceVersion: 1,
  content: sourceText.slice(0, 28),
  sectionLocator: "Bab 1 > Kecepatan",
  startOffset: 0,
  endOffset: 28,
  checksum: checksumB,
  embeddingEligible: true,
  createdAt: now,
  updatedAt: now,
};

const baseIdea = {
  id: "idea-velocity",
  courseId: "course-physics",
  chapterId: "chapter-kinematics",
  conceptId: "concept-velocity",
  stableKey: "course-physics:chapter-kinematics:velocity",
  code: "KIN-VELOCITY",
  canonicalStatement: "Kecepatan adalah perubahan posisi terhadap waktu.",
  conciseExplanation: "Kecepatan mengukur laju perubahan posisi.",
  knowledgeKind: "definition" as const,
  instructionalRole: "core" as const,
  difficultyMetadata: { level: "introductory" as const },
  version: 1,
  status: "published" as const,
  schemaVersion: "idea.v1",
  semanticHash: checksumA,
  generationHash: checksumB,
  sourcePolicy: "source_grounded" as const,
  creatorId: "pengguna-tutor",
  createdAt: now,
  updatedAt: now,
};

const provenance = {
  id: "prov-velocity-1",
  ideaId: baseIdea.id,
  sourceChunkId: sourceChunk.id,
  provenanceRole: "primary" as const,
  startOffset: 0,
  endOffset: 28,
  sourceChecksum: checksumB,
};

function idea(overrides: Partial<Idea> = {}): Idea {
  return { ...baseIdea, ...overrides };
}

function relation(overrides: Partial<Parameters<typeof ideaRelationSchema.parse>[0]> = {}) {
  return {
    id: "rel-1",
    sourceIdeaId: "idea-velocity",
    targetIdeaId: "idea-position",
    relationType: "prerequisite" as const,
    version: 1,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("Plan 003 source and Idea domain contracts", () => {
  it("accepts source material, exact source chunk offsets, and a single-source Idea", () => {
    expect(sourceMaterialSchema.safeParse(sourceMaterial).success).toBe(true);
    const parsedChunk = sourceChunkSchema.parse(sourceChunk);
    expect(hasExactSourceChunkOffsets(sourceText, parsedChunk)).toBe(true);

    const publication = ideaPublicationSchema.parse({ idea: idea(), provenance: [provenance] });
    expect(publication.idea.stableKey).toContain("course-physics");
    expect(provenanceMatchesChunk(publication.provenance[0], parsedChunk)).toBe(true);
  });

  it("accepts a multi-source Idea and a cross-concept relation", () => {
    const secondChunk = sourceChunkSchema.parse({
      ...sourceChunk,
      id: "chunk-motion-2",
      content: "perubahan posisi",
      startOffset: 17,
      endOffset: 33,
      checksum: checksumA,
    });
    const secondProvenance = {
      ...provenance,
      id: "prov-velocity-2",
      sourceChunkId: secondChunk.id,
      startOffset: secondChunk.startOffset,
      endOffset: secondChunk.endOffset,
      sourceChecksum: secondChunk.checksum,
      provenanceRole: "supporting" as const,
    };
    const multiSource = ideaPublicationSchema.parse({ idea: idea(), provenance: [provenance, secondProvenance] });
    expect(multiSource.provenance).toHaveLength(2);

    const crossConcept = ideaRelationGraphSchema.parse([
      relation({ sourceIdeaId: "idea-velocity", targetIdeaId: "idea-position", relationType: "related" }),
    ]);
    expect(crossConcept[0].relationType).toBe("related");
  });

  it("accepts tutor-authored provenance only with an accountable curator", () => {
    const tutorAuthored = idea({ sourcePolicy: "tutor_authored", curatorId: "pengguna-kurator" });
    const parsed = ideaPublicationSchema.parse({
      idea: tutorAuthored,
      provenance: [
        {
          ...provenance,
          provenanceRole: "tutor_authored",
          note: "Disusun tutor untuk menjembatani dua konsep.",
        },
      ],
    });
    expect(parsed.idea.curatorId).toBe("pengguna-kurator");
  });

  it("rejects unknown fields, duplicate stable keys, and invalid Idea status", () => {
    expect(ideaSchema.safeParse({ ...idea(), unexpected: true }).success).toBe(false);
    expect(
      uniqueIdeaStableKeysSchema.safeParse([idea(), idea({ id: "idea-velocity-copy" })]).success,
    ).toBe(false);
    expect(ideaSchema.safeParse(idea({ status: "active" as never })).success).toBe(false);
  });

  it("rejects a published source-grounded Idea without provenance", () => {
    expect(ideaPublicationSchema.safeParse({ idea: idea(), provenance: [] }).success).toBe(false);
  });

  it("rejects self-relations and prerequisite cycles", () => {
    expect(ideaRelationSchema.safeParse(relation({ sourceIdeaId: "idea-same", targetIdeaId: "idea-same" })).success).toBe(
      false,
    );
    expect(
      ideaRelationGraphSchema.safeParse([
        relation({ id: "rel-a", sourceIdeaId: "idea-a", targetIdeaId: "idea-b" }),
        relation({ id: "rel-b", sourceIdeaId: "idea-b", targetIdeaId: "idea-a" }),
      ]).success,
    ).toBe(false);
  });

  it("accepts a typed dependency and applies deterministic freshness transitions", () => {
    const dependency = productDependencySchema.parse({
      id: "dep-idea-material",
      upstreamEntityType: "idea",
      upstreamEntityId: "idea-velocity",
      upstreamVersion: 1,
      upstreamHash: checksumA,
      downstreamEntityType: "learning_material",
      downstreamEntityId: "material-velocity",
      downstreamVersion: 1,
      downstreamHash: checksumB,
      freshness: "UP_TO_DATE",
      createdAt: now,
      updatedAt: now,
    });
    expect(transitionDependencyFreshness(dependency.freshness, { type: "upstream_hash_changed" })).toBe(
      "NEEDS_REVIEW",
    );
    expect(transitionDependencyFreshness("NEEDS_REVIEW", { type: "upstream_withdrawn" })).toBe("STALE");
    expect(
      transitionDependencyFreshness("STALE", {
        type: "downstream_revalidated",
        upstreamAvailable: true,
        validationPassed: true,
      }),
    ).toBe("UP_TO_DATE");
    expect(
      transitionDependencyFreshness("STALE", {
        type: "downstream_revalidated",
        upstreamAvailable: false,
        validationPassed: true,
      }),
    ).toBe("STALE");
  });

  it("keeps Idea identity, semantic hashes, and source checksums deterministic", () => {
    const identity = {
      courseId: "course-physics",
      chapterId: "chapter-kinematics",
      code: " KIN-VELOCITY ",
      provenance: [provenance],
    };
    expect(generateStableIdeaKey(identity)).toBe(generateStableIdeaKey({ ...identity, provenance: [...identity.provenance!] }));
    expect(computeIdeaSemanticHash(baseIdea)).toBe(computeIdeaSemanticHash({ ...baseIdea }));
    expect(computeIdeaGenerationHash({ b: 2, a: 1 })).toBe(computeIdeaGenerationHash({ a: 1, b: 2 }));
    expect(computeSourceChecksum("a\r\nb")).toBe(computeSourceChecksum(normalizeSourceText("a\r\nb")));
    expect(computeProvenanceChecksum(provenance)).toBe(computeProvenanceChecksum({ ...provenance }));
  });

  it("propagates upstream changes to dependency freshness and rejects prerequisite cycles", () => {
    const dependency = productDependencySchema.parse({
      id: "dep-idea-material-2",
      upstreamEntityType: "idea",
      upstreamEntityId: "idea-velocity",
      upstreamVersion: 1,
      upstreamHash: checksumA,
      downstreamEntityType: "learning_material",
      downstreamEntityId: "material-velocity",
      downstreamVersion: 1,
      downstreamHash: checksumB,
      freshness: "UP_TO_DATE",
      createdAt: now,
      updatedAt: now,
    });
    expect(applyDependencyChange([dependency], { upstreamEntityType: "idea", upstreamEntityId: "idea-velocity" }, {
      type: "upstream_hash_changed",
      upstreamHash: checksumB,
      upstreamVersion: 2,
    })[0].freshness).toBe("NEEDS_REVIEW");
    expect(applyDependencyChange([dependency], { upstreamEntityType: "idea", upstreamEntityId: "idea-velocity" }, {
      type: "upstream_withdrawn",
    })[0].freshness).toBe("STALE");
    expect(() => assertNoPrerequisiteCycle([
      relation({ id: "rel-cycle-a", sourceIdeaId: "idea-a", targetIdeaId: "idea-b" }),
      relation({ id: "rel-cycle-b", sourceIdeaId: "idea-b", targetIdeaId: "idea-a" }),
    ])).toThrow();
  });

  it("creates the additive domain tables and enforces self-relation and source-span constraints in PostgreSQL", async () => {
    const { client, testDb } = await createPostgresTestDb();
    try {

      const tableResult = await client.query<{ name: string }>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('mata_kuliah', 'bab', 'pendaftaran_murid', 'penugasan_tutor', 'sumber_materi', 'potongan_sumber', 'ide', 'asal_ide', 'relasi_ide', 'ketergantungan_produk', 'peta_id_legacy') ORDER BY table_name",
      );
      expect(tableResult.rows.map((row) => String(row.name))).toEqual([
        "asal_ide",
        "bab",
        "ide",
        "ketergantungan_produk",
        "mata_kuliah",
        "pendaftaran_murid",
        "penugasan_tutor",
        "peta_id_legacy",
        "potongan_sumber",
        "relasi_ide",
        "sumber_materi",
      ]);

      await testDb.insert(schema.user).values({ id: "user-idea-db", name: "Idea Tutor", email: "idea-db@example.test", emailVerified: true, role: "teacher" });
      await testDb.insert(schema.pengguna).values({ id: "user-idea-db", status: "active" });
      await testDb.insert(schema.mataKuliah).values({ id: "mk-idea-db", code: "FIS-DB", title: "Fisika", status: "active" });
      await testDb.insert(schema.bab).values({ id: "bab-idea-db", mataKuliahId: "mk-idea-db", code: "BAB-1", title: "Gerak", orderIndex: 1, status: "active" });
      await testDb.insert(schema.ide).values({ id: "idea-idea-db", mataKuliahId: "mk-idea-db", babId: "bab-idea-db", stableKey: "stable-idea-db", code: "IDE-1", canonicalStatement: "Pernyataan", conciseExplanation: "Penjelasan", difficultyMetadata: { level: "introductory" }, version: 1, status: "draft", sourcePolicy: "source_grounded", schemaVersion: "idea.v1", semanticHash: checksumA, generationHash: checksumB, creatorId: "user-idea-db" });
      await testDb.insert(schema.sumberMateri).values({ id: "source-idea-db", mataKuliahId: "mk-idea-db", sourceType: "markdown", title: "Source", canonicalUriOrR2Key: "sources/idea-db.md", version: 1, checksum: checksumA, status: "active", creatorId: "user-idea-db" });
      await testDb.insert(schema.potonganSumber).values({ id: "chunk-idea-db", sumberMateriId: "source-idea-db", sourceVersion: 1, content: "Pernyataan", startOffset: 0, endOffset: 10, checksum: checksumB, embeddingEligible: true });

      await expect(testDb.insert(schema.potonganSumber).values({ id: "chunk-invalid", sumberMateriId: "source-idea-db", sourceVersion: 1, content: "Invalid", startOffset: 10, endOffset: 10, checksum: checksumB, embeddingEligible: true }).execute()).rejects.toThrow();
      await expect(testDb.insert(schema.relasiIde).values({ id: "relation-invalid", sourceIdeaId: "idea-idea-db", targetIdeaId: "idea-idea-db", relationType: "related", version: 1, status: "active" }).execute()).rejects.toThrow();
    } finally {
      await client.close();
    }
  }, 60000);
});
