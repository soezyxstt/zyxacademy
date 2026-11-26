import type { MaterialPdfRenewal, MaterialPdfResult } from "../../../device/file-controller";
import type { MaterialPdfTarget } from "../../../../../packages/native-parity/student/courses/pdf";

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
