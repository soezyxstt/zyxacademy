import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { artikel, bagianArtikel, kemajuanBacaArtikel } from "@/db/schema";
import { eq, and, or } from "drizzle-orm";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isStructuredArticleReaderEnabled } from "@/lib/articles/feature";

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
    if (!isStructuredArticleReaderEnabled()) {
      return NextResponse.json({ error: "Pembaca artikel terstruktur belum aktif." }, { status: 404 });
    }
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
      .select({ id: artikel.id, version: artikel.version })
      .from(artikel)
      .where(and(eq(artikel.status, "published"), or(eq(artikel.id, articleId), eq(artikel.slug, articleId))))
      .limit(1);

    if (!articleRecord) {
      return NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 });
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
