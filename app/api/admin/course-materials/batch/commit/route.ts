import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { courseMaterials } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { storage } from "@/lib/storage";
import {
  isValidSubcategory,
  normalizeLevel1Category,
  type CourseMaterialSubcategory,
} from "@/lib/course-materials";
import { assertSafeKey, joinKey, slugifySegment } from "@/lib/storage/keys";

const MAX_BATCH_FILES = 200;

const ItemSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["create", "overwrite"]),
  targetId: z.string().optional(),
  key: z.string().min(1),
  title: z.string().trim().min(1).max(255),
  type: z.enum(["materi", "soal", "pembahasan_soal", "materi_kelas", "contoh_soal"]),
  subcategory: z.string().nullable().optional(),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  size: z.number().int().nonnegative(),
});

const BodySchema = z.object({
  courseId: z.string().min(1),
  chapterIds: z.array(z.string().min(1)).min(1),
  items: z.array(ItemSchema).min(1).max(MAX_BATCH_FILES),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, chapterIds, items } = parsed.data;
  const prefix = joinKey("courses", slugifySegment(courseId), "materials");

  const seenKeys = new Set<string>();
  for (const item of items) {
    if (!item.key.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: `Key bukan PDF: ${item.id}` },
        { status: 400 }
      );
    }
    try {
      assertSafeKey(item.key);
    } catch {
      return NextResponse.json({ error: `Key tidak aman: ${item.id}` }, { status: 400 });
    }
    if (!item.key.startsWith(`${prefix}/`)) {
      return NextResponse.json(
        { error: `Key di luar folder mata kuliah: ${item.id}` },
        { status: 400 }
      );
    }
    if (seenKeys.has(item.key)) {
      return NextResponse.json(
        { error: `Key duplikat dalam batch: ${item.id}` },
        { status: 400 }
      );
    }
    seenKeys.add(item.key);

    const type = normalizeLevel1Category(item.type);
    if (
      item.subcategory &&
      !isValidSubcategory(type, item.subcategory)
    ) {
      return NextResponse.json(
        { error: `Sub-kategori tidak sesuai untuk item ${item.id}` },
        { status: 400 }
      );
    }

    if (item.action === "overwrite" && !item.targetId) {
      return NextResponse.json(
        { error: `Timpa memerlukan ID dokumen sasaran: ${item.id}` },
        { status: 400 }
      );
    }
  }

  const overwriteTargets = items
    .filter((i) => i.action === "overwrite" && i.targetId)
    .map((i) => i.targetId as string);

  const existingRows = overwriteTargets.length
    ? await db
        .select({ id: courseMaterials.id, fileUrl: courseMaterials.fileUrl })
        .from(courseMaterials)
        .where(
          and(
            eq(courseMaterials.courseId, courseId),
            inArray(courseMaterials.id, overwriteTargets)
          )
        )
    : [];

  const existingById = new Map(existingRows.map((row) => [row.id, row]));
  for (const item of items) {
    if (item.action !== "overwrite" || !item.targetId) continue;
    const target = existingById.get(item.targetId);
    if (!target) {
      return NextResponse.json(
        { error: `Dokumen sasaran timpa tidak ditemukan: ${item.targetId}` },
        { status: 404 }
      );
    }
  }

  let created = 0;
  let updated = 0;
  const replacedKeys = new Set<string>();

  await db.transaction(async (tx) => {
    for (const item of items) {
      const type = normalizeLevel1Category(item.type);
      const subcategory =
        typeof item.subcategory === "string" && item.subcategory.trim()
          ? (item.subcategory.trim() as CourseMaterialSubcategory)
          : null;

      if (item.action === "overwrite" && item.targetId) {
        const target = existingById.get(item.targetId)!;
        replacedKeys.add(target.fileUrl);
        await tx
          .update(courseMaterials)
          .set({
            title: item.title,
            type,
            subcategory,
            year: item.year ?? null,
            fileUrl: item.key,
            checksum: item.checksum ?? null,
            updatedAt: new Date(),
          })
          .where(eq(courseMaterials.id, item.targetId));
        updated += 1;
      } else {
        await tx.insert(courseMaterials).values({
          id: randomUUID(),
          courseId,
          title: item.title,
          type,
          subcategory,
          year: item.year ?? null,
          fileUrl: item.key,
          checksum: item.checksum ?? null,
          chapterIds,
        });
        created += 1;
      }
    }
  });

  for (const key of replacedKeys) {
    if (!key) continue;
    await storage.delete(key).catch((err) => {
      console.error("Failed to clean up overwritten course material:", err);
    });
  }

  revalidatePath("/admin/courses");
  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath(`/courses/${courseId}/material`);

  return NextResponse.json({ created, updated }, { status: 201 });
}
