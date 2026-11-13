import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  chapters,
  courses,
  ide,
  imporBundle,
  itemImporBundle,
  sumberMateri,
  user,
} from "@/db/schema";
import { computeIdeaBundleChecksum, serializeDeterministically, validateIdeaBundle, type IdeaBundleManifest } from "@/lib/bundle/idea-bundle-v2";
import { readSecureZip, ZipSecurityError } from "@/lib/bundle/zip-reader";
import { sha256Bytes, sha256Text } from "@/lib/bundle/validator";
import type { IdeaBundleStageInput } from "@/lib/bundle/staging";
import { parseCliArgs, requiredCliArg, writeArtifact } from "@/lib/staging/migration-ledger";
import { assertStagingEnvironment, parseEnvFile } from "@/lib/staging/staging-guard";

type JsonRecord = Record<string, unknown>;
type FixtureFiles = Map<string, Uint8Array>;

const FIXTURE_ROOT = join(process.cwd(), "tests", "fixtures", "bundles", "idea-v2");
const FIXTURE_PATHS = [
  "manifest.json",
  "sources/kinematika.md",
  "entities/source-materials.json",
  "entities/source-chunks.json",
  "entities/ideas.json",
  "entities/provenance.json",
  "entities/relations.json",
];

function json<T>(files: FixtureFiles, path: string): T {
  return JSON.parse(new TextDecoder().decode(files.get(path))) as T;
}

