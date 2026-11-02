import { NextResponse } from "next/server";
import { db } from "@/db";
import { shortLink } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { hasPeran } from "@/lib/auth/authorization";

async function adminUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await hasPeran(session.user.id, "admin"))) return null;
  return session.user;
}

export async function GET() {
  try {
    if (!(await adminUser())) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }
    
    const links = await db.query.shortLink.findMany({
      orderBy: [desc(shortLink.createdAt)],
    });
    
    return NextResponse.json(links);
  } catch (error) {
    console.error("Error fetching short links:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await adminUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
    }
    const body = await request.json();
    const { url, slug: customSlug, title } = body;

    if (!url) {
      return new NextResponse("URL is required", { status: 400 });
    }

    // Generate a slug if not provided
    const slug = customSlug || randomBytes(3).toString("hex");

    // create ID
    const id = "sl_" + randomBytes(8).toString("hex");

    await db.insert(shortLink).values({
      id,
      slug,
      url,
      title,
      userId: user.id,
    });

    const newLink = await db.query.shortLink.findFirst({
      where: eq(shortLink.id, id),
    });

    return NextResponse.json(newLink);
  } catch (error: any) {
    console.error("Error creating short link:", error);
    if (error?.message?.includes("UNIQUE constraint failed")) {
       return new NextResponse("Slug already exists", { status: 400 });
    }
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
