import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { artikel, artikelIde, bagianArtikel, kemajuanBacaArtikel, gamificationArticleCompletions } from "@/db/schema";
import { eq, and, or, gte, isNotNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordLearningEvidence } from "@/lib/pemahaman/evidence";
import { startLearningRewards } from "@/lib/gamification/learning-start";
import { recordGamificationEvidence } from "@/lib/gamification/receipts";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { getStudentCourseAccess, isFreeChapterScoped } from "@/lib/course-utils";
import { articleProgressUpdateSchema } from "@/lib/articles/progress-contract";

type RouteProps = {
  params: Promise<{ articleId: string }>;
};

async function resolveProgressArticle(userId: string, articleId: string) {
  const [articleRecord] = await db
    .select({ id: artikel.id, version: artikel.version, courseId: artikel.mataKuliahId, chapterId: artikel.babId })
    .from(artikel)
    .where(and(eq(artikel.status, "published"), or(eq(artikel.id, articleId), eq(artikel.slug, articleId))))
    .limit(1);
  if (!articleRecord) {
    return { response: NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 }) };
  }
  const access = await getStudentCourseAccess(userId, articleRecord.courseId);
  if (!access) {
    return { response: NextResponse.json({ error: "Akses materi tidak tersedia." }, { status: 403 }) };
  }
  if (access.tier === "free" && !isFreeChapterScoped([articleRecord.chapterId].filter((id): id is string => Boolean(id)), access.hasFullContentAccess ? access.policy.scopedChapterIds : access.freeChapterIds)) {
    return { response: NextResponse.json({ error: "Materi ini tersedia setelah aktivasi kelas." }, { status: 403 }) };
  }
  return { articleRecord };
}

