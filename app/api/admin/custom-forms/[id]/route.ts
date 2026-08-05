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
