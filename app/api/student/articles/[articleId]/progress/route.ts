import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { artikel, artikelIde, bagianArtikel, kemajuanBacaArtikel } from "@/db/schema";
import { eq, and, or, gte, isNotNull } from "drizzle-orm";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordLearningEvidence } from "@/lib/pemahaman/evidence";
import { isStudentEnrolled } from "@/lib/student/course-catalog";

const progressUpdateSchema = z.object({
  sectionId: z.string().min(1),
  percent: z.number().min(0).max(100).default(0),
  timeSpentSeconds: z.number().min(0).default(0),
  completed: z.boolean().optional(),
});

type RouteProps = {
  params: Promise<{ articleId: string }>;
};

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Silakan masuk untuk menyimpan progres." }, { status: 401 });
    }
    const userId = session.user.id;

    const { articleId } = await params;
    if (!articleId) {
      return NextResponse.json({ error: "Artikel tidak valid." }, { status: 400 });
    }

    const rawJson = await req.json().catch(() => null);
    const parsed = progressUpdateSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data progres tidak valid.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sectionId, percent, timeSpentSeconds, completed } = parsed.data;

    // Verify article existence
    const [articleRecord] = await db
      .select({ id: artikel.id, version: artikel.version, courseId: artikel.mataKuliahId })
      .from(artikel)
      .where(and(eq(artikel.status, "published"), or(eq(artikel.id, articleId), eq(artikel.slug, articleId))))
      .limit(1);

    if (!articleRecord) {
      return NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 });
    }
    if (!(await isStudentEnrolled(userId, articleRecord.courseId))) {
      return NextResponse.json({ error: "Anda belum terdaftar di kelas ini." }, { status: 403 });
    }

    // Verify section belongs to article
    const [sectionRecord] = await db
      .select({ id: bagianArtikel.id })
      .from(bagianArtikel)
      .where(
        and(
          eq(bagianArtikel.id, sectionId),
          eq(bagianArtikel.artikelId, articleRecord.id),
          eq(bagianArtikel.version, articleRecord.version),
          eq(bagianArtikel.status, "published"),
        ),
      )
      .limit(1);

    if (!sectionRecord) {
      return NextResponse.json({ error: "Bagian artikel tidak ditemukan." }, { status: 404 });
    }

    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    const addedTimeSpent = Math.min(3_600, Math.max(0, Math.round(timeSpentSeconds)));

    // Look for existing progress
    const [existing] = await db
      .select()
      .from(kemajuanBacaArtikel)
      .where(
        and(
          eq(kemajuanBacaArtikel.penggunaId, userId),
          eq(kemajuanBacaArtikel.artikelId, articleRecord.id),
          eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version),
          eq(kemajuanBacaArtikel.bagianArtikelId, sectionId),
        ),
      )
      .limit(1);

    const maxReadPercent = existing
      ? Math.max(existing.maxReadPercent, clampedPercent)
      : clampedPercent;

    const isCompleted = maxReadPercent >= 90 || completed === true || Boolean(existing?.completedAt);
    const completedAt = isCompleted ? (existing?.completedAt ?? new Date()) : null;
    const totalTimeSpent = (existing?.timeSpentSeconds ?? 0) + addedTimeSpent;
    const now = new Date();

    if (existing) {
      await db
        .update(kemajuanBacaArtikel)
        .set({
          maxReadPercent,
          timeSpentSeconds: totalTimeSpent,
          completedAt,
          lastReadAt: now,
          updatedAt: now,
        })
        .where(eq(kemajuanBacaArtikel.id, existing.id));
    } else {
      await db.insert(kemajuanBacaArtikel).values({
        id: randomUUID(),
        penggunaId: userId,
        artikelId: articleRecord.id,
        artikelVersion: articleRecord.version,
        bagianArtikelId: sectionId,
        maxReadPercent,
        timeSpentSeconds: totalTimeSpent,
        completedAt,
        lastReadAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (isCompleted) {
      const [allSections, completedSections] = await Promise.all([
        db
          .select({ id: bagianArtikel.id })
          .from(bagianArtikel)
          .where(
            and(
              eq(bagianArtikel.artikelId, articleRecord.id),
              eq(bagianArtikel.version, articleRecord.version),
              eq(bagianArtikel.status, "published"),
            ),
          ),
        db
          .select({ sectionId: kemajuanBacaArtikel.bagianArtikelId })
          .from(kemajuanBacaArtikel)
          .where(
            and(
              eq(kemajuanBacaArtikel.penggunaId, userId),
              eq(kemajuanBacaArtikel.artikelId, articleRecord.id),
              eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version),
              or(
                gte(kemajuanBacaArtikel.maxReadPercent, 90),
                isNotNull(kemajuanBacaArtikel.completedAt),
              ),
            ),
          ),
      ]);
      const completedIds = new Set(completedSections.map((row) => row.sectionId));
      completedIds.add(sectionId);
      if (allSections.length > 0 && allSections.every((section) => completedIds.has(section.id))) {
        const links = await db
          .select({ ideId: artikelIde.ideId, weight: artikelIde.weight })
          .from(artikelIde)
          .where(eq(artikelIde.artikelId, articleRecord.id));
        await Promise.all(links.map((link) => recordLearningEvidence({
          penggunaId: userId,
          ideId: link.ideId,
          evidenceSource: "article_completed",
          sourceId: articleRecord.id,
          scoreContribution: 0.65 * link.weight,
          confidence: 60,
          derivationStatus: "deterministic",
          affectsMastery: true,
          occurredAt: now,
        })));
      }
    }

    return NextResponse.json({
      success: true,
      sectionId,
      maxReadPercent,
      completed: isCompleted,
      timeSpentSeconds: totalTimeSpent,
      completedAt: completedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Error updating article progress:", error);
    return NextResponse.json({ error: "Progres belum dapat disimpan. Coba lagi." }, { status: 500 });
  }
}
