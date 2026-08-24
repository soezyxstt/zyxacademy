import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { enrollments, exams, mataKuliah } from "@/db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import { storage } from "@/lib/storage";
import { buildExamAttachmentKey, INVALID_OBJECT_KEY } from "@/lib/storage/keys";
import { resolveActorRoles } from "@/lib/tutor/assessment-policy";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = session.user;

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_SIZE_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "Ukuran berkas melebihi batas 10MB." },
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

  const examIdRaw = formData.get("examId");
  const examId = typeof examIdRaw === "string" ? examIdRaw.trim() : "";
  if (!examId) {
    return NextResponse.json({ error: "examId wajib diisi." }, { status: 400 });
  }

  const [examRecord] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!examRecord || examRecord.type !== "tryout" || examRecord.status !== "published") {
    return NextResponse.json({ error: "Tryout tidak tersedia." }, { status: 404 });
  }

  const [canonicalCourse] = await db
    .select({ id: mataKuliah.id, legacyCourseId: mataKuliah.legacyCourseId })
    .from(mataKuliah)
    .where(eq(mataKuliah.id, examRecord.courseId))
    .limit(1);

  const courseIds = Array.from(
    new Set(
      [
        examRecord.courseId,
        canonicalCourse?.id,
        canonicalCourse?.legacyCourseId,
      ].filter((id): id is string => Boolean(id))
    )
  );

  const { isAdmin } = await resolveActorRoles(user.id, (user as { role?: string | null }).role);

  if (!isAdmin) {
    const [enrollment] = await db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.userId, user.id),
          inArray(enrollments.courseId, courseIds),
          gt(enrollments.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!enrollment) {
      return NextResponse.json(
        { error: "Anda tidak berwenang mengunggah berkas untuk tryout ini." },
        { status: 403 }
      );
    }
  }

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
      { error: "Ukuran berkas melebihi batas 10MB." },
      { status: 413 }
    );
  }

  const key = buildExamAttachmentKey({ examId, filename: file.name });

  try {
    const result = await storage.upload(file, file.name, expectedMime, {
      key,
      metadata: {
        uploadedBy: user.id,
        domain: "exam-essay-attachment",
      },
    });

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
    console.error("Exam attachment upload error:", err);
    return NextResponse.json(
      { error: err?.message || "Gagal mengunggah berkas." },
      { status: 500 }
    );
  }
}
