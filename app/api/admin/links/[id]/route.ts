import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { importantLinks } from "@/db/schema";
import { eq, isNull, asc } from "drizzle-orm";
import { isValidHttpUrl, normalizeCategory, DEFAULT_ICON } from "@/lib/links";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));

    if (body.move === "up" || body.move === "down") {
      const all = await db
        .select()
        .from(importantLinks)
        .where(isNull(importantLinks.deletedAt))
        .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));

      const index = all.findIndex((l) => l.id === id);
      if (index === -1) {
        return NextResponse.json({ error: "Link not found" }, { status: 404 });
      }
      const targetIndex = body.move === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= all.length) {
        return NextResponse.json({ error: "Link is already at the edge" }, { status: 400 });
      }

      const current = all[index];
      const target = all[targetIndex];

      const [updated] = await db
        .update(importantLinks)
        .set({ sortOrder: target.sortOrder, updatedAt: new Date() })
        .where(eq(importantLinks.id, current.id))
        .returning();
      await db
        .update(importantLinks)
        .set({ sortOrder: current.sortOrder, updatedAt: new Date() })
        .where(eq(importantLinks.id, target.id));

      return NextResponse.json({ success: true, link: updated });
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) {
        return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
      }
      updateData.title = title;
    }
    if (body.url !== undefined) {
      const url = String(body.url).trim();
      if (!isValidHttpUrl(url)) {
        return NextResponse.json({ error: "URL harus diawali dengan http:// atau https://" }, { status: 400 });
      }
      updateData.url = url;
    }
    if (body.description !== undefined) updateData.description = String(body.description).trim() || null;
    if (body.category !== undefined) updateData.category = normalizeCategory(body.category);
    if (body.icon !== undefined) updateData.icon = String(body.icon).trim() || DEFAULT_ICON;
    if (body.color !== undefined) updateData.color = String(body.color).trim() || "neutral";
    if (body.isActive !== undefined) updateData.isActive = body.isActive === true;

    const [updated] = await db
      .update(importantLinks)
      .set(updateData)
      .where(eq(importantLinks.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, link: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update important link" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const [updated] = await db
      .update(importantLinks)
      .set({ deletedAt: new Date() })
      .where(eq(importantLinks.id, id))
      .returning({ id: importantLinks.id });

    if (!updated) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Link deleted" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete important link" }, { status: 500 });
  }
}
