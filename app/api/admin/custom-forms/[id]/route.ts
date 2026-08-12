import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { customForms, customFormResponses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
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

    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.description !== undefined) updateData.description = String(body.description).trim() || null;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.questions !== undefined) updateData.questions = body.questions;
    if (body.settings !== undefined) updateData.settings = body.settings;

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

    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
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
