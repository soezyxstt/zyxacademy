import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { bab, chapters, courseMaterials, mataKuliah, sumberMateri } from "@/db/schema";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { isValidSubcategory, type CourseMaterialSubcategory } from "@/lib/course-materials";
import { env } from "@/lib/env";
import { readNativeMaterialPdf } from "@/lib/native/material-pdf-bytes";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { recordOfflineChange } from "@/lib/offline/server-events";
import { storage } from "@/lib/storage";
import { joinKey, slugifySegment } from "@/lib/storage/keys";
import { enqueuePdfThumbnail } from "@/lib/thumbnail";
import {
  pdfIntakeCommit, pdfIntakeDuplicates, pdfIntakeEntries, validPdfGroup, type PdfIntakeEntry,
} from "@/packages/native-parity/academic/courses/intake";
import { intakeLeaseSeconds, issueIntakeProof, verifyIntakeProof } from "./intake-proof";
import { intakeError, intakeJson, requireNativeIntake } from "./intake-scope";
import { courseWrite } from "./course-write";

type Scope = { accountId: string; sessionId: string; courseId: string };
const secret = () => env.BETTER_AUTH_SECRET;
const entryRevision = (legacyId: string, entry: PdfIntakeEntry) => revisionOf({ legacyId, entry });

function objectKeys(scope: Scope, legacyId: string, entry: PdfIntakeEntry) {
  const batchId = revisionOf({ scope, entry: entryRevision(legacyId, entry) });
  const prefix = joinKey("courses", slugifySegment(legacyId), "materials");
  return {
    staged: joinKey(prefix, "native-intake", batchId + ".pdf"),
    committed: joinKey(prefix, batchId + ".pdf"),
  };
}

export async function handleNativeCoursePdfIntake(request: Request, intent: "deduplicate" | "presign" | "commit") {
  try {
    const guard = await requireNativeIntake(request);
    if (guard.response) return guard.response;
    const { scope, identity } = guard;
    const legacyId = identity.legacyId;
    if (!legacyId) return intakeError(404, "COURSE_PDF_UNAVAILABLE");
    const body: unknown = await request.json().catch(() => null);

    if (intent === "deduplicate") {
      const parsed = pdfIntakeDuplicates.safeParse(body);
      if (!parsed.success) return intakeError(400, "INVALID_INPUT");
      const rows = await db.select().from(courseMaterials)
        .where(and(eq(courseMaterials.courseId, legacyId), inArray(courseMaterials.checksum, parsed.data.checksums)))
        .orderBy(courseMaterials.id);
      const matches = new Map<string, { materialId: string; title: string; revision: string }>();
      for (const row of rows) {
        if (row.checksum && !matches.has(row.checksum)) {
          matches.set(row.checksum, { materialId: row.id, title: row.title, revision: revisionOf(row) });
        }
      }
      return intakeJson({ duplicates: Object.fromEntries(matches) });
    }

    if (intent === "presign") {
      const parsed = pdfIntakeEntries.safeParse(body);
      if (!parsed.success || !validPdfGroup(parsed.data)) return intakeError(400, "INVALID_INPUT");
      if (!storage.getSignedUrl) return intakeError(503, "PDF_UNAVAILABLE");
      const data = await Promise.all(parsed.data.map(async entry => ({
        id: entry.id,
        proof: issueIntakeProof(secret(), scope, "pdf", entryRevision(legacyId, entry)),
        uploadUrl: await storage.getSignedUrl!(
          objectKeys(scope, legacyId, entry).staged, "put", "application/pdf", intakeLeaseSeconds, { contentLength: entry.size },
        ),
      })));
      return intakeJson({ data }, 201);
    }

    const parsed = pdfIntakeCommit.safeParse(body);
    if (!parsed.success || !validPdfGroup(parsed.data.entries) || parsed.data.proofs.length !== parsed.data.entries.length) {
      return intakeError(400, "INVALID_INPUT");
    }
    const { entries, proofs, requestId } = parsed.data;
    const completed = await commitPdfGroup({ scope, legacyId, entries, proofs, requestId, signal: request.signal });
    return intakeJson({ created: entries.filter(entry => !entry.overwrite).length, updated: entries.filter(entry => entry.overwrite).length, id: completed.id }, 201);
  } catch (error) {
    if (error instanceof OfflineHttpError) return intakeError(error.status, error.code);
    const code = error instanceof Error ? error.message : "";
    if (code === "FORBIDDEN" || code === "UNAUTHENTICATED") return intakeError(code === "FORBIDDEN" ? 403 : 401, code);
    if (["COURSE_NOT_FOUND", "CHAPTER_NOT_FOUND"].includes(code)) return intakeError(404, code);
    if (["REQUEST_CONFLICT", "REVISION_CONFLICT", "DUPLICATE_PDF", "UPLOAD_EXPIRED"].includes(code)) return intakeError(409, code);
    if (["INVALID_PDF", "INVALID_METADATA"].includes(code)) return intakeError(422, code);
    return intakeError(503, "PDF_UNAVAILABLE");
  }
}

