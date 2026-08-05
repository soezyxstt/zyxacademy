import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { customForms, customFormResponses } from "@/db/schema";
import { eq, or, isNull, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ idOrSlug: string }> }
) {
  try {
    const { idOrSlug } = await params;

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

    return NextResponse.json({ success: true, form });
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
    const session = await auth.api.getSession({ headers: await headers() });

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
          or(eq(customForms.id, idOrSlug), eq(customForms.slug, idOrSlug.toLowerCase()))
        )
      )
      .limit(1);

    if (!form) {
      return NextResponse.json({ error: "Formulir tidak ditemukan." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const answers = body.answers || {};
    const responderEmail = (body.responderEmail || session?.user?.email || "").trim();

    // Validate required questions
    const questions = form.questions as any[];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
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

    const responseId = crypto.randomUUID();
    const [submission] = await db
      .insert(customFormResponses)
      .values({
        id: responseId,
        formId: form.id,
        responderUserId: session?.user?.id || null,
        responderEmail: responderEmail || null,
        answers,
      })
      .returning();

    return NextResponse.json({
      success: true,
      submission,
      message: form.settings?.customSuccessMessage || "Jawaban Anda telah berhasil disimpan.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Gagal menyimpan pengisian formulir." }, { status: 500 });
  }
}
