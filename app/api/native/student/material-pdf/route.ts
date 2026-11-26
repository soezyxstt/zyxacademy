import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import { authorizeNativeMaterialPdf, readNativeMaterialPdf } from "@/lib/student/native-material-pdf";
import { materialPdfId, MATERIAL_PDF_HEADERS } from "@/packages/native-parity/student/courses/pdf";
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
  if (query.size !== 2 || !courseId || !materialId || !materialPdfId(courseId) || !materialPdfId(materialId)) return unavailable(400);
  const origin = new URL(resolveAuthBaseUrl()).origin;
  const target = { courseId, materialId };

  try {
    const grant = await authorizeNativeMaterialPdf(actor.userId, target, origin);
    const expected = request.headers.get("If-Match");
    if (expected && expected !== `"${grant.revision}"`) return unavailable(409);
    const headers = new Headers({ ...noStore, [MATERIAL_PDF_HEADERS.revision]: grant.revision,
      [MATERIAL_PDF_HEADERS.expiresAt]: String(grant.until) });
    if (request.method === "HEAD") return new Response(null, { headers });
    const bytes = await readNativeMaterialPdf(grant.source, request.signal);
    const current = await requireNativeStudent(request);
    if (current instanceof Response) return current;
    const latest = await authorizeNativeMaterialPdf(current.userId, target, origin);
    if (latest.revision !== grant.revision) return unavailable(409);
    headers.set(MATERIAL_PDF_HEADERS.expiresAt, String(latest.until));
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Length", String(bytes.byteLength));
    headers.set("Content-Disposition", "inline");
    return new Response(bytes as unknown as BodyInit, { headers });
  } catch (error) {
    return unavailable(error instanceof OfflineHttpError ? error.status : 503);
  }
}

export const HEAD = handle;
export const GET = handle;
