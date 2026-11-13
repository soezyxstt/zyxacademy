import { db } from "@/db";
import {
  websiteMaterials,
  websiteMaterialVersions,
  chapters,
  knowledgeObjects,
  masterTeachingDocuments,
  vectorSyncQueue,
} from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { compileMarkdownToAST, compileMarkdown } from "./markdown-compiler";
import { validateAST, WebsiteMaterialAST, CompiledMaterial, CompilerResult } from "./ast-validator";
import { verifyKOCoverage } from "./ko-coverage-auditor";
import { buildTermIndex } from "./term-index";
import { buildConceptGraph } from "./graph-trace";
import { randomUUID, createHash } from "crypto";
import { dualWriteMaterialPublication } from "@/lib/migrasi/repository-kompatibilitas";
import { articleDocumentSchema } from "@/lib/materials/article-contract";
import { evaluateArticleQuality, QualityGateResult } from "@/lib/materials/quality-gates";
import { dispatchVectorSync } from "@/lib/vector-sync-dispatch";

// ─── UTILITY: CALCULATE GENERATION HASH ──────────────────────────────────────

/**
 * Calculates a stable SHA-256 hash of all active Knowledge Objects within a chapter.
 * Used for staleness detection.
 */
export async function calculateGenerationHash(chapterId: string): Promise<string> {
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.chapterId, chapterId),
        eq(knowledgeObjects.status, "active")
      )
    )
    .orderBy(asc(knowledgeObjects.learningOrder));

  const hash = createHash("sha256");
  activeKOs.forEach(ko => {
    hash.update(`${ko.id}:${ko.content}`);
  });
  return hash.digest("hex");
}

// ─── UTILITY: GENERATE STABLE SLUGS ─────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── CORE STORAGE SERVER ACTION ─────────────────────────────────────────────

interface SaveResult {
  materialId: string;
  versionNumber: number;
  compiledStatus: "success" | "failed";
  compileError?: string;
}

function validateStoredArticleQuality(structuredContent: unknown): QualityGateResult {
  const articleCandidate = (structuredContent as { articleDocument?: unknown } | null)?.articleDocument;
  if (!articleCandidate) {
    return {
      passed: false,
      score: 0,
      issues: [{ code: "ARTICLE_CONTRACT_MISSING", message: "Material Compiler V2 requires an approved article document." }],
      metrics: { requiredCoveragePercent: 0, traceableBlockPercent: 0 },
    };
  }
  const parsed = articleDocumentSchema.safeParse(articleCandidate);
  if (!parsed.success) {
    return {
      passed: false,
      score: 0,
      issues: [{ code: "ARTICLE_CONTRACT_INVALID", message: parsed.error.issues[0]?.message ?? "article document is invalid" }],
      metrics: { requiredCoveragePercent: 0, traceableBlockPercent: 0 },
    };
  }
  return evaluateArticleQuality(parsed.data);
}

function assertStoredArticleQuality(structuredContent: unknown): void {
  const quality = validateStoredArticleQuality(structuredContent);
  if (!quality.passed) {
    throw new Error(`Material Compiler V2 quality gates blocked publication: ${quality.issues.map((entry) => entry.code).join(",")}`);
  }
}

/**
 * Compiles canonical Markdown and saves it to website_materials & version history.
 */
