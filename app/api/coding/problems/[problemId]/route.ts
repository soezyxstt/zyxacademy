import { requireCodingAccess, loadPublishedCodingProblem, codingErrorResponse } from "@/lib/coding/server-access";
import { toPublicCodingProblem } from "@/lib/coding/contracts";
export async function GET(request: Request, { params }: { params: Promise<{ problemId: string }> }) {
  try {
    const url = new URL(request.url);
    const actor = await requireCodingAccess(request, url.searchParams.get("courseId") ?? "");
    const { problemId } = await params;
    const version = Number(url.searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) return Response.json({ error: "Versi masalah tidak valid." }, { status: 400 });
    return Response.json({ problem: toPublicCodingProblem(await loadPublishedCodingProblem(actor.courseId, problemId, version)) });
  } catch (error) { return codingErrorResponse(error); }
}
