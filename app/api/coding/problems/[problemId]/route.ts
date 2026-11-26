import { requireCodingAccess, loadPublishedCodingProblem, codingErrorResponse } from "@/lib/coding/server-access";
import { readCodingSurface } from "@/lib/coding/http-contracts";
import { resolveLiveCodingSurface } from "@/lib/coding/live-server";
import { toPublicCodingProblem } from "@/lib/coding/contracts";
export async function GET(request: Request, { params }: { params: Promise<{ problemId: string }> }) {
  try {
    const url = new URL(request.url);
    const actor = await requireCodingAccess(request, url.searchParams.get("courseId") ?? "", true);
    const { problemId } = await params;
    const version = Number(url.searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) return Response.json({ error: "Versi masalah tidak valid." }, { status: 400 });
    const surface = readCodingSurface(url.searchParams.get("surface"));
    if (surface && surface.kind !== "live_quiz") throw new Error("CODING_INVALID_SURFACE");
    const problem = await loadPublishedCodingProblem(actor.courseId, problemId, version);
    const policy = surface ? await resolveLiveCodingSurface(surface, problem, actor.userId) : null;
    return Response.json({ problem: toPublicCodingProblem(problem), ...(policy ? { policy } : {}) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return codingErrorResponse(error); }
}
