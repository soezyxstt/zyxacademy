import { NextResponse } from "next/server";
import { db } from "@/db";
import { shortLink } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
// import { auth } from "@/lib/auth"; // Need to make sure how auth is handled for admin

export async function GET() {
  try {
    // Optionally: check auth for admin
    
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
      // userId: user.id // if we have auth
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
