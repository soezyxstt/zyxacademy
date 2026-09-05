import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { customForms, customFormResponses, googleMeetSessions } from "@/db/schema";
import { eq, desc, and, isNull, ne } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const [form] = await db
      .select()
      .from(customForms)
      .where(eq(customForms.id, id))
      .limit(1);

    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    const responses = await db
      .select()
      .from(customFormResponses)
      .where(eq(customFormResponses.formId, id))
      .orderBy(desc(customFormResponses.submittedAt));

    return NextResponse.json({
      success: true,
      form,
      responses,
      totalSubmissions: responses.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch form details" }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ error: "Nama / Judul Formulir tidak boleh kosong." }, { status: 400 });
      }
      updateData.title = title;
    }
    if (body.description !== undefined) updateData.description = String(body.description).trim() || null;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.questions !== undefined) {
      if (!Array.isArray(body.questions)) {
        return NextResponse.json({ error: "Format pertanyaan tidak valid." }, { status: 400 });
      }
      updateData.questions = body.questions;
    }
    if (body.slug !== undefined) {
      const slug = String(body.slug).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      if (slug) {
        const [existingForm, existingMeet] = await Promise.all([
          db
            .select({ id: customForms.id })
            .from(customForms)
            .where(and(eq(customForms.slug, slug), ne(customForms.id, id), isNull(customForms.deletedAt)))
            .limit(1),
          db
            .select({ id: googleMeetSessions.id })
            .from(googleMeetSessions)
            .where(and(eq(googleMeetSessions.slug, slug), isNull(googleMeetSessions.deletedAt)))
            .limit(1),
        ]);
        if (existingForm.length > 0 || existingMeet.length > 0) {
          return NextResponse.json(
            { error: "Slug tautan pendek sudah digunakan oleh formulir atau sesi lain." },
            { status: 400 }
          );
        }
        updateData.slug = slug;
      }
    }
    if (body.settings !== undefined) {
      const settings = body.settings as Record<string, unknown>;
      const openAt = typeof settings.openAt === "string" && settings.openAt ? new Date(settings.openAt) : null;
      const closeAt = typeof settings.closeAt === "string" && settings.closeAt ? new Date(settings.closeAt) : null;
      if (openAt && closeAt && openAt.getTime() >= closeAt.getTime()) {
        return NextResponse.json(
          { error: "Jadwal buka harus lebih awal dari jadwal tutup." },
          { status: 400 }
        );
      }
      updateData.settings = settings;
    }

    const [updated] = await db
      .update(customForms)
      .set(updateData)
      .where(eq(customForms.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, form: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update form settings" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    await db
      .update(customForms)
      .set({ deletedAt: new Date() })
      .where(eq(customForms.id, id));

    return NextResponse.json({ success: true, message: "Form deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete form" }, { status: 500 });
  }
}
