import { db } from "@/db";
import { diktats, knowledgeObjects, knowledgeRelationships } from "@/db/schema";
import { DiktatStructure } from "@/lib/diktat-generator";
import { validateDiktat } from "@/lib/diktat-validator";
import { renderDiktatToHTML } from "@/lib/diktat-renderer";
import { auditDiktatStructure, applyDiktatRevisions } from "@/lib/diktat-auditor";
import { generateExamIntelligence } from "@/lib/diktat-exam-intelligence";
import { auditRenderedPDF } from "@/lib/diktat-pdf-auditor";
import { eq, and, inArray } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { canPublishDiktat } from "@/lib/diktat/audit-contracts";
import { leafFilename } from "@/lib/storage/keys";
import { buildDiktatPdfStorageKey, enqueuePdfThumbnail } from "@/lib/thumbnail";

/**
 * Compiles HTML to PDF using Puppeteer and uploads it to storage.
 * Handles PDF quality gates, versioned storage, and thumbnail event dispatch.
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
        .where(inArray(knowledgeRelationships.sourceKoId, sourceKOs.map((k) => k.id)))
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
    console.warn("[diktat-pdf] Audit issues:", auditResult.issues.map((i) => `[${i.severity}] ${i.description}`));
  }

  // 3. Apply safe AI revisions (gated)
  let revisionsApplied = 0;
  if (process.env.FEATURE_DIKTAT_AI === "1" && auditResult.proposedRevisions.length > 0) {
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
  const rendererUrl = process.env.DIKTAT_RENDERER_URL;
  const rendererSecret = process.env.DIKTAT_RENDERER_SECRET;

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
          .map((k) => parsed[k]);
        pdfBuffer = Buffer.from(bytes);
      } else {
        pdfBuffer = Buffer.from(await res.arrayBuffer());
      }
    } catch {
      pdfBuffer = Buffer.from(await res.arrayBuffer());
    }
  } else {
    // Fallback to mock PDF for local dev
    pdfBuffer = Buffer.from(
      `%PDF-1.4\n%MOCK_PDF_FILE\nTitle: ${structure.title}\nHash: ${diktat.generationHash}\n`
    );
  }

  // 7. PDF Audit is always fail-closed because it protects a published artifact.
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

  // 8. Keep previous PDFs for rollback and give each rendered byte sequence its own key.
  try {
    const objectKey = buildDiktatPdfStorageKey({
      courseId: diktat.courseId,
      diktatId: diktat.id,
      title: diktat.title,
      pdfBytes: pdfBuffer,
    });
    const uploadedData = await storage.upload(pdfBuffer, leafFilename(objectKey), "application/pdf", { key: objectKey });
    const fileUrl = uploadedData.url;

    // Save final location to DB with thumbnailUrl: null (fresh on-demand thumbnail generation via web tier)
    await db
      .update(diktats)
      .set({
        fileUrl,
        thumbnailUrl: null,
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(diktats.id, diktatId));

    // Enqueue thumbnail generation in background with the stored file key as
    // sourceVersion so the worker can reject stale events after overwrites.
    await enqueuePdfThumbnail({
      materialId: diktat.id,
      sourceType: "diktat",
      sourceVersion: objectKey,
      sourceRevision: diktat.generationHash,
    });

    return { success: true, fileUrl };
  } catch {
    return { success: false, errors: ["Storage pipeline failure"] };
  }
}
