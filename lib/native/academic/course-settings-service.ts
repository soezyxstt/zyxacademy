import "server-only";
import { currentDemoCourse, inspectDemoSelection, revalidateDemoSelection, writeDemoSelection } from "@/lib/demo/course-selection";
import type { AdminDemoSelection } from "@/packages/native-parity/academic/courses/edit-contract";
import { parseCoursePricingInput } from "@/packages/academic/course-pricing";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { saveCourseWithCanonicalProjection } from "@/lib/academic/course-canonical-sync";
import { revisionOf } from "@/lib/admin-mcp/revision";
import { resolveCourseIdentity } from "@/lib/admin/course-identity";
import type { AdminCourseEditDraft } from "@/packages/native-parity/academic/courses/edit-contract";

import type { CourseCommandViewer } from "./course-command";
import { courseWrite, type CourseWriteTransaction } from "./course-write";

export async function readCourseSettingsInTransaction(slug: string, tx: CourseWriteTransaction) {
  const identity = await resolveCourseIdentity(slug, tx);
  if (!identity || identity.status !== "active") return null;
  const [legacy, canonical] = await Promise.all([
    identity.legacyId ? tx.select().from(courses).where(eq(courses.id, identity.legacyId)).limit(1).then((rows) => rows[0]) : null,
    identity.canonicalId ? tx.select().from(mataKuliah).where(eq(mataKuliah.id, identity.canonicalId)).limit(1).then((rows) => rows[0]) : null,
  ]);
  if (!legacy && !canonical) return null;
  return {
    ...identity,
    canonicalOnly: !legacy,
    revision: revisionOf({ legacy, canonical }),
    isDemo: canonical?.isDemo ?? false,
    pricing: {
      category: canonical?.pricingCategory ?? "premium",
      startsAt: canonical?.freeStartsAt?.toISOString() ?? null,
      endsAt: canonical?.freeEndsAt?.toISOString() ?? null,
    },
  };
}

export function readCourseSettingsEditView(slug: string) {
  return db.transaction((tx) => readCourseSettingsInTransaction(slug, tx), { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function updateCourseSettingsFromNative(slug: string, draft: AdminCourseEditDraft, requestId: string, viewer: CourseCommandViewer) {
  const updated = await courseWrite({
    slug, draft, requestId, viewer, entityType: "native_course_settings", action: "update",
    async write(tx) {
      const current = await readCourseSettingsInTransaction(slug, tx);
      if (!current) throw new Error("COURSE_NOT_FOUND");
      if (current.revision !== draft.expectedRevision) throw new Error("REVISION_CONFLICT");
      if (current.canonicalOnly ? draft.category !== "Umum" || Boolean(draft.description) : draft.category === "Umum") {
        throw new Error("COURSE_PROJECTION_UNAVAILABLE");
      }

      return saveCourseWithCanonicalProjection({
        id: current.primaryId, title: draft.title, category: draft.category as Parameters<typeof saveCourseWithCanonicalProjection>[0]["category"],
        description: draft.description, pricing: draft.pricing && parseCoursePricingInput(draft.pricing), isNew: false, actorId: viewer.user.id,
      }, tx);
    },
    async validateReplay(tx, saved) {
      const current = await readCourseSettingsInTransaction(slug, tx);
      if (!current || current.primaryId !== saved.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
    },
  });

  revalidateNativeCoursePaths([slug, updated.id, updated.canonicalCourseId]);
}

export function revalidateNativeCoursePaths(ids: readonly string[]) {
  for (const id of new Set(ids)) {
    const segment = encodeURIComponent(id);
    revalidatePath(`/admin/courses/${segment}`);
    revalidatePath(`/admin/courses/${segment}/settings`);
    revalidatePath(`/courses/${segment}`);
  }
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  revalidatePath("/dashboard");
}

export async function updateNativeDemoSelection(slug: string, draft: AdminDemoSelection, requestId: string, viewer: CourseCommandViewer) {
  const checked = await inspectDemoSelection(slug, draft.enabled);
  const saved = await courseWrite({
    slug, draft, requestId, viewer, entityType: "native_course_demo", action: "update",
    async write(tx) {
      const current = await readCourseSettingsInTransaction(slug, tx);
      if (!current?.canonicalId) throw new Error("COURSE_NOT_FOUND");
      if (current.revision !== draft.expectedRevision || ((await currentDemoCourse(tx))?.id ?? null) !== draft.previousCourseId) {
        throw new Error("REVISION_CONFLICT");
      }
      if (!checked.success || checked.canonicalId !== current.canonicalId) throw new Error("COURSE_PROJECTION_UNAVAILABLE");
      if (current.isDemo !== draft.enabled) await writeDemoSelection(tx, current.canonicalId, draft.enabled);
      return { id: current.canonicalId, canonicalCourseId: current.canonicalId };
    },
    async validateReplay(tx, previous) {
      if ((await readCourseSettingsInTransaction(slug, tx))?.canonicalId !== previous.canonicalCourseId) throw new Error("COURSE_NOT_FOUND");
    },
  });
  revalidateDemoSelection(saved.canonicalCourseId);
}
