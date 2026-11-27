import { listPublicLinks } from "@/lib/public-links";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ links: await listPublicLinks() }, { headers: { "Cache-Control": "no-store" } });
}
