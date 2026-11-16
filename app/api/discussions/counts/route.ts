import { auth } from "@/lib/auth";
import { getDiscussionCounts } from "@/lib/discussions/service";
import { getSessionDiscussionActor } from "@/lib/discussions/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) return Response.json({ error: "Masuk untuk melihat diskusi." }, { status: 401, headers });
    const actor = await getSessionDiscussionActor();
    if (actor.id !== session.user.id) throw new Error("DISCUSSION_UNAVAILABLE");
    const courseId = new URL(request.url).searchParams.get("courseId") ?? undefined;
    return Response.json(await getDiscussionCounts(actor.id, { courseId }), { headers });
  } catch {
    return Response.json({ error: "Jumlah diskusi belum tersedia." }, { status: 503, headers });
  }
}
