import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { importantLinks } from "@/db/schema";
import { isNull, asc, max } from "drizzle-orm";
import { isValidHttpUrl, normalizeCategory, DEFAULT_ICON } from "@/lib/links";

export async function GET() {
  try {
    if (env.FEATURE_LINK_LIBRARY !== "1") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }

    const links = await db
      .select()
      .from(importantLinks)
      .where(isNull(importantLinks.deletedAt))
      .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));

    return NextResponse.json({ success: true, links });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list important links" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (env.FEATURE_LINK_LIBRARY !== "1") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    let createdById: string | undefined;
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }
    createdById = session.user.id;

    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    const url = String(body.url ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "Judul wajib diisi" }, { status: 400 });
    }
    if (!isValidHttpUrl(url)) {
      return NextResponse.json({ error: "URL harus diawali dengan http:// atau https://" }, { status: 400 });
    }

    const description = String(body.description ?? "").trim() || undefined;
    const category = normalizeCategory(body.category);
    const icon = String(body.icon ?? "").trim() || DEFAULT_ICON;
    const color = String(body.color ?? "").trim() || "neutral";
    const isActive = body.isActive !== false;

    const [maxRow] = await db
      .select({ value: max(importantLinks.sortOrder) })
      .from(importantLinks);
    const sortOrder = (maxRow?.value ?? 0) + 1;

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(importantLinks)
      .values({
        id,
        title,
        url,
        description,
        category,
        icon,
        color,
        sortOrder,
        isActive,
        createdById,
      })
      .returning();

    return NextResponse.json({ success: true, link: inserted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create important link" }, { status: 500 });
  }
}
