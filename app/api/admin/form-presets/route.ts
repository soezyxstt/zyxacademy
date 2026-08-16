import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { customFormPresets } from "@/db/schema";
import { desc } from "drizzle-orm";

const VALID_CATEGORIES = ["survey", "quiz", "feedback", "registration"] as const;

async function requireAdmin(): Promise<string | null> {
  if (env.FEATURE_FORM_PRESETS !== "1") {
    return "NotFound. Feature disabled.";
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
    return "Unauthorized. Admin role required.";
  }
  return session.user.id;
}

export async function GET() {
  try {
    const adminId = await requireAdmin();
    if (adminId && adminId.startsWith("NotFound")) {
      return NextResponse.json({ error: "Preset formulir belum diaktifkan." }, { status: 404 });
    }
    if (adminId && adminId.startsWith("Unauthorized")) {
      return NextResponse.json({ error: adminId }, { status: 403 });
    }

    const presets = await db
      .select({
        id: customFormPresets.id,
        name: customFormPresets.name,
        description: customFormPresets.description,
        category: customFormPresets.category,
        questions: customFormPresets.questions,
        settings: customFormPresets.settings,
        createdById: customFormPresets.createdById,
        createdAt: customFormPresets.createdAt,
        updatedAt: customFormPresets.updatedAt,
      })
      .from(customFormPresets)
      .orderBy(desc(customFormPresets.createdAt));

    return NextResponse.json({ success: true, presets });
  } catch (error: any) {
    console.error("Failed to list form presets:", error);
    return NextResponse.json({ error: error.message || "Failed to list form presets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const adminId = await requireAdmin();
    if (adminId && adminId.startsWith("NotFound")) {
      return NextResponse.json({ error: "Preset formulir belum diaktifkan." }, { status: 404 });
    }
    if (adminId && adminId.startsWith("Unauthorized")) {
      return NextResponse.json({ error: adminId }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const name = (body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Nama preset wajib diisi." }, { status: 400 });
    }

    const category = VALID_CATEGORIES.includes(body.category) ? body.category : "survey";
    const questions = Array.isArray(body.questions) ? body.questions : [];
    const settings = body.settings && typeof body.settings === "object" ? body.settings : null;

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(customFormPresets)
      .values({
        id,
        name,
        description: (body.description || "").trim() || null,
        category,
        questions,
        settings,
        createdById: adminId || null,
      })
      .returning();

    return NextResponse.json({ success: true, preset: inserted });
  } catch (error: any) {
    console.error("Failed to create form preset:", error);
    return NextResponse.json({ error: error.message || "Failed to create form preset" }, { status: 500 });
  }
}
