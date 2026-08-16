import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { customFormPresets } from "@/db/schema";
import { eq } from "drizzle-orm";

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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const adminId = await requireAdmin();
    if (adminId && adminId.startsWith("NotFound")) {
      return NextResponse.json({ error: "Preset formulir belum diaktifkan." }, { status: 404 });
    }
    if (adminId && adminId.startsWith("Unauthorized")) {
      return NextResponse.json({ error: adminId }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name) {
        return NextResponse.json({ error: "Nama preset wajib diisi." }, { status: 400 });
      }
      updateData.name = name;
    }
    if (body.description !== undefined) {
      updateData.description = String(body.description).trim() || null;
    }

    const [updated] = await db
      .update(customFormPresets)
      .set(updateData)
      .where(eq(customFormPresets.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Preset tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ success: true, preset: updated });
  } catch (error: any) {
    console.error("Failed to update form preset:", error);
    return NextResponse.json({ error: error.message || "Failed to update form preset" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const adminId = await requireAdmin();
    if (adminId && adminId.startsWith("NotFound")) {
      return NextResponse.json({ error: "Preset formulir belum diaktifkan." }, { status: 404 });
    }
    if (adminId && adminId.startsWith("Unauthorized")) {
      return NextResponse.json({ error: adminId }, { status: 403 });
    }

    await db.delete(customFormPresets).where(eq(customFormPresets.id, id));

    return NextResponse.json({ success: true, message: "Preset deleted successfully" });
  } catch (error: any) {
    console.error("Failed to delete form preset:", error);
    return NextResponse.json({ error: error.message || "Failed to delete form preset" }, { status: 500 });
  }
}
