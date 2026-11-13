import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { resolveCourseAccess } from "@/lib/student/course-access";
import { canAccessStudentQuizTemplate } from "@/lib/quiz/student-access";
import { storage } from "@/lib/storage";
import { buildQuizAttachmentKey, quizAttachmentPrefix, INVALID_OBJECT_KEY } from "@/lib/storage/keys";

async function canModifyAttempt(userId: string, templateId: string): Promise<boolean> {
  const [template] = await db.select().from(quizTemplates).where(eq(quizTemplates.id, templateId)).limit(1);
  return Boolean(template && canAccessStudentQuizTemplate(await resolveCourseAccess({ courseId: template.courseId, userId }), template));
}

const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB to stay below Vercel's 4.5 MB Function payload ceiling

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * Extracts lowercase file extension including the leading dot from a filename.
 */
function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

/**
 * Handles uploading student essay attachments for in-progress quiz attempts.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_SIZE_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "Ukuran berkas melebihi batas 4MB." },
      { status: 413 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Berkas tidak ditemukan." }, { status: 400 });
  }

  const attemptIdRaw = formData.get("attemptId");
  const attemptId = typeof attemptIdRaw === "string" ? attemptIdRaw.trim() : "";
  if (!attemptId) {
    return NextResponse.json({ error: "attemptId wajib diisi." }, { status: 400 });
  }

  const [attemptRecord] = await db
    .select({
      id: studentQuizAttempts.id,
      templateId: studentQuizAttempts.templateId,
      status: studentQuizAttempts.status,
    })
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.id, attemptId),
        eq(studentQuizAttempts.studentId, user.id)
      )
    )
    .limit(1);

  if (!attemptRecord || attemptRecord.status !== "in_progress") {
    return NextResponse.json(
      { error: "Sesi kuis tidak aktif atau sudah dikumpulkan." },
      { status: 403 }
    );
  }

  if (!await canModifyAttempt(user.id, attemptRecord.templateId)) return NextResponse.json({ error: "Akses kuis tidak tersedia." }, { status: 403 });

  const ext = getExtension(file.name);
  const expectedMime = ALLOWED_TYPES[ext];
  if (!expectedMime) {
    return NextResponse.json(
      { error: "Format berkas tidak didukung. Gunakan PDF, PNG, JPG, atau WebP." },
      { status: 415 }
    );
  }

  const normalizedMime = (file.type || "").toLowerCase();
  if (
    normalizedMime &&
    normalizedMime !== expectedMime &&
    !(normalizedMime === "image/jpg" && expectedMime === "image/jpeg")
  ) {
    return NextResponse.json(
      { error: "Tipe berkas tidak cocok dengan format yang diizinkan." },
      { status: 415 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Ukuran berkas melebihi batas 4MB." },
      { status: 413 }
    );
  }

  const key = buildQuizAttachmentKey({
    quizId: attemptRecord.templateId,
    filename: file.name,
  });

  try {
    const result = await storage.upload(file, file.name, expectedMime, {
      key,
      metadata: {
        uploadedBy: user.id,
        attemptId: attemptRecord.id,
        domain: "quiz-essay-attachment",
      },
    });

    // Atomic compare-and-swap to register attachment snapshot and prevent race conditions
    let registered = false;
    for (let retry = 0; retry < 3; retry++) {
      const [freshAttempt] = await db
        .select({
          id: studentQuizAttempts.id,
          status: studentQuizAttempts.status,
          answersSnapshot: studentQuizAttempts.answersSnapshot,
        })
        .from(studentQuizAttempts)
        .where(
          and(
            eq(studentQuizAttempts.id, attemptRecord.id),
            eq(studentQuizAttempts.status, "in_progress")
          )
        )
        .limit(1);

      if (!freshAttempt || freshAttempt.status !== "in_progress") {
        break;
      }

      const currentRawSnapshot = typeof freshAttempt.answersSnapshot === "string"
        ? freshAttempt.answersSnapshot
        : freshAttempt.answersSnapshot !== null
        ? JSON.stringify(freshAttempt.answersSnapshot)
        : null;

      const currentSnap = (freshAttempt.answersSnapshot as Record<string, any>) || {};
      const attachments = {
        ...(currentSnap._attachments || {}),
        [result.key]: {
          fileName: file.name,
          size: result.size,
          uploadedAt: new Date().toISOString(),
        },
      };

      const whereClause = and(
        eq(studentQuizAttempts.id, attemptRecord.id),
        eq(studentQuizAttempts.status, "in_progress"),
        currentRawSnapshot === null
          ? sql`${studentQuizAttempts.answersSnapshot} IS NULL`
          : sql`${studentQuizAttempts.answersSnapshot} = ${currentRawSnapshot}`
      );

      const updatedRows = await db
        .update(studentQuizAttempts)
        .set({
          answersSnapshot: {
            ...currentSnap,
            _attachments: attachments,
          },
        })
        .where(whereClause)
        .returning({ id: studentQuizAttempts.id });

      if (updatedRows.length > 0) {
        registered = true;
        break;
      }
    }

    if (!registered) {
      await storage.delete(key).catch(() => {});
      return NextResponse.json(
        { error: "Sesi kuis telah berakhir atau diperbarui sebelum berkas selesai didaftarkan." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      key: result.key,
      fileName: file.name,
      fileSize: `${(result.size / (1024 * 1024)).toFixed(2)} MB`,
      size: result.size,
      type: expectedMime,
    });
  } catch (err: any) {
    if (err?.message === INVALID_OBJECT_KEY) {
      return NextResponse.json({ error: "Kunci objek tidak aman." }, { status: 400 });
    }
    console.error("Quiz attachment upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal mengunggah berkas." },
      { status: 500 }
    );
  }
}

/**
 * Handles deleting a student's uploaded essay attachment from an in-progress quiz attempt.
 */
