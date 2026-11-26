import { findPublicMeeting } from "@/lib/meet/public-meeting";

const headers = { "Cache-Control": "no-store" };

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const meeting = await findPublicMeeting(slug);
  return meeting
    ? Response.json({ title: meeting.title }, { headers })
    : Response.json({ error: "meeting-unavailable" }, { status: 404, headers });
}
