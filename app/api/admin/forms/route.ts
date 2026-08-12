import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { createCustomGoogleForm } from "@/lib/google-forms";
import { db } from "@/db";
import { googleForms } from "@/db/schema";
import { isNull, desc } from "drizzle-orm";
import { grantAdminEditorAccessToDriveItems } from "@/lib/google-drive-permissions";

export async function GET() {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const formsList = await db
      .select()
      .from(googleForms)
      .where(isNull(googleForms.deletedAt))
      .orderBy(desc(googleForms.createdAt));

    return NextResponse.json({ success: true, forms: formsList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list Google Forms" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let createdById: string | undefined;
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
      createdById = session.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const title = (body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Form title is required" }, { status: 400 });
    }

    const description = (body.description || "").trim() || undefined;
    const category = body.category || "survey";
    const questions = Array.isArray(body.questions) ? body.questions : [];

    const form = await createCustomGoogleForm(title, description, questions);

    if (env.FEATURE_DRIVE_EDITOR_SYNC === "1" && form.formId) {
      await grantAdminEditorAccessToDriveItems([form.formId]);
    }

    const formRecordId = crypto.randomUUID();
    const formTitle = form?.info?.title || title;
    const formDescription = form?.info?.description || description || null;
    const responderUri = form?.responderUri || `https://docs.google.com/forms/d/${form?.formId || ""}/viewform`;

    await db.insert(googleForms).values({
      id: formRecordId,
      formId: form.formId,
      title: formTitle,
      description: formDescription,
      responderUri,
      category,
      createdById,
    }).onConflictDoNothing();

    return NextResponse.json({ success: true, form });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create Google Form" }, { status: 500 });
  }
}