export async function saveWebsiteMaterial(
  chapterId: string,
  markdown: string,
  authorId: string,
  changeSummary?: string,
  isAiGenerated: boolean = false,
  forcePublish: boolean = false
): Promise<SaveResult> {
  // 1. Fetch chapter to obtain parent course
  const [chapterRecord] = await db
    .select()
    .from(chapters)
    .where(eq(chapters.id, chapterId));

  if (!chapterRecord) {
    throw new Error(`Chapter not found with ID: ${chapterId}`);
  }

  // 2. Fetch active KOs to get source MTD reference
  const activeKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        eq(knowledgeObjects.chapterId, chapterId),
        eq(knowledgeObjects.status, "active")
      )
    );

  if (activeKOs.length === 0) {
    throw new Error(`No active Knowledge Objects found for Chapter: ${chapterId}`);
  }

  const mtdId = activeKOs[0].mtdId;

  const [mtdRecord] = await db
    .select()
    .from(masterTeachingDocuments)
    .where(eq(masterTeachingDocuments.id, mtdId));

  if (!mtdRecord) {
    throw new Error(`Master Teaching Document reference not found: ${mtdId}`);
  }

  // 3. Compute generation hash
  const generationHash = await calculateGenerationHash(chapterId);

  // 4. Try compile Markdown to AST
  let structuredContent: any = null;
  let compiledStatus: "success" | "failed" = "success";
  let compileError: string | undefined = undefined;

  const compilerVersion = "2.1.0";
  const schemaVersion = "1.0.0";
  let compilerResult: CompilerResult;

  try {
    compilerResult = compileMarkdown(markdown, chapterId, chapterRecord.courseId);
  } catch (err: any) {
    compiledStatus = "failed";
    compileError = err.message || "Unknown compilation error";

    if (forcePublish) {
      throw new Error(`Compilation failed. Publishing blocked: ${compileError}`);
    }

    // Fallback stub compiler result
    compilerResult = {
      ast: {
        schemaVersion,
        compilerVersion,
        chapterId,
        courseId: chapterRecord.courseId,
        documentMetadata: {
          title: chapterRecord.title,
          lastModified: new Date().toISOString(),
          estimatedReadingTimeMin: 0,
        },
        blocks: [],
      },
      diagnostics: [
        {
          severity: "error",
          code: "COMPILATION_FAILED",
          message: compileError || "Unknown compilation error",
        }
      ],
      stats: {
        conceptCount: 0,
        formulaCount: 0,
        glossaryCount: 0,
        visualCount: 0,
        graphCount: 0,
        diagramCount: 0,
        flowchartCount: 0,
        readingTime: 0,
        averageConceptLength: 0,
        averageFormulaLength: 0,
        averageVisualDistance: 0,
        averageGlossaryReferenceCount: 0,
        quality: {
          score: 0,
          breakdown: {
            glossaryCoverage: 0,
            visualCoverage: 0,
            formulaAtomization: 0,
            visualReferenceCoverage: 0,
          }
        }
      }
    };
  }

  const compiledMaterial: CompiledMaterial = {
    markdown,
    compilerResult,
    compiledAt: new Date().toISOString(),
    compilerVersion,
    schemaVersion,
  };

  structuredContent = compiledMaterial;

  // Run KO Coverage Auditing
  let coverageStatus: "not_verified" | "fully_covered" | "partially_covered" | "coverage_failed" = "not_verified";
  let coverageReport: any = {
    totalKOs: 0,
    mappedKOs: 0,
    missingKOs: [],
    formulaFailures: [],
    issues: [],
    verifiedAt: "",
  };

  if (compiledStatus === "success" && compilerResult.ast) {
    try {
      const verification = await verifyKOCoverage(chapterId, compilerResult.ast);
      coverageStatus = verification.status;
      coverageReport = verification.report;
    } catch (verErr: any) {
      console.error(`[KO Coverage] Verification failed with error:`, verErr);
      coverageStatus = "coverage_failed";
      coverageReport.issues = [verErr.message || "Unknown verification error"];
    }
  }

  // 5. Execute DB transaction to update materials and append to version logs
  return await db.transaction(async tx => {
    // Check if material already exists
    const [existingMaterial] = await tx
      .select()
      .from(websiteMaterials)
      .where(eq(websiteMaterials.chapterId, chapterId));

    let materialId = "";
    let nextVersionNumber = 1;

    if (existingMaterial) {
      materialId = existingMaterial.id;
      nextVersionNumber = existingMaterial.contentVersion + 1;

      await tx
        .update(websiteMaterials)
        .set({
          canonicalMarkdown: markdown,
          structuredContent,
          generationHash,
          isStale: false, // Reset stale flag on edit
          contentVersion: nextVersionNumber,
          coverageStatus,
          coverageReport,
          updatedAt: new Date(),
        })
        .where(eq(websiteMaterials.id, materialId));
    } else {
      materialId = `web-mat-${randomUUID()}`;
      await tx.insert(websiteMaterials).values({
        id: materialId,
        courseId: chapterRecord.courseId,
        chapterId,
        sourceMtdId: mtdId,
        sourceMtdVersion: mtdRecord.version,
        isStale: false,
        generationHash,
        title: chapterRecord.title,
        slug: slugify(chapterRecord.title),
        canonicalMarkdown: markdown,
        structuredContent,
        contentVersion: nextVersionNumber,
        status: "draft",
        coverageStatus,
        coverageReport,
      });
    }

    // Log history version
    await tx.insert(websiteMaterialVersions).values({
      id: `web-ver-${randomUUID()}`,
      materialId,
      versionNumber: nextVersionNumber,
      canonicalMarkdown: markdown,
      structuredContent,
      authorId: authorId || null,
      changeSummary: changeSummary || (isAiGenerated ? "AI Generation Draft" : "Tutor Revision"),
      isAiGenerated,
    });

    return {
      materialId,
      versionNumber: nextVersionNumber,
      compiledStatus,
      compileError,
    };
  });
}

