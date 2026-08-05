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

    const settings = form.settings || {};
    const now = new Date();

    // Check acceptingResponses toggle
    if (settings.acceptingResponses === false) {
      return NextResponse.json({
        success: false,
        form,
        isClosed: true,
        closedReason: settings.closedMessage || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan.",
      });
    }

    // Check openAt schedule
    if (settings.openAt && now < new Date(settings.openAt)) {
      return NextResponse.json({
        success: false,
        form,
        isClosed: true,
        closedReason: `Formulir belum dibuka. Jadwal pembukaan: ${new Date(settings.openAt).toLocaleString("id-ID")}`,
      });
    }

    // Check closeAt schedule
    if (settings.closeAt && now > new Date(settings.closeAt)) {
      return NextResponse.json({
        success: false,
        form,
        isClosed: true,
        closedReason: settings.closedMessage || `Formulir telah ditutup secara otomatis pada ${new Date(settings.closeAt).toLocaleString("id-ID")}`,
      });
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

    const settings = form.settings || {};
    const now = new Date();

    // Check acceptingResponses toggle
    if (settings.acceptingResponses === false) {
      return NextResponse.json(
        { error: settings.closedMessage || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan." },
        { status: 403 }
      );
    }

    // Check schedule
    if (settings.openAt && now < new Date(settings.openAt)) {
      return NextResponse.json(
        { error: `Formulir belum dibuka. Jadwal pembukaan: ${new Date(settings.openAt).toLocaleString("id-ID")}` },
        { status: 403 }
      );
    }
    if (settings.closeAt && now > new Date(settings.closeAt)) {
      return NextResponse.json(
        { error: settings.closedMessage || `Formulir telah ditutup pada ${new Date(settings.closeAt).toLocaleString("id-ID")}` },
        { status: 403 }
      );
    }

    // Check Login Requirement
    if (settings.requireLogin && !session?.user) {
      return NextResponse.json(
        { error: "Anda harus login ke akun Zyx untuk mengisi formulir ini." },
        { status: 401 }
      );
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
      message: settings.customSuccessMessage || "Jawaban Anda telah berhasil disimpan.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Gagal menyimpan pengisian formulir." }, { status: 500 });
  }
}