async function commitPdfGroup({ scope, legacyId, entries, proofs, requestId, signal }: {
  scope: Scope; legacyId: string; entries: PdfIntakeEntry[]; proofs: string[]; requestId: string; signal: AbortSignal;
}) {
  const saved = await courseWrite({
    slug: scope.courseId, draft: { legacyId, entries }, requestId,
    viewer: { user: { id: scope.accountId }, session: { id: scope.sessionId } },
    entityType: "native_course_material_intake", action: "create",
    async write(tx) {
      const course = await resolveCourseIdentity(scope.courseId, tx);
      if (!course || course.status !== "active" || course.legacyId !== legacyId) throw new Error("COURSE_NOT_FOUND");
      if (course.canonicalId) {
        const [current] = await tx.select({ status: mataKuliah.status, legacyId: mataKuliah.legacyCourseId })
          .from(mataKuliah).where(eq(mataKuliah.id, course.canonicalId)).limit(1).for("share");
        if (!current || current.status !== "active" || current.legacyId !== legacyId) throw new Error("COURSE_NOT_FOUND");
      }
      const selected = [...new Set(entries.flatMap(entry => entry.chapterIds))];
      const canonical = await tx.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(and(
        inArray(bab.mataKuliahId, course.allIds), eq(bab.status, "active"),
        or(inArray(bab.id, selected), inArray(bab.legacyChapterId, selected)),
      )).for("share");
      const legacy = await tx.select({ id: chapters.id }).from(chapters).where(and(
        inArray(chapters.id, selected), eq(chapters.courseId, legacyId),
      )).for("share");
      const valid = new Set([...canonical, ...legacy].map(row => row.id));
      if (selected.some(id => !valid.has(id))) throw new Error("CHAPTER_NOT_FOUND");
      for (const [index, entry] of entries.entries()) {
        if (!verifyIntakeProof(secret(), scope, "pdf", entryRevision(legacyId, entry), proofs[index])) throw new Error("UPLOAD_EXPIRED");
        if (entry.subcategory && !isValidSubcategory(entry.type, entry.subcategory)) throw new Error("INVALID_METADATA");
        if (entry.overwrite) {
          const [current] = await tx.select().from(courseMaterials).where(and(
            eq(courseMaterials.courseId, legacyId), eq(courseMaterials.id, entry.overwrite.id),
          )).for("update");
          if (!current || revisionOf(current) !== entry.overwrite.revision || current.checksum !== entry.checksum) {
            throw new Error("REVISION_CONFLICT");
          }
        } else if (!entry.keepDuplicate) {
          const [existing] = await tx.select({ id: courseMaterials.id }).from(courseMaterials).where(and(
            eq(courseMaterials.courseId, legacyId), eq(courseMaterials.checksum, entry.checksum),
          )).limit(1);
          if (existing) throw new Error("DUPLICATE_PDF");
        }

        const keys = objectKeys(scope, legacyId, entry);
        const bytes = await readNativeMaterialPdf({ storageKey: keys.staged }, signal);
        if (bytes.byteLength !== entry.size || createHash("sha256").update(bytes).digest("hex") !== entry.checksum) {
          throw new Error("INVALID_PDF");
        }
        await storage.upload(bytes, entry.filename, "application/pdf", { key: keys.committed });
        const metadata = {
          title: entry.title, type: entry.type, subcategory: entry.subcategory as CourseMaterialSubcategory | null,
          year: entry.year, chapterIds: [...new Set(entry.chapterIds)], fileUrl: keys.committed, checksum: entry.checksum,
          thumbnailUrl: null, updatedAt: new Date(),
        };
        if (entry.overwrite) {
          await tx.update(courseMaterials).set(metadata).where(eq(courseMaterials.id, entry.overwrite.id));
          await tx.update(sumberMateri).set({ title: entry.title, updatedAt: metadata.updatedAt }).where(and(
            eq(sumberMateri.id, "sm-legacy-" + entry.overwrite.id), inArray(sumberMateri.mataKuliahId, course.allIds),
          ));
        } else {
          await tx.insert(courseMaterials).values({ ...metadata, id: entry.id, courseId: legacyId });
          if (course.canonicalId) {
            const first = entry.chapterIds[0];
            const chapter = canonical.find(row => row.id === first || row.legacyId === first);
            await tx.insert(sumberMateri).values({
              id: "sm-legacy-" + entry.id, mataKuliahId: course.canonicalId, babId: chapter?.id ?? null,
              sourceType: "pdf", title: entry.title, canonicalUriOrR2Key: keys.committed, version: 1,
              checksum: keys.committed, status: "active", creatorId: scope.accountId,
            });
          }
        }
      }
      await recordOfflineChange(tx, { kind: "course", courseId: legacyId, action: "invalidate" });
      return { id: requestId, canonicalCourseId: scope.courseId, legacyCourseId: legacyId };
    },
    async validateReplay(tx, receipt) {
      const current = await resolveCourseIdentity(scope.courseId, tx);
      if (!current || current.status !== "active" || current.legacyId !== receipt.legacyCourseId) throw new Error("COURSE_NOT_FOUND");
    },
  });

  await Promise.allSettled(entries.map(async entry => {
    const keys = objectKeys(scope, legacyId, entry);
    await storage.delete(keys.staged).catch(() => {});
    await enqueuePdfThumbnail({ materialId: entry.overwrite?.id ?? entry.id, sourceType: "course_material", sourceVersion: keys.committed });
  }));
  revalidatePath("/admin/courses");
  for (const id of new Set([scope.courseId, legacyId])) {
    revalidatePath(`/admin/courses/${encodeURIComponent(id)}/documents`);
    revalidatePath(`/courses/${encodeURIComponent(id)}/material`);
  }
  return saved;
}