// ─── RETRIEVAL QUERIES ──────────────────────────────────────────────────────

export async function getWebsiteMaterial(chapterId: string) {
  const [material] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.chapterId, chapterId));
  return material || null;
}

export async function getVersionHistory(materialId: string) {
  return await db
    .select()
    .from(websiteMaterialVersions)
    .where(eq(websiteMaterialVersions.materialId, materialId))
    .orderBy(desc(websiteMaterialVersions.versionNumber));
}

// ─── REVERSION ACTION ───────────────────────────────────────────────────────

export async function revertToVersion(
  materialId: string,
  versionNumber: number,
  authorId: string
): Promise<SaveResult> {
  const [targetVersion] = await db
    .select()
    .from(websiteMaterialVersions)
    .where(
      and(
        eq(websiteMaterialVersions.materialId, materialId),
        eq(websiteMaterialVersions.versionNumber, versionNumber)
      )
    );

  if (!targetVersion) {
    throw new Error(`Version ${versionNumber} not found for Material: ${materialId}`);
  }

  const [materialRecord] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.id, materialId));

  if (!materialRecord) {
    throw new Error(`Material record not found with ID: ${materialId}`);
  }

  return await saveWebsiteMaterial(
    materialRecord.chapterId,
    targetVersion.canonicalMarkdown,
    authorId,
    `Reverted to Version ${versionNumber}`,
    targetVersion.isAiGenerated
  );
}

// ─── WORKFLOW TRANSITIONS & STALENESS AUDITING ─────────────────────────────

export async function requestReview(chapterId: string): Promise<void> {
  const [material] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.chapterId, chapterId));

  if (!material) {
    throw new Error(`Material draft not found for Chapter: ${chapterId}`);
  }

  // Compiler validate is required to move to review
  const content = material.structuredContent as any;
  const ast = content?.compilerResult?.ast || content;
  const validation = validateAST(ast);
  if (!validation.success) {
    throw new Error(
      `Cannot request review. Material validation failed:\n` +
        validation.errors.map(e => `  [${e.path}]: ${e.message}`).join("\n")
    );
  }
  assertStoredArticleQuality(content);

  await db
    .update(websiteMaterials)
    .set({
      status: "review",
      updatedAt: new Date(),
    })
    .where(eq(websiteMaterials.chapterId, chapterId));
}

export async function rejectDraft(chapterId: string): Promise<void> {
  await db
    .update(websiteMaterials)
    .set({
      status: "draft",
      updatedAt: new Date(),
    })
    .where(eq(websiteMaterials.chapterId, chapterId));
}

export async function archiveChapterMaterial(chapterId: string): Promise<void> {
  await db
    .update(websiteMaterials)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(websiteMaterials.chapterId, chapterId));
}

/**
 * Performs Admin publish sign-off, checks strict quality gates, 
 * and queues active KOs to the Vector sync outbox.
 */