export async function GET(req: NextRequest, { params }: RouteProps) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const expectedUserId = req.headers.get("x-student-id");
    if (expectedUserId && expectedUserId !== session.user.id) {
      return NextResponse.json({ error: "Account changed" }, { status: 409 });
    }
    const version = z.coerce.number().int().positive().safeParse(req.nextUrl.searchParams.get("version"));
    if (!version.success) {
      return NextResponse.json({ error: "Versi artikel tidak valid." }, { status: 400 });
    }
    const { articleId } = await params;
    const resolved = await resolveProgressArticle(session.user.id, articleId);
    if (resolved.response) return resolved.response;
    const { articleRecord } = resolved;
    if (articleRecord.version !== version.data) {
      return NextResponse.json({ error: "Versi artikel berubah. Muat ulang halaman." }, { status: 409 });
    }
    const rows = await db.select({
      sectionId: kemajuanBacaArtikel.bagianArtikelId,
      maxReadPercent: kemajuanBacaArtikel.maxReadPercent,
      completedAt: kemajuanBacaArtikel.completedAt,
      timeSpentSeconds: kemajuanBacaArtikel.timeSpentSeconds,
      lastReadAt: kemajuanBacaArtikel.lastReadAt,
    }).from(kemajuanBacaArtikel).where(and(
      eq(kemajuanBacaArtikel.penggunaId, session.user.id),
      eq(kemajuanBacaArtikel.artikelId, articleRecord.id),
      eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version),
    ));
    return NextResponse.json({
      articleId: articleRecord.id,
      articleVersion: articleRecord.version,
      sectionProgress: Object.fromEntries(rows.map((row) => [row.sectionId, {
        maxReadPercent: row.maxReadPercent,
        completed: Boolean(row.completedAt) || row.maxReadPercent >= 90,
        timeSpentSeconds: row.timeSpentSeconds,
        lastReadAt: row.lastReadAt.toISOString(),
      }])),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error reading article progress:", error);
    return NextResponse.json({ error: "Progres belum dapat dimuat. Coba lagi." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: RouteProps) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Silakan masuk untuk menyimpan progres." }, { status: 401 });
    }
    const userId = session.user.id;
    const expectedUserId = req.headers.get("x-student-id");
    if (expectedUserId && expectedUserId !== userId) {
      return NextResponse.json({ error: "Account changed" }, { status: 409 });
    }

    const { articleId } = await params;
    if (!articleId) {
      return NextResponse.json({ error: "Artikel tidak valid." }, { status: 400 });
    }

    const rawJson = await req.json().catch(() => null);
    const parsed = articleProgressUpdateSchema.safeParse(rawJson);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Data progres tidak valid.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sectionId, percent, timeSpentSeconds, completed, articleVersion } = parsed.data;
    const resolved = await resolveProgressArticle(userId, articleId);
    if (resolved.response) return resolved.response;
    const { articleRecord } = resolved;
    if (articleVersion !== undefined && articleVersion !== articleRecord.version) {
      return NextResponse.json({ error: "Versi artikel berubah. Muat ulang halaman." }, { status: 409 });
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

    const progressResult = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`article:${userId}:${articleRecord.id}`}, 0))`);
    const [current] = await tx.select({ id: artikel.id }).from(artikel).where(and(eq(artikel.id, articleRecord.id), eq(artikel.version, articleRecord.version), eq(artikel.status, "published"))).limit(1).for("share");
    const [currentSection] = await tx.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(eq(bagianArtikel.id, sectionId), eq(bagianArtikel.artikelId, articleRecord.id), eq(bagianArtikel.version, articleRecord.version), eq(bagianArtikel.status, "published"))).limit(1).for("share");
    if (!current || !currentSection) throw new Error("ARTICLE_UNAVAILABLE");
    // Look for existing progress
    const [existing] = await tx
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
    const now = new Date();
    const newlyCompleted = isCompleted && !existing?.completedAt;
    const rewardAccess = newlyCompleted ? await resolveCourseAccess({ userId, courseId: articleRecord.courseId, now }, tx) : null;
    const rewardStart = rewardAccess?.hasFullContentAccess && !rewardAccess.isDemo && rewardAccess.canonicalCourseId === articleRecord.courseId
      ? await startLearningRewards(tx, userId, articleRecord.courseId, now) : null;
    const completedAt = isCompleted ? (existing?.completedAt ?? now) : null;
    const totalTimeSpent = (existing?.timeSpentSeconds ?? 0) + addedTimeSpent;

    if (existing) {
      await tx
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
      await tx.insert(kemajuanBacaArtikel).values({
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

    if (newlyCompleted && rewardStart) {
      const sections = await tx.select({ id: bagianArtikel.id }).from(bagianArtikel).where(and(eq(bagianArtikel.artikelId, articleRecord.id), eq(bagianArtikel.version, articleRecord.version), eq(bagianArtikel.status, "published"))).for("share");
      const completedRows = await tx.select({ id: kemajuanBacaArtikel.id, sectionId: kemajuanBacaArtikel.bagianArtikelId, completedAt: kemajuanBacaArtikel.completedAt }).from(kemajuanBacaArtikel).where(and(eq(kemajuanBacaArtikel.penggunaId, userId), eq(kemajuanBacaArtikel.artikelId, articleRecord.id), eq(kemajuanBacaArtikel.artikelVersion, articleRecord.version), isNotNull(kemajuanBacaArtikel.completedAt)));
      const completedIds = new Set(completedRows.filter(row => row.completedAt && row.completedAt >= rewardStart.startedAt && row.completedAt <= now).map(row => row.sectionId));
      if (sections.length && sections.every(section => completedIds.has(section.id))) {
        const sectionIds = sections.map(section => section.id).sort();
        const evidence = sectionIds.map(id => {
          const row = completedRows.find(candidate => candidate.sectionId === id)!;
          return { id: row.id, sectionId: id, completedAt: row.completedAt!.toISOString() };
        });
        const [completion] = await tx.insert(gamificationArticleCompletions).values({
          id: randomUUID(), userId, courseId: articleRecord.courseId, articleId: articleRecord.id,
          articleVersion: articleRecord.version, completedAt: now, sectionIds, evidence,
        }).onConflictDoNothing().returning();
        if (completion) await recordGamificationEvidence(tx, {
          userId, courseId: articleRecord.courseId, source: "article", sourceId: articleRecord.id,
          sourceVersion: String(articleRecord.version), sourceEvidenceId: completion.id,
          occurredAt: completion.completedAt, details: { sectionIds },
        });
      }
    }
    return { maxReadPercent, isCompleted, totalTimeSpent, completedAt, now };
    });
    const { maxReadPercent, isCompleted, totalTimeSpent, completedAt, now } = progressResult;

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
      articleId: articleRecord.id,
      articleVersion: articleRecord.version,
      sectionId,
      maxReadPercent,
      completed: isCompleted,
      timeSpentSeconds: totalTimeSpent,
      completedAt: completedAt?.toISOString() ?? null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error updating article progress:", error);
    return NextResponse.json({ error: "Progres belum dapat disimpan. Coba lagi." }, { status: 500 });
  }
}
