import { NextResponse } from "next/server";
import { db } from "@/db";
import { shortLink } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Find the short link
  const link = await db.query.shortLink.findFirst({
    where: eq(shortLink.slug, slug),
  });

  if (!link) {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Increment clicks in the background without blocking the redirect
  db.update(shortLink)
    .set({ clicks: sql`${shortLink.clicks} + 1` })
    .where(eq(shortLink.id, link.id))
    .execute()
    .catch((err) => {
      console.error("Failed to increment short link clicks", err);
    });

  return NextResponse.redirect(link.url);
}