export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user;

  let body: { attemptId?: string; fileKey?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const { attemptId, fileKey } = body;
  if (!attemptId || !fileKey) {
    return NextResponse.json({ error: "attemptId dan fileKey wajib diisi." }, { status: 400 });
  }

  let deletedRecord = false;
  for (let retry = 0; retry < 3; retry++) {
    const [attemptRecord] = await db
      .select({
        id: studentQuizAttempts.id,
        templateId: studentQuizAttempts.templateId,
        status: studentQuizAttempts.status,
        answersSnapshot: studentQuizAttempts.answersSnapshot,
      })
      .from(studentQuizAttempts)
      .where(
        and(
          eq(studentQuizAttempts.id, attemptId),
          eq(studentQuizAttempts.studentId, user.id),
          eq(studentQuizAttempts.status, "in_progress")
        )
      )
      .limit(1);

    if (!attemptRecord || attemptRecord.status !== "in_progress") {
      return NextResponse.json(
        { error: "Sesi kuis tidak aktif atau sudah dikumpulkan." },
        { status: 403 }
      );
    }

    if (!await canModifyAttempt(user.id, attemptRecord.templateId)) return NextResponse.json({ error: "Akses kuis tidak tersedia." }, { status: 403 });

    const expectedPrefix = quizAttachmentPrefix(attemptRecord.templateId);
    if (!fileKey.startsWith(expectedPrefix)) {
      return NextResponse.json(
        { error: "Kunci berkas tidak valid untuk sesi kuis ini." },
        { status: 403 }
      );
    }

    const currentSnap = (attemptRecord.answersSnapshot as Record<string, any>) || {};
    const attachments = { ...((currentSnap._attachments as Record<string, any>) || {}) };
    if (!attachments[fileKey]) {
      return NextResponse.json(
        { error: "Lampiran tidak ditemukan atau tidak memiliki hak akses." },
        { status: 403 }
      );
    }

    delete attachments[fileKey];

    const currentRawSnapshot = typeof attemptRecord.answersSnapshot === "string"
      ? attemptRecord.answersSnapshot
      : attemptRecord.answersSnapshot !== null
      ? JSON.stringify(attemptRecord.answersSnapshot)
      : null;

    const whereClause = and(
      eq(studentQuizAttempts.id, attemptRecord.id),
      eq(studentQuizAttempts.status, "in_progress"),
      currentRawSnapshot === null
        ? sql`${studentQuizAttempts.answersSnapshot} IS NULL`
        : sql`${studentQuizAttempts.answersSnapshot} = ${currentRawSnapshot}`
    );

    const updatedRows = await db
      .update(studentQuizAttempts)
      .set({
        answersSnapshot: {
          ...currentSnap,
          _attachments: attachments,
        },
      })
      .where(whereClause)
      .returning({ id: studentQuizAttempts.id });

    if (updatedRows.length > 0) {
      deletedRecord = true;
      break;
    }
  }

  if (!deletedRecord) {
    return NextResponse.json(
      { error: "Gagal menghapus lampiran karena sesi kuis telah berubah atau berakhir." },
      { status: 409 }
    );
  }

  try {
    await storage.delete(fileKey);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Quiz attachment delete error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal menghapus berkas." },
      { status: 500 }
    );
  }
}


