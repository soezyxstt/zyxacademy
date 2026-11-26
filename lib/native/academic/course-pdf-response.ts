import { ADMIN_PDF_ACCOUNT, ADMIN_PDF_SESSION } from "@/packages/native-parity/academic/courses/pdf";
import { materialPdfId, MATERIAL_PDF_HEADERS, MATERIAL_PDF_LEASE_MS, type MaterialPdfTarget } from "@/packages/native-parity/student/courses/pdf";
import { OfflineHttpError } from "@/lib/offline/server-auth";
import type { MaterialPdfSource } from "@/lib/native/material-pdf-source";

type Viewer = { accountId: string; sessionId: string; expiresAt: number };
export type AdminPdfGrant = { source: MaterialPdfSource; revision: string };

type Dependencies = {
  session(request: Request): Promise<Viewer | null>;
  hasAdmin(accountId: string): Promise<boolean>;
  authorize(target: MaterialPdfTarget): Promise<AdminPdfGrant>;
  read(source: MaterialPdfSource, signal: AbortSignal): Promise<Uint8Array>;
  isSameOrigin(request: Request): boolean;
  now?(): number;
};

const noStore = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const unavailable = (status: number) => new Response(null, { status, headers: noStore });

export function createAdminMaterialPdfHandler(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  async function verify(request: Request) {
    const viewer = await deps.session(request);
    if (!viewer || !Number.isSafeInteger(viewer.expiresAt) || viewer.expiresAt <= now()) throw new OfflineHttpError(401, "SESSION_EXPIRED");
    if (viewer.accountId !== request.headers.get(ADMIN_PDF_ACCOUNT) || viewer.sessionId !== request.headers.get(ADMIN_PDF_SESSION)) {
      throw new OfflineHttpError(409, "ACCOUNT_CHANGED");
    }
    if (!await deps.hasAdmin(viewer.accountId)) throw new OfflineHttpError(403, "ADMIN_REQUIRED");
    return viewer;
  }
  const until = (viewer: Viewer) => Math.min(viewer.expiresAt, now() + MATERIAL_PDF_LEASE_MS);
  return async (request: Request) => {
    if (!deps.isSameOrigin(request)) return unavailable(403);
    const query = new URL(request.url).searchParams;
    const courseId = query.get("courseId");
    const materialId = query.get("materialId");
    if (query.size !== 2 || !courseId || !materialId || !materialPdfId(courseId) || !materialPdfId(materialId)) return unavailable(400);
    const target = { courseId, materialId };
    try {
      const viewer = await verify(request);
      const grant = await deps.authorize(target);
      const expected = request.headers.get("If-Match");
      if (expected && expected !== `"${grant.revision}"`) return unavailable(409);
      const expiresAt = until(viewer);
      if (expiresAt <= now()) return unavailable(401);
      const headers = new Headers({ ...noStore, [MATERIAL_PDF_HEADERS.revision]: grant.revision,
        [MATERIAL_PDF_HEADERS.expiresAt]: String(expiresAt) });
      if (request.method === "HEAD") return new Response(null, { headers });
      const bytes = await deps.read(grant.source, request.signal);
      const current = await verify(request);
      const latest = await deps.authorize(target);
      if (latest.revision !== grant.revision) return unavailable(409);
      const freshExpiry = until(current);
      if (freshExpiry <= now()) return unavailable(401);
      headers.set(MATERIAL_PDF_HEADERS.expiresAt, String(freshExpiry));
      headers.set("Content-Type", "application/pdf");
      headers.set("Content-Length", String(bytes.byteLength));
      headers.set("Content-Disposition", "inline");
      return new Response(bytes as unknown as BodyInit, { headers });
    } catch (error) {
      return unavailable(error instanceof OfflineHttpError ? error.status : 503);
    }
  };
}
