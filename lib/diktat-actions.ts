import { db } from "@/db";
import { diktats, masterTeachingDocuments, knowledgeObjects, knowledgeRelationships } from "@/db/schema";
import { generateDiktatStructure, DiktatStructure } from "./diktat-generator";
import { validateDiktat } from "./diktat-validator";
import { renderDiktatToHTML } from "./diktat-renderer";
import { auditDiktatStructure, applyDiktatRevisions } from "./diktat-auditor";
import { generateExamIntelligence } from "./diktat-exam-intelligence";
import { auditRenderedPDF } from "./diktat-pdf-auditor";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { storage } from "@/lib/storage";
import { env } from "@/lib/env";
import { canPublishDiktat } from "@/lib/diktat/audit-contracts";
import { joinKey, slugifySegment } from "@/lib/storage/keys";
import { generateAndSavePdfThumbnail } from "@/lib/thumbnail";

/**
 * Extracts the unique file key from an UploadThing CDN URL.
 */
export function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  if (url.includes("/api/storage/file/")) {
    const parts = url.split("/api/storage/file/");
    return parts[parts.length - 1];
  }
  const parts = url.split("/f/");
  return parts.length > 1 ? parts[1] : url;
}

/**
 * Action: Initiates a new Diktat compilation draft from selected chapters.
 */
export async function generateDiktatDraft(
  courseId: string,
  chapterIds: string[]
): Promise<{ success: boolean; diktatId?: string; errors?: string[] }> {
  try {
    // 1. Compile structured Diktat content JSON
    const compiledStructure = await generateDiktatStructure(courseId, chapterIds);

    // 2. Fetch primary MTD from Knowledge Objects in the selected chapters
    const activeKOs = await db
      .select()
      .from(knowledgeObjects)
      .where(and(inArray(knowledgeObjects.chapterId, chapterIds), eq(knowledgeObjects.status, "active")));

    if (activeKOs.length === 0) {
      return { success: false, errors: ["No active KOs found to link MTD information."] };
    }

    const mtdId = activeKOs[0].mtdId;
    const [mtdRecord] = await db
      .select()
      .from(masterTeachingDocuments)
      .where(eq(masterTeachingDocuments.id, mtdId));

    const sourceMtdVersion = mtdRecord ? mtdRecord.version : 1;

    // 3. Save Diktat draft to DB
    const diktatId = `dk-${randomUUID()}`;
    await db.insert(diktats).values({
      id: diktatId,
      courseId,
      sourceMtdId: mtdId,
      sourceMtdVersion,
      isStale: false,
      generationHash: compiledStructure.generationHash,
      title: compiledStructure.title,
      chapterIds,
      status: "draft",
      settings: {
        compiledStructure,
        tutorOverrides: {},
      },
    });

    return { success: true, diktatId };
  } catch (err: any) {
    return { success: false, errors: [err.message] };
  }
}

/**
 * Action: Saves a tutor text adjustment/override for a specific Diktat card block.
 * Overwrites are preserved during regenerations.
 */
export async function saveTutorDiktatOverride(
  diktatId: string,
  sectionKey: string, // e.g. "formula_ko-123"
  overrideData: any // e.g. { latex: "...", assumptions: ["..."] }
): Promise<{ success: boolean; errors?: string[] }> {
  const [diktat] = await db
    .select()
    .from(diktats)
    .where(eq(diktats.id, diktatId));

  if (!diktat) {
    return { success: false, errors: [`Diktat not found: ${diktatId}`] };
  }

  const currentSettings = (diktat.settings as any) || {};
  const currentOverrides = currentSettings.tutorOverrides || {};

  currentOverrides[sectionKey] = {
    ...currentOverrides[sectionKey],
    ...overrideData,
  };

  const updatedSettings = {
    ...currentSettings,
    tutorOverrides: currentOverrides,
  };

  await db
    .update(diktats)
    .set({
      settings: updatedSettings,
      updatedAt: new Date(),
    })
    .where(eq(diktats.id, diktatId));

  console.log(`[Tutor Action] Saved override for section ${sectionKey} inside Diktat ${diktatId}`);
  return { success: true };
}