function writeJson(files: FixtureFiles, path: string, value: unknown): void {
  files.set(path, new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`));
}

function cloneFiles(files: FixtureFiles): FixtureFiles {
  return new Map([...files.entries()].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
}

function fixtureFiles(): FixtureFiles {
  return new Map(FIXTURE_PATHS.map((path) => [path, new Uint8Array(readFileSync(join(FIXTURE_ROOT, path)))]));
}

function refreshChecksums(files: FixtureFiles): void {
  const manifest = json<IdeaBundleManifest>(files, "manifest.json");
  for (const entityFile of manifest.entityFiles) {
    const bytes = files.get(entityFile.path);
    if (!bytes) throw new Error(`fixture entity file missing: ${entityFile.path}`);
    entityFile.checksum = sha256Bytes(bytes);
    const entities = json<Array<{ id: string }>>(files, entityFile.path);
    entityFile.stableIds = entities.map((entity) => entity.id);
  }
  const sourceVersion = manifest.sourceVersions[0];
  const sourceBytes = files.get(sourceVersion.contentPath);
  if (!sourceBytes) throw new Error(`fixture source missing: ${sourceVersion.contentPath}`);
  sourceVersion.checksum = sha256Bytes(sourceBytes);
  manifest.bundleChecksum = computeIdeaBundleChecksum(manifest, files);
  writeJson(files, "manifest.json", manifest);
}

function archive(files: FixtureFiles): Uint8Array {
  return zipSync(Object.fromEntries([...files.entries()]));
}

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

function prepareValidFixture(runId: string, courseId: string, chapterId: string, actorId: string): FixtureFiles {
  const files = fixtureFiles();
  const prefix = `p006-${safeSegment(runId)}`;
  const sourceId = `${prefix}-source`;
  const chunkId = `${prefix}-chunk`;
  const ideaId = `${prefix}-idea`;
  const provenanceId = `${prefix}-provenance`;
  const manifest = json<IdeaBundleManifest>(files, "manifest.json");
  const source = json<JsonRecord[]>(files, "entities/source-materials.json")[0];
  const chunk = json<JsonRecord[]>(files, "entities/source-chunks.json")[0];
  const idea = json<JsonRecord[]>(files, "entities/ideas.json")[0];
  const provenance = json<JsonRecord[]>(files, "entities/provenance.json")[0];

  manifest.bundleId = `${prefix}-bundle`;
  manifest.courseId = courseId;
  manifest.creatorId = actorId;
  manifest.curatorId = actorId;
  manifest.createdAt = new Date().toISOString();
  manifest.sourceVersions[0].sourceMaterialId = sourceId;
  source.id = sourceId;
  source.courseId = courseId;
  source.chapterId = chapterId;
  source.creatorId = actorId;
  source.canonicalUriOrR2Key = `staging/${prefix}/kinematika.md`;
  chunk.id = chunkId;
  chunk.sourceMaterialId = sourceId;
  chunk.checksum = sha256Text(String(chunk.content));
  idea.id = ideaId;
  idea.courseId = courseId;
  idea.chapterId = chapterId;
  idea.stableKey = `${courseId}:${chapterId}:${prefix}:velocity`;
  idea.code = `KIN-VELOCITY-${sha256Text(runId).slice(0, 10).toUpperCase()}`;
  idea.creatorId = actorId;
  idea.curatorId = actorId;
  provenance.id = provenanceId;
  provenance.ideaId = ideaId;
  provenance.sourceChunkId = chunkId;
  provenance.sourceChecksum = String(chunk.checksum);
  writeJson(files, "entities/source-materials.json", [source]);
  writeJson(files, "entities/source-chunks.json", [chunk]);
  writeJson(files, "entities/ideas.json", [idea]);
  writeJson(files, "entities/provenance.json", [provenance]);
  writeJson(files, "entities/relations.json", []);
  writeJson(files, "manifest.json", manifest);
  refreshChecksums(files);
  return files;
}

function stageInput(files: FixtureFiles, bytes: Uint8Array, runId: string, requestedBy: string): IdeaBundleStageInput {
  const archiveData = readSecureZip(bytes);
  const validation = validateIdeaBundle(archiveData);
  if (!validation.success) throw new Error(validation.issues.map((issue) => issue.code).join(","));
  const bundle = validation.data;
  const items = [
    ...bundle.entities.sourceMaterials.map((entity) => ({ entityType: "source_material", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.sourceChunks.map((entity) => ({ entityType: "source_chunk", entityId: entity.id, entityVersion: entity.sourceVersion, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.ideas.map((entity) => ({ entityType: "idea", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.provenance.map((entity) => ({ entityType: "provenance", entityId: entity.id, entityVersion: 1, entityHash: sha256Text(serializeDeterministically(entity)) })),
    ...bundle.entities.relations.map((entity) => ({ entityType: "relation", entityId: entity.id, entityVersion: entity.version, entityHash: sha256Text(serializeDeterministically(entity)) })),
  ];
  return {
    runId,
    bundleId: bundle.manifest.bundleId,
    courseId: bundle.manifest.courseId,
    schemaVersion: 2,
    checksum: bundle.manifest.bundleChecksum,
    bytes,
    requestedBy,
    items,
    validationReport: {
      valid: true,
      reasonCodes: [],
      fileCount: archiveData.entries.filter((entry) => !entry.isDirectory).length,
      entityCount: items.length,
      sourceCount: bundle.entities.sourceMaterials.length,
      relationCount: bundle.entities.relations.length,
      warnings: [],
    },
    filename: `${bundle.manifest.bundleId}.zip`,
  };
}

function reasonCodeFor(bytes: Uint8Array): string {
  try {
    const result = validateIdeaBundle(readSecureZip(bytes));
    return result.success ? "VALID" : result.issues[0].code;
  } catch (error) {
    return error instanceof ZipSecurityError ? error.code : error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
  }
}

async function main(): Promise<void> {
  const args = parseCliArgs();
  const runId = requiredCliArg(args, "run-id");
  const fixtureMode = typeof args.fixture === "string" ? args.fixture : "all";
  const report: JsonRecord = { planNumber: "006", runId, fixture: fixtureMode, status: "blocked" };
  try {
    assertStagingEnvironment({ productionEnv: parseEnvFile(join(process.cwd(), ".env.prod")), requiredResources: ["database", "authUrl"] });
    process.env.FEATURE_IDEA_BUNDLE_V2 = "1";
    process.env.STAGING_BUNDLE_WRANGLER_STORAGE = "1";
    const [{ publishIdeaBundle, reconcilePublishedIdeaBundle }, { reviewIdeaBundle, upsertIdeaItemReview, stageIdeaBundle }] = await Promise.all([
      import("@/lib/bundle/publication"),
      import("@/lib/bundle/staging"),
    ]);
    const [admin] = await db.select({ id: user.id }).from(user).where(eq(user.role, "admin")).limit(1);
    const courseCandidates = await db.select({ id: courses.id }).from(courses).limit(20);
    let course: { id: string } | undefined;
    let chapter: { id: string } | undefined;
    for (const candidate of courseCandidates) {
      const [candidateChapter] = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.courseId, candidate.id)).limit(1);
      if (candidateChapter && candidate.id !== "tutorial-pka") {
        course = candidate;
        chapter = candidateChapter;
        break;
      }
    }
    if (!admin || !course || !chapter) throw new Error("STAGING_IDEA_BUNDLE_CHAPTER_PREREQUISITE_MISSING");
    console.log(JSON.stringify({ phase: "fixture_prerequisites", courseId: course.id, chapterId: chapter.id }));

    const validFiles = prepareValidFixture(runId, course.id, chapter.id, admin.id);
    const validBytes = archive(validFiles);
    const validValidation = validateIdeaBundle(readSecureZip(validBytes));
    if (!validValidation.success) throw new Error(`STAGING_VALID_FIXTURE_INVALID:${validValidation.issues.map((issue) => `${issue.code}:${issue.message}`).join("|")}`);
    const input = stageInput(validFiles, validBytes, runId, admin.id);
    const beforeImports = await db.select({ id: imporBundle.id }).from(imporBundle);
    const staged = await stageIdeaBundle(input);
    const afterFirstStage = await db.select({ id: imporBundle.id }).from(imporBundle);
    const afterFirstItems = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, staged.importId));
    const retry = await stageIdeaBundle(input);
    const afterRetryImports = await db.select({ id: imporBundle.id }).from(imporBundle);
    const afterRetryItems = await db.select({ id: itemImporBundle.id }).from(itemImporBundle).where(eq(itemImporBundle.imporBundleId, staged.importId));
    if (retry.created || afterRetryImports.length !== afterFirstStage.length || afterRetryItems.length !== afterFirstItems.length) {
      throw new Error("STAGING_IDEA_BUNDLE_IDEMPOTENCY_FAILED");
    }

    const conflictFiles = cloneFiles(validFiles);
    const conflictManifest = json<IdeaBundleManifest>(conflictFiles, "manifest.json");
    conflictManifest.createdAt = new Date(Date.now() + 1000).toISOString();
    writeJson(conflictFiles, "manifest.json", conflictManifest);
    refreshChecksums(conflictFiles);
    let conflictCode = "NONE";
    try {
      await stageIdeaBundle(stageInput(conflictFiles, archive(conflictFiles), runId, admin.id));
    } catch (error) {
      conflictCode = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    }
    if (conflictCode !== "IDEA_BUNDLE_CONFLICT") throw new Error(`STAGING_CONFLICT_EXPECTATION_FAILED:${conflictCode}`);

    const expectedRevision = input.checksum;
    for (const idea of validValidation.data.entities.ideas) {
      await upsertIdeaItemReview({ importId: staged.importId, reviewerId: admin.id, expectedRevision, ideaId: idea.id, status: "approved", notes: "Explicit staging fixture decision" });
    }
    const review = await reviewIdeaBundle({ importId: staged.importId, reviewerId: admin.id, expectedRevision, decision: "approved", notes: "Plan 006 staging fixture" });
    process.env.STAGING_BUNDLE_FAILURE_TEST = "1";
    let failureCode = "NONE";
    try {
      await publishIdeaBundle({ importId: staged.importId, publishedBy: admin.id, expectedRevision, testFailureAfter: "ideas" });
    } catch (error) {
      failureCode = error instanceof Error ? error.message.split(":", 1)[0] : "UNKNOWN";
    } finally {
      delete process.env.STAGING_BUNDLE_FAILURE_TEST;
    }
    if (failureCode !== "IDEA_BUNDLE_TEST_FAILURE") throw new Error(`STAGING_PARTIAL_FAILURE_EXPECTATION_FAILED:${failureCode}`);
    const bundleIdeaIds = validValidation.data.entities.ideas.map((idea) => idea.id);
    const bundleSourceIds = validValidation.data.entities.sourceMaterials.map((source) => source.id);
    const [failedImport] = await db.select({ status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, staged.importId)).limit(1);
    const failedIdeas = await db.select({ id: ide.id }).from(ide).where(inArray(ide.id, bundleIdeaIds));
    const failedSources = await db.select({ id: sumberMateri.id }).from(sumberMateri).where(inArray(sumberMateri.id, bundleSourceIds));
    if (failedImport?.status !== "approved" || failedIdeas.length !== 0 || failedSources.length !== 0) throw new Error("STAGING_PARTIAL_PUBLICATION_ROLLBACK_FAILED");

    const published = await publishIdeaBundle({ importId: staged.importId, publishedBy: admin.id, expectedRevision });
    const reconcile = await reconcilePublishedIdeaBundle(staged.importId);
    if (!published.published || reconcile.publicationStatus !== "published" || reconcile.publishedItems !== afterFirstItems.length) {
      throw new Error("STAGING_VALID_PUBLICATION_EXPECTATION_FAILED");
    }

    const invalidFiles = cloneFiles(validFiles);
    invalidFiles.delete("sources/kinematika.md");
    const invalidMissingSourceManifest = json<IdeaBundleManifest>(invalidFiles, "manifest.json");
    invalidMissingSourceManifest.bundleChecksum = computeIdeaBundleChecksum(invalidMissingSourceManifest, invalidFiles);
    writeJson(invalidFiles, "manifest.json", invalidMissingSourceManifest);
    const invalidChecksumFiles = cloneFiles(validFiles);
    invalidChecksumFiles.set("entities/ideas.json", strToU8("[]\n"));
    const invalidChecksumManifest = json<IdeaBundleManifest>(invalidChecksumFiles, "manifest.json");
    invalidChecksumManifest.bundleChecksum = computeIdeaBundleChecksum(invalidChecksumManifest, invalidChecksumFiles);
    writeJson(invalidChecksumFiles, "manifest.json", invalidChecksumManifest);
    const duplicateFiles = cloneFiles(validFiles);
    const duplicateIdeas = json<JsonRecord[]>(duplicateFiles, "entities/ideas.json");
    duplicateIdeas.push({ ...duplicateIdeas[0], id: `${bundleIdeaIds[0]}-duplicate` });
    writeJson(duplicateFiles, "entities/ideas.json", duplicateIdeas);
    refreshChecksums(duplicateFiles);
    const invalidCases = {
      invalidPath: reasonCodeFor(zipSync({ "../manifest.json": strToU8("{}") })),
      invalidChecksum: reasonCodeFor(archive(invalidChecksumFiles)),
      missingSource: reasonCodeFor(archive(invalidFiles)),
      duplicateIdea: reasonCodeFor(archive(duplicateFiles)),
    };
    if (invalidCases.invalidPath !== "ZIP_PATH_TRAVERSAL" || invalidCases.invalidChecksum !== "BUNDLE_ENTITY_CHECKSUM_MISMATCH" || invalidCases.missingSource !== "BUNDLE_MISSING_SOURCE" || invalidCases.duplicateIdea !== "BUNDLE_DUPLICATE_STABLE_KEY") {
      throw new Error(`STAGING_INVALID_FIXTURE_EXPECTATION_FAILED:${JSON.stringify(invalidCases)}`);
    }

    report.status = "passed";
    report.prerequisites = { adminId: admin.id, courseId: course.id, chapterId: chapter.id };
    report.import = { importId: staged.importId, bundleId: staged.bundleId, checksum: staged.checksum, reviewStatus: review.status };
    report.idempotency = { beforeImportCount: beforeImports.length, afterFirstImportCount: afterFirstStage.length, afterRetryImportCount: afterRetryImports.length, retryCreated: retry.created };
    report.conflict = { code: conflictCode };
    report.partialPublishFailure = { code: failureCode, importStatusAfterRollback: failedImport?.status ?? null, publishedIdeasAfterRollback: failedIdeas.length, publishedSourcesAfterRollback: failedSources.length };
    report.publication = { result: published, reconcile };
    report.invalidFixtures = invalidCases;
    report.featureFlags = { FEATURE_IDEA_BUNDLE_V2: process.env.FEATURE_IDEA_BUNDLE_V2 };
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-006-result.json", report);
    console.log(JSON.stringify({ status: report.status, runId, importId: staged.importId, invalidCases, vectorJobCount: published.vectorJobCount }));
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.operatorTimestamp = new Date().toISOString();
    await writeArtifact(runId, "plan-006-result.json", report);
    console.error(JSON.stringify({ status: "blocked", runId, error: report.error }));
    process.exitCode = 1;
  }
}

void main();
