import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { customForms, customFormResponses } from "@/db/schema";
import { eq, or, isNull, and } from "drizzle-orm";
import { findShortFormMeeting } from "@/lib/forms/short-entry";
import { describeFormClosure, getFormClosure, getFormClosedReason, getFormRespondentError } from "@/lib/forms/response-policy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ idOrSlug: string }> }
) {
  try {
    const { idOrSlug } = await params;
    if (new URL(req.url).searchParams.get("entry") === "short") {
      const meetingUri = await findShortFormMeeting(idOrSlug);
      if (meetingUri) return NextResponse.json({ success: true, destination: "meeting", meetingUri });
    }


    const [form] = await db
      .select({
        id: customForms.id,
        slug: customForms.slug,
        title: customForms.title,
        description: customForms.description,
        category: customForms.category,
        questions: customForms.questions,
        settings: customForms.settings,
      })
      .from(customForms)
      .where(
        and(
          isNull(customForms.deletedAt),
          or(eq(customForms.id, idOrSlug), eq(customForms.slug, idOrSlug.toLowerCase()))
        )
      )
      .limit(1);

    if (!form) {
      return NextResponse.json({ error: "Formulir tidak ditemukan atau telah dihapus." }, { status: 404 });
    }

    const closure = getFormClosure(form.settings || {});
    if (closure) {
      return NextResponse.json({ success: false, form, isClosed: true, closure, closedReason: describeFormClosure(closure) });
    }

    return NextResponse.json({ success: true, form, isClosed: false });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Gagal mengambil data formulir." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ idOrSlug: string }> }
) {
  try {
    const { idOrSlug } = await params;
    const exactId = new URL(req.url).searchParams.get("target") === "id";
    const session = await auth.api.getSession({ headers: req.headers });

    const [form] = await db
      .select({
        id: customForms.id,
        slug: customForms.slug,
        questions: customForms.questions,
        settings: customForms.settings,
        deletedAt: customForms.deletedAt,
      })
      .from(customForms)
      .where(
        and(
          isNull(customForms.deletedAt),
          exactId ? eq(customForms.id, idOrSlug) : or(eq(customForms.id, idOrSlug), eq(customForms.slug, idOrSlug.toLowerCase()))
        )
      )
      .limit(1);

    if (!form) {
      return NextResponse.json({ error: "Formulir tidak ditemukan." }, { status: 404 });
    }

    const settings = form.settings || {};
    const closedReason = getFormClosedReason(settings);
    if (closedReason) {
      return NextResponse.json({ error: closedReason }, { status: 403 });
    }

    const respondentError = getFormRespondentError(settings, session?.user);
    if (respondentError) {
      return NextResponse.json({ error: respondentError.message }, { status: respondentError.status });
    }

    // Check 1 Response Limit
    if (settings.limitToOneResponse && session?.user?.id) {
      const existingUserResponse = await db
        .select({ id: customFormResponses.id })
        .from(customFormResponses)
        .where(
          and(
            eq(customFormResponses.formId, form.id),
            eq(customFormResponses.responderUserId, session.user.id)
          )
        )
        .limit(1);

      if (existingUserResponse.length > 0) {
        return NextResponse.json(
          { error: "Anda sudah pernah mengisi formulir ini (Dibatasi 1 kali pengisian)." },
          { status: 403 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const answers = body.answers || {};
    let responderEmail: string | null = null;
    if (settings.collectEmail === "verified") {
      responderEmail = session?.user.email ?? null;
    } else if (settings.collectEmail === "input") {
      const submittedEmail = typeof body.responderEmail === "string" ? body.responderEmail.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail)) {
        return NextResponse.json(
          { error: "Alamat email wajib diisi dengan format yang benar." },
          { status: 400 }
        );
      }
      responderEmail = submittedEmail;
    }

    // Validate required questions (SECTION items are not answerable questions)
    const questions = form.questions as any[];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.type === "SECTION") continue;
      if (q.required) {
        const val = answers[i] ?? answers[q.title];
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          return NextResponse.json(
            { error: `Pertanyaan "${q.title || `Soal #${i + 1}`}" wajib diisi.` },
            { status: 400 }
          );
        }
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      if (question.type === "SECTION" || !question.otherOption?.enabled) continue;
      const value = answers[i] ?? answers[question.title];
      if (value === "\uE000__other__" || (Array.isArray(value) && value.includes("\uE000__other__"))) {
        return NextResponse.json(
          { error: `Pilihan lainnya pada pertanyaan "${question.title || `Soal #${i + 1}`}" wajib dijelaskan.` },
          { status: 400 }
        );
      }
    }

    const responseId = crypto.randomUUID();
    const [submission] = await db
      .insert(customFormResponses)
      .values({
        id: responseId,
        formId: form.id,
        responderUserId: session?.user?.id || null,
        responderEmail,
        answers,
      })
      .returning();

    return NextResponse.json({
      success: true,
      submission,
      message: settings.customSuccessMessage || "Jawaban Anda telah berhasil disimpan.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Gagal menyimpan pengisian formulir." }, { status: 500 });
  }
}
