import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { getGoogleFormAnalytics } from "@/lib/google-forms";
import { db } from "@/db";
import { googleForms } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Form ID is required" }, { status: 400 });
    }

    const analytics = await getGoogleFormAnalytics(id);
    return NextResponse.json({ success: true, analytics });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch form analytics" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Form ID is required" }, { status: 400 });
    }

    await db
      .update(googleForms)
      .set({ deletedAt: new Date() })
      .where(eq(googleForms.formId, id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete Google Form" }, { status: 500 });
  }
}
