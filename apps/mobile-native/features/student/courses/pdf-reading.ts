import type { MaterialPdfRenewal, MaterialPdfResult } from "../../../device/file-controller";
import { materialPath } from "../../../../../packages/native-parity/student/courses/contract";
import { materialPdfId, type MaterialPdfTarget } from "../../../../../packages/native-parity/student/courses/pdf";

export function materialSharePath({ courseId, materialId, section, page }: MaterialPdfTarget & { section?: string; page?: number }) {
  if (!materialPdfId(courseId) || !materialPdfId(materialId)) return null;
  const safeSection = section && materialPdfId(section) ? section : null;
  const path = materialPath(courseId, materialId, safeSection);
  return page && Number.isSafeInteger(page) && page > 0 ? path + (safeSection ? "&" : "?") + "page=" + page : path;
}

export interface StudentPdfReader {
  open(target: MaterialPdfTarget, signal: AbortSignal): Promise<MaterialPdfResult>;
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
