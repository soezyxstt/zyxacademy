import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { customForms, customFormResponses } from "@/db/schema";
import { isNull, desc, eq, count } from "drizzle-orm";
import { createCustomGoogleForm } from "@/lib/google-forms";

function generateShortSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function GET() {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const formsList = await db
      .select({
        id: customForms.id,
        slug: customForms.slug,
        title: customForms.title,
        description: customForms.description,
        category: customForms.category,
        questions: customForms.questions,
        settings: customForms.settings,
        googleFormId: customForms.googleFormId,
        googleResponderUri: customForms.googleResponderUri,
        createdById: customForms.createdById,
        createdAt: customForms.createdAt,
        updatedAt: customForms.updatedAt,
        totalResponses: count(customFormResponses.id),
      })
      .from(customForms)
      .leftJoin(customFormResponses, eq(customForms.id, customFormResponses.formId))
      .where(isNull(customForms.deletedAt))
      .groupBy(customForms.id)
      .orderBy(desc(customForms.createdAt));

    return NextResponse.json({ success: true, forms: formsList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list custom forms" }, { status: 500 });
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
    const settings = body.settings || { acceptingResponses: true };

    let slug = (body.slug || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!slug) {
      slug = generateShortSlug();
    }

    // Check slug collision
    const existing = await db
      .select({ id: customForms.id })
      .from(customForms)
      .where(eq(customForms.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      slug = `${slug}-${generateShortSlug().slice(0, 4)}`;
    }

    // Optional Google Form Sync
    let googleFormId: string | undefined;
    let googleResponderUri: string | undefined;

    try {
      const gForm = await createCustomGoogleForm(title, description, questions);
      if (gForm?.formId) {
        googleFormId = gForm.formId;
        googleResponderUri = gForm.responderUri;
      }
    } catch (gErr) {
      console.warn("Optional Google Form Sync Warning:", gErr);
    }

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(customForms)
      .values({
        id,
        slug,
        title,
        description,
        category,
        questions,
        settings,
        googleFormId,
        googleResponderUri,
        createdById,
      })
      .returning();

    return NextResponse.json({
      success: true,
      form: inserted,
      shortUrl: `/f/${inserted.slug}`,
      fullUrl: `/forms/${inserted.id}`,
    });
  } catch (error: any) {
    console.error("Failed to create custom form:", error);
    return NextResponse.json({ error: error.message || "Failed to create custom form" }, { status: 500 });
  }
}
