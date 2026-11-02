import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db";
import {
  artikel,
  blueprintAsesmen,
  diktatMateri,
  flashcard,
  mataKuliah,
  setFlashcard,
  soal,
} from "@/db/schema";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export type AdminProductItem = {
  id: string;
  productType: "diktat" | "article" | "flashcard" | "blueprint" | "question";
  title: string;
  courseId: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  chapterId?: string | null;
  status: string;
  fileKey?: string | null;
  contentMarkdown?: string | null;
  extra?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "all";
  const courseId = searchParams.get("courseId") || undefined;
  const q = searchParams.get("q")?.toLowerCase().trim() || "";

  const items: AdminProductItem[] = [];

  try {
    // 1. Diktat
    if (type === "all" || type === "diktat") {
      const diktatRows = await db
        .select({
          id: diktatMateri.id,
          title: diktatMateri.title,
          contentMarkdown: diktatMateri.contentMarkdown,
          fileKey: diktatMateri.fileKey,
          status: diktatMateri.status,
          courseId: diktatMateri.mataKuliahId,
          chapterId: diktatMateri.babId,
          createdAt: diktatMateri.createdAt,
          updatedAt: diktatMateri.updatedAt,
          courseCode: mataKuliah.code,
          courseTitle: mataKuliah.title,
        })
        .from(diktatMateri)
        .leftJoin(mataKuliah, eq(diktatMateri.mataKuliahId, mataKuliah.id))
        .where(
          and(
            courseId ? eq(diktatMateri.mataKuliahId, courseId) : undefined,
            q ? or(ilike(diktatMateri.title, `%${q}%`), ilike(diktatMateri.id, `%${q}%`)) : undefined,
          )
        )
        .orderBy(desc(diktatMateri.createdAt))
        .limit(50);

      for (const row of diktatRows) {
        items.push({
          id: row.id,
          productType: "diktat",
          title: row.title,
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          chapterId: row.chapterId,
          status: row.status,
          fileKey: row.fileKey,
          contentMarkdown: row.contentMarkdown,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    // 2. Artikel
    if (type === "all" || type === "article") {
      const artikelRows = await db
        .select({
          id: artikel.id,
          title: artikel.title,
          contentMarkdown: artikel.contentMarkdown,
          status: artikel.status,
          courseId: artikel.mataKuliahId,
          chapterId: artikel.babId,
          createdAt: artikel.createdAt,
          updatedAt: artikel.updatedAt,
          courseCode: mataKuliah.code,
          courseTitle: mataKuliah.title,
        })
        .from(artikel)
        .leftJoin(mataKuliah, eq(artikel.mataKuliahId, mataKuliah.id))
        .where(
          and(
            courseId ? eq(artikel.mataKuliahId, courseId) : undefined,
            q ? or(ilike(artikel.title, `%${q}%`), ilike(artikel.id, `%${q}%`)) : undefined,
          )
        )
        .orderBy(desc(artikel.createdAt))
        .limit(50);

      for (const row of artikelRows) {
        items.push({
          id: row.id,
          productType: "article",
          title: row.title,
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          chapterId: row.chapterId,
          status: row.status,
          contentMarkdown: row.contentMarkdown,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    // 3. Flashcard Sets
    if (type === "all" || type === "flashcard") {
      const setRows = await db
        .select({
          id: setFlashcard.id,
          title: setFlashcard.title,
          status: setFlashcard.status,
          courseId: setFlashcard.mataKuliahId,
          chapterId: setFlashcard.babId,
          createdAt: setFlashcard.createdAt,
          updatedAt: setFlashcard.updatedAt,
          courseCode: mataKuliah.code,
          courseTitle: mataKuliah.title,
        })
        .from(setFlashcard)
        .leftJoin(mataKuliah, eq(setFlashcard.mataKuliahId, mataKuliah.id))
        .where(
          and(
            courseId ? eq(setFlashcard.mataKuliahId, courseId) : undefined,
            q ? or(ilike(setFlashcard.title, `%${q}%`), ilike(setFlashcard.id, `%${q}%`)) : undefined,
          )
        )
        .orderBy(desc(setFlashcard.createdAt))
        .limit(50);

      for (const row of setRows) {
        // Also fetch cards for this set
        const cards = await db
          .select({
            id: flashcard.id,
            front: flashcard.front,
            back: flashcard.back,
            explanation: flashcard.explanation,
          })
          .from(flashcard)
          .where(eq(flashcard.setFlashcardId, row.id))
          .limit(20);

        items.push({
          id: row.id,
          productType: "flashcard",
          title: row.title,
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          chapterId: row.chapterId,
          status: row.status,
          contentMarkdown: "",
          extra: { cards },
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    // 4. Blueprint Asesmen
    if (type === "all" || type === "blueprint") {
      const blueprintRows = await db
        .select({
          id: blueprintAsesmen.id,
          title: blueprintAsesmen.title,
          assessmentType: blueprintAsesmen.assessmentType,
          blueprint: blueprintAsesmen.blueprint,
          status: blueprintAsesmen.status,
          courseId: blueprintAsesmen.mataKuliahId,
          createdAt: blueprintAsesmen.createdAt,
          updatedAt: blueprintAsesmen.updatedAt,
          courseCode: mataKuliah.code,
          courseTitle: mataKuliah.title,
        })
        .from(blueprintAsesmen)
        .leftJoin(mataKuliah, eq(blueprintAsesmen.mataKuliahId, mataKuliah.id))
        .where(
          and(
            courseId ? eq(blueprintAsesmen.mataKuliahId, courseId) : undefined,
            q ? or(ilike(blueprintAsesmen.title, `%${q}%`), ilike(blueprintAsesmen.id, `%${q}%`)) : undefined,
          )
        )
        .orderBy(desc(blueprintAsesmen.createdAt))
        .limit(50);

      for (const row of blueprintRows) {
        const bp = (row.blueprint ?? {}) as Record<string, any>;
        items.push({
          id: row.id,
          productType: "blueprint",
          title: row.title,
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          status: row.status,
          extra: {
            assessmentType: row.assessmentType,
            questionTargetCount: bp.questionTargetCount ?? bp.targetCount ?? null,
            targetChapterIds: bp.targetChapterIds ?? bp.chapterIds ?? null,
          },
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    // 5. Soal
    if (type === "all" || type === "question") {
      const soalRows = await db
        .select({
          id: soal.id,
          prompt: soal.prompt,
          questionType: soal.questionType,
          optionsSnapshot: soal.optionsSnapshot,
          difficulty: soal.difficulty,
          cognitiveLevel: soal.cognitiveLevel,
          reasoningPattern: soal.reasoningPattern,
          status: soal.status,
          courseId: soal.mataKuliahId,
          chapterId: soal.babId,
          createdAt: soal.createdAt,
          updatedAt: soal.updatedAt,
          courseCode: mataKuliah.code,
          courseTitle: mataKuliah.title,
        })
        .from(soal)
        .leftJoin(mataKuliah, eq(soal.mataKuliahId, mataKuliah.id))
        .where(
          and(
            courseId ? eq(soal.mataKuliahId, courseId) : undefined,
            q ? or(ilike(soal.prompt, `%${q}%`), ilike(soal.id, `%${q}%`)) : undefined,
          )
        )
        .orderBy(desc(soal.createdAt))
        .limit(50);

      for (const row of soalRows) {
        items.push({
          id: row.id,
          productType: "question",
          title: row.prompt.slice(0, 90),
          courseId: row.courseId,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          chapterId: row.chapterId,
          status: row.status,
          contentMarkdown: row.prompt,
          extra: {
            questionType: row.questionType,
            options: row.optionsSnapshot,
            difficulty: row.difficulty,
            cognitiveLevel: row.cognitiveLevel,
            reasoningPattern: row.reasoningPattern,
          },
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }

    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (err) {
    console.error("[Admin Products GET] Failed:", err);
    return NextResponse.json({ error: "FAILED_TO_LOAD_PRODUCTS" }, { status: 500 });
  }
}