export async function approveAndPublish(
  chapterId: string,
  _adminUserId: string
): Promise<void> {
  const [material] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.chapterId, chapterId));

  if (!material) {
    throw new Error(`Material not found for Chapter: ${chapterId}`);
  }

  // 1. Strict Quality Gates Checks
  // Re-compile to guarantee compiler success
  let compiledAST: WebsiteMaterialAST;
  try {
    compiledAST = await compileMarkdownToAST(
      material.canonicalMarkdown,
      chapterId,
      material.courseId
    );
  } catch (err: any) {
    throw new Error(`Publish failed. Compiler error: ${err.message}`);
  }

  // Verify Zod and semantic checks strictly
  const validation = validateAST(compiledAST);
  if (!validation.success) {
    throw new Error(
      `Publish blocked. Strict quality check failures:\n` +
        validation.errors.map(e => `  [${e.path}]: ${e.message}`).join("\n")
    );
  }

  assertStoredArticleQuality(material.structuredContent);

  // E3: build the term index for the interactive material popover.
  const termIndex = await buildTermIndex(chapterId);

  // 2. Perform DB updates and Transactional Outbox queues
  await db.transaction(async tx => {
    // Set status to published
    await tx
      .update(websiteMaterials)
      .set({
        status: "published",
        isStale: false,
        termIndex,
        updatedAt: new Date(),
      })
      .where(eq(websiteMaterials.chapterId, chapterId));

    await dualWriteMaterialPublication(tx, {
      id: material.id,
      courseId: material.courseId,
      chapterId: material.chapterId,
      title: material.title,
      slug: material.slug,
      canonicalMarkdown: material.canonicalMarkdown,
      generationHash: material.generationHash,
      status: "published",
      creatorId: _adminUserId,
      version: material.contentVersion,
      publishedAt: new Date(),
    }, _adminUserId);

    // Fetch active KOs of the chapter to queue them for vector sync
    const activeKOs = await tx
      .select()
      .from(knowledgeObjects)
      .where(
        and(
          eq(knowledgeObjects.chapterId, chapterId),
          eq(knowledgeObjects.status, "active")
        )
      );

    // Write upsert payloads to vector_sync_queue for each KO
    for (const ko of activeKOs) {
      const payloadText = `Title: ${ko.title}\nConcept: ${ko.conceptName}\nContent: ${ko.content}`;
      const payloadMetadata = {
        courseId: ko.courseId,
        chapterId: ko.chapterId,
        conceptId: ko.conceptId,
        type: ko.type,
        bloomLevel: ko.bloomLevel,
        difficulty: ko.difficulty,
        importance: ko.importance,
        tags: ko.tags,
      };

      await tx.insert(vectorSyncQueue).values({
        id: `sync-${randomUUID()}`,
        courseId: ko.courseId,
        koId: ko.id,
        action: "upsert",
        payload: { entityId: ko.id, version: ko.version, legacyKind: "knowledge_object", text: payloadText, metadata: payloadMetadata },
        status: "pending",
        attempts: 0,
      });
    }
  });

  dispatchVectorSync(material.courseId);

  // E5: rebuild the concept-graph rollup for this course (deterministic, no AI).
  await buildConceptGraph(material.courseId).catch((err) => {
    console.error("buildConceptGraph failed after publish:", err);
  });
}

/**
 * Triggers chapter staleness auditing compared to live KO states.
 * Sets isStale = true if current KO state hash differs from stored hash.
 */
export async function auditMaterialStaleness(chapterId: string): Promise<boolean> {
  const [material] = await db
    .select()
    .from(websiteMaterials)
    .where(eq(websiteMaterials.chapterId, chapterId));

  if (!material) return false;

  const currentKOStateHash = await calculateGenerationHash(chapterId);
  const mismatch = currentKOStateHash !== material.generationHash;

  if (mismatch && !material.isStale) {
    await db
      .update(websiteMaterials)
      .set({
        isStale: true,
        updatedAt: new Date(),
      })
      .where(eq(websiteMaterials.chapterId, chapterId));
  }

  return mismatch;
}