/**
 * Compiles HTML to PDF using Puppeteer and uploads it to UploadThing.
 * Handles old file deletion (long-term storage strategy) and mock fallback execution.
 */
export async function executeDiktatPDFGeneration(
  diktatId: string
): Promise<{ success: boolean; fileUrl?: string; errors?: string[] }> {
  const [diktat] = await db
    .select()
    .from(diktats)
    .where(eq(diktats.id, diktatId));

  if (!diktat) {
    return { success: false, errors: [`Diktat not found: ${diktatId}`] };
  }

  const settings = (diktat.settings as any) || {};
  const structure = settings.compiledStructure;
  const overrides = settings.tutorOverrides || {};

  if (!structure) {
    return { success: false, errors: ["Missing compiled JSON structure inside Diktat settings."] };
  }

  // 1. Fetch source KOs for audit + enhanced validation
  const sourceKOs = await db
    .select()
    .from(knowledgeObjects)
    .where(
      and(
        inArray(knowledgeObjects.chapterId, structure.chapterIds),
        eq(knowledgeObjects.status, "active")
      )
    );

  // Build relationships map
  const relationshipRows = sourceKOs.length > 0
    ? await db
        .select()
        .from(knowledgeRelationships)
        .where(inArray(knowledgeRelationships.sourceKoId, sourceKOs.map(k => k.id)))
    : [];
  const relationshipsMap = new Map<string, string[]>();
  for (const rel of relationshipRows) {
    const list = relationshipsMap.get(rel.sourceKoId) || [];
    list.push(rel.targetKoId);
    relationshipsMap.set(rel.sourceKoId, list);
  }

  // 2. Academic Audit (deterministic always; AI if FEATURE_DIKTAT_AI=1)
  let auditedStructure: DiktatStructure = structure;
  const auditResult = await auditDiktatStructure(structure, sourceKOs);
  if (auditResult.issues.length > 0) {
    console.warn("[diktat-actions] Audit issues:", auditResult.issues.map(i => `[${i.severity}] ${i.description}`));
  }

  // 3. Apply safe AI revisions (gated)
  let revisionsApplied = 0;
  if (env.FEATURE_DIKTAT_AI === "1" && auditResult.proposedRevisions.length > 0) {
    auditedStructure = await applyDiktatRevisions(structure, auditResult.proposedRevisions, sourceKOs);
    revisionsApplied = auditResult.proposedRevisions.length;
  }

  // 4. Generate exam intelligence and attach to structure
  const examIntelligence = await generateExamIntelligence(auditedStructure, sourceKOs, relationshipsMap);
  const enrichedStructure: DiktatStructure = {
    ...auditedStructure,
    examIntelligence,
    auditResult: {
      status: auditResult.status,
      issueCount: auditResult.issues.length,
      revisionsApplied,
    },
  };

  // 5. Enhanced Quality Gates validation (now with semantic formula check)
  const validation = await validateDiktat(enrichedStructure, { sourceKOs });
  if (!validation.success) {
    return {
      success: false,
      errors: ["Quality validation checks failed:", ...validation.errors],
    };
  }

  // 6. Render structured layout to HTML
  const compiledHTML = renderDiktatToHTML(enrichedStructure, overrides);

  let pdfBuffer: Buffer;
  const rendererUrl = env.DIKTAT_RENDERER_URL;
  const rendererSecret = env.DIKTAT_RENDERER_SECRET;

  if (rendererUrl && rendererSecret) {
    const res = await fetch(`${rendererUrl}/render`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rendererSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ html: compiledHTML }),
    });
    if (!res.ok) {
      const text = await res.text();
      return {
        success: false,
        errors: [`PDF renderer worker failed (${res.status}): ${text}`],
      };
    }
    // Parse response defensively - deployed renderer might return JSON-serialized byte object
    const clonedRes = res.clone();
    try {
      const text = await clonedRes.text();
      if (text.trim().startsWith("{") && text.includes('"0":')) {
        const parsed = JSON.parse(text);
        const bytes = Object.keys(parsed)
          .map(Number)
          .sort((a, b) => a - b)
          .map(k => parsed[k]);
        pdfBuffer = Buffer.from(bytes);
      } else {
        pdfBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      pdfBuffer = Buffer.from(await res.arrayBuffer());
    }
  } else {
    // Fallback to mock PDF for local dev (no Docker needed)
    pdfBuffer = Buffer.from(
      `%PDF-1.4\n%MOCK_PDF_FILE\nTitle: ${structure.title}\nHash: ${diktat.generationHash}\n`
    );
  }

  // 7. PDF Audit is always fail-closed because it protects a published artifact.
  try {
    const pdfAudit = await auditRenderedPDF(pdfBuffer, enrichedStructure);
    const isPublishable = canPublishDiktat({
      status: pdfAudit.status as any,
      findings: (pdfAudit.warnings || []).map((w, idx) => ({
        id: `w-${idx}`,
        code: "AUDIT_WARN",
        severity: pdfAudit.status === "fail" ? "critical" : "warning",
        message: w,
        sourceSpanIds: [],
      })),
    });

    if (!isPublishable) {
      throw new Error(`Diktat PDF audit failed with status "${pdfAudit.status}": ${(pdfAudit.warnings || []).join("; ")}`);
    }
  } catch (auditErr) {
    throw auditErr;
  }

  // 8. Long-Term PDF Storage Strategy: Upload new and clean up old CDN files
  try {
    const oldUrl = diktat.fileUrl;

    // Upload using unified storage provider (stable leaf name, delete old on replace)
    const leaf = `${slugifySegment(diktat.title)}.pdf`;
    const objectKey = joinKey("courses", slugifySegment(diktat.courseId), "diktats", leaf);
    const uploadedData = await storage.upload(pdfBuffer, leaf, "application/pdf", { key: objectKey });
    const fileUrl = uploadedData.url; // Storing only key/reference URL
    const thumbnailUrl = await generateAndSavePdfThumbnail({
      courseSlug: diktat.courseId,
      materialId: diktat.id,
      pdfBuffer,
    }).catch(() => null);

    // Trigger cleanup of the old file
    if (oldUrl) {
      const oldKey = extractFileKeyFromUrl(oldUrl);
      if (oldKey) {
        try {
          await storage.delete(oldKey);
          console.log(`[Storage Cleanup] Deleted obsolete Diktat file with key ${oldKey}.`);
        } catch (delErr: any) {
          console.warn(`[Storage Warning] Failed to delete obsolete file ${oldKey}: ${delErr.message}`);
        }
      }
    }

    // Save final location to DB
    await db
      .update(diktats)
      .set({
        fileUrl,
        thumbnailUrl,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(diktats.id, diktatId));

    return { success: true, fileUrl };
  } catch {
    return { success: false, errors: [`Storage pipeline failure`] };
  }
}

/**
 * Action: Promotes the Diktat status to published and runs PDF compilers.
 */
export async function publishDiktat(
  diktatId: string
): Promise<{ success: boolean; fileUrl?: string; errors?: string[] }> {
  // Update state to 'generating'
  await db
    .update(diktats)
    .set({
      status: "generating",
    })
    .where(eq(diktats.id, diktatId));

  console.log(`[Tutor Action] Publishing Diktat ${diktatId} (PDF compilation initiated).`);

  // Execute compiler (in production this could be delegated to Inngest)
  const result = await executeDiktatPDFGeneration(diktatId);
  if (!result.success) {
    await db
      .update(diktats)
      .set({
        status: "failed",
      })
      .where(eq(diktats.id, diktatId));
  }

  return result;
}
