import { pdfSearchRequest, pdfSearchResponse, type PdfSearchInput, type PdfSearchResult } from "../../../../../packages/native-parity/student/courses/pdf-search";
import type { NativeSessionTransport } from "../../../network/transport";
import type { MaterialPdfRenewal, MaterialPdfResult } from "../../../device/file-controller";
import { materialPath } from "../../../../../packages/native-parity/student/courses/contract";
import { materialPdfId, materialPdfPath, type MaterialPdfTarget } from "../../../../../packages/native-parity/student/courses/pdf";

export function materialSharePath({ courseId, materialId, section, page }: MaterialPdfTarget & { section?: string; page?: number }) {
  if (!materialPdfId(courseId) || !materialPdfId(materialId)) return null;
  const safeSection = section && materialPdfId(section) ? section : null;
  const path = materialPath(courseId, materialId, safeSection);
  return page && Number.isSafeInteger(page) && page > 0 ? path + (safeSection ? "&" : "?") + "page=" + page : path;
}

export interface StudentPdfReader {
  open(target: MaterialPdfTarget, signal: AbortSignal): Promise<MaterialPdfResult>;
  search?(target: MaterialPdfTarget, input: PdfSearchInput, signal: AbortSignal): Promise<PdfSearchResult>;
  renew(target: MaterialPdfTarget, revision: string, signal: AbortSignal): Promise<MaterialPdfRenewal>;
}

export function safeMaterialPdfLink(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      host === "localhost" || host.endsWith(".localhost") || /^[0-9.]+$/.test(host) || host.startsWith("[")) return null;
    const pathname = decodeURIComponent(url.pathname);
    if (/^\/(?:api\/(?:storage\/file|native\/student\/material-pdf)|f\/|courses\/[^/]+\/(?:diktats|materials)\/)/i.test(pathname) ||
      ["utfs.io", "uploadthing.com"].includes(host) || host.endsWith(".utfs.io") || host.endsWith(".ufs.sh") ||
      [...url.searchParams.keys()].some(key => /^(?:x-amz-|x-goog-|signature$|token$|access_token$)/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

export function bindPdfSearch(session: NativeSessionTransport, current: () => boolean): NonNullable<StudentPdfReader["search"]> {
  return async (target, input, signal) => {
    const path = materialPdfPath(target);
    if (!path || !current()) throw new Error("PDF search unavailable.");
    const response = await session.request(path, {
      method: "POST", requiredRole: "murid", signal,
      headers: { Origin: session.scope.origin, "Content-Type": "application/json", "x-student-id": session.scope.accountId },
      body: JSON.stringify(pdfSearchRequest.parse(input)),
    });
    try {
      if (!response.ok) throw new Error("PDF search unavailable.");
      const data = pdfSearchResponse.parse(await response.json());
      if (!current() || data.matches.some(row => row.page < input.from || row.page > input.to || row.page > data.total)) {
        throw new Error("PDF search unavailable.");
      }
      return data;
    } finally { response.dispose(); }
  };
}
