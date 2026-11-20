import { NextResponse } from "next/server";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { customForms } from "@/db/schema";
import { auth } from "@/lib/auth";
import { detectFormFileMime } from "@/lib/forms/file-types";
import { formFileSizeLimitMb } from "@/lib/forms/presentation";
import { getFormClosedReason, getFormRespondentError } from "@/lib/forms/response-policy";
import { storage } from "@/lib/storage";
import { buildFormStorageKey } from "@/lib/forms/storage-utils";

export async function POST(req: Request) {
  try {
    const formData = await req.formData().catch(() => null);
    const file = formData?.get("file");
    const formIdentifier = formData?.get("formSlug");
    const questionField = formData?.get("questionNumber");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Pilih berkas yang akan diunggah." }, { status: 400 });
    }
    if (typeof formIdentifier !== "string" || !formIdentifier.trim() ||
        typeof questionField !== "string" || !/^[1-9]\d*$/.test(questionField)) {
      return NextResponse.json({ error: "Formulir dan nomor pertanyaan wajib diisi." }, { status: 400 });
    }

    const formIdOrSlug = formIdentifier.trim();
    const [form] = await db
      .select({
        slug: customForms.slug,
        title: customForms.title,
        questions: customForms.questions,
        settings: customForms.settings,
      })
      .from(customForms)
      .where(and(
        isNull(customForms.deletedAt),
        or(eq(customForms.id, formIdOrSlug), eq(customForms.slug, formIdOrSlug.toLowerCase())),
      ))
      .limit(1);
    if (!form) {
      return NextResponse.json({ error: "Formulir tidak ditemukan." }, { status: 404 });
    }

    const settings = form.settings || {};
    const closedReason = getFormClosedReason(settings);
    if (closedReason) {
      return NextResponse.json({ error: closedReason }, { status: 403 });
    }

    if (settings.requireLogin || settings.collectEmail === "verified") {
      const session = await auth.api.getSession({ headers: req.headers });
      const respondentError = getFormRespondentError(settings, session?.user);
      if (respondentError) {
        return NextResponse.json({ error: respondentError.message }, { status: respondentError.status });
      }
    }

    const questionNumber = Number(questionField);
    const question = form.questions[questionNumber - 1];
    if (question?.type !== "FILE_UPLOAD") {
      return NextResponse.json({ error: "Pertanyaan unggah berkas tidak ditemukan." }, { status: 404 });
    }

    const maxSizeMb = formFileSizeLimitMb(question.maxFileSizeMb);
    if (file.size > maxSizeMb * 1024 * 1024) {
      return NextResponse.json({ error: `Maksimal ${maxSizeMb} MB per berkas.` }, { status: 400 });
    }
    const mime = await detectFormFileMime(file, question.allowedFileTypes);
    if (!mime) {
      return NextResponse.json({ error: "Pilih berkas yang valid dengan format yang diizinkan untuk pertanyaan ini." }, { status: 415 });
    }

    const key = buildFormStorageKey({
      formTitle: form.title,
      formSlug: form.slug,
      questionNumber,
      filename: file.name,
    });
    const upload = await storage.upload(file, file.name, mime, { key });

    return NextResponse.json({
      success: true,
      key: upload.key,
      url: storage.getUrl(upload.key),
    });
  } catch (err) {
    console.error("Public Form Upload Error:", err);
    return NextResponse.json({ error: "Gagal mengunggah berkas." }, { status: 500 });
  }
}
