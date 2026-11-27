import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { authorizeNativeMaterialPdf, readNativeMaterialPdf } from "@/lib/student/native-material-pdf";
import { materialPdfId, MATERIAL_PDF_HEADERS } from "@/packages/native-parity/student/courses/pdf";
import { pdfPageTextMatch, pdfSearchRequest } from "@/packages/native-parity/student/courses/pdf-search";
import { readNativeStudentJson } from "../_request";
import { requireNativeStudent } from "../_session";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function unavailable(status: number) {
  return new Response(null, { status, headers: noStore });
}

async function handle(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const query = new URL(request.url).searchParams;
  const courseId = query.get("courseId");
  const materialId = query.get("materialId");
  const download = query.get("download") === "1";
  if (query.size !== (download ? 3 : 2) || !courseId || !materialId || !materialPdfId(courseId) || !materialPdfId(materialId)) return unavailable(400);
  const origin = new URL(resolveAuthBaseUrl()).origin;
  const target = { courseId, materialId };

  try {
    const grant = await authorizeNativeMaterialPdf(actor.userId, target, origin, download);
    const expected = request.headers.get("If-Match");
    if (expected && expected !== `"${grant.revision}"`) return unavailable(409);
    const headers = new Headers({ ...noStore, [MATERIAL_PDF_HEADERS.revision]: grant.revision,
      [MATERIAL_PDF_HEADERS.expiresAt]: String(grant.until) });
    if (request.method === "HEAD") return new Response(null, { headers });
    const bytes = await readNativeMaterialPdf(grant.source, request.signal);
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    const latest = await authorizeNativeMaterialPdf(current.userId, target, origin, download);
    if (latest.revision !== grant.revision) return unavailable(409);
    headers.set(MATERIAL_PDF_HEADERS.expiresAt, String(latest.until));
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Content-Disposition", download ? "attachment" : "inline");
    return new Response(bytes as unknown as BodyInit, { headers });
  } catch (error) {
    return unavailable(error instanceof OfflineHttpError ? error.status : 503);
  }
}

export const HEAD = handle;
export const GET = handle;

export async function POST(request: Request) {
  const actor = await requireNativeStudent(request);
  if (actor instanceof Response) return actor;
  const params = new URL(request.url).searchParams;
  const courseId = params.get("courseId");
  const materialId = params.get("materialId");
  if (params.size !== 2 || !courseId || !materialId || !materialPdfId(courseId) || !materialPdfId(materialId)) return unavailable(400);
  const input = pdfSearchRequest.safeParse(await readNativeStudentJson(request, 1024).catch(() => null));
  if (!input.success) return unavailable(400);
  const target = { courseId, materialId };
  const origin = new URL(resolveAuthBaseUrl()).origin;
  try {
    const grant = await authorizeNativeMaterialPdf(actor.userId, target, origin);
    const { revision, query, from, to } = input.data;
    if (revision !== grant.revision) return unavailable(409);
    const bytes = await readNativeMaterialPdf(grant.source, request.signal);
    if (request.signal.aborted || Date.now() >= grant.until) return unavailable(403);
    const { parseStoredPdfPages } = await import("@/lib/compute/pdf-pages");
    const searchPages = Array.from({ length: to - from + 1 }, (_, index) => from + index);
    const data = await parseStoredPdfPages(bytes, searchPages, { representation: "text" });
    if (request.signal.aborted) return unavailable(403);
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    if (current.userId !== actor.userId) return unavailable(403);
    const latest = await authorizeNativeMaterialPdf(actor.userId, target, origin);
    if (latest.revision !== revision) return unavailable(409);
    const matches = data.pages.flatMap(({ pageNumber, text }) => {
      const excerpt = pdfPageTextMatch(text, query);
      return excerpt ? [{ page: pageNumber, excerpt }] : [];
    });
    return Response.json({ total: data.totalPages, matches }, { headers: noStore });
  } catch (error) {
    if (error instanceof OfflineHttpError) return unavailable(error.status);
    return unavailable(error instanceof Error && error.message === "AUTHORING_MCP_SOURCE_PAGE_INVALID" ? 400 : 503);
  }
}
