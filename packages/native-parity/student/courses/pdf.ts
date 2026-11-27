export type MaterialPdfTarget = { courseId: string; materialId: string };

export const MATERIAL_PDF_MAX_BYTES = 50 * 1024 * 1024;
export const MATERIAL_PDF_LEASE_MS = 5 * 60_000;
export const MATERIAL_PDF_HEADERS = { expiresAt: "x-zyx-pdf-view-until", revision: "x-zyx-pdf-revision" } as const;
export const materialPdfId = (id: string) => id.length > 0 && id.length <= 160 && !/[/\\?#\s\u0000-\u001f\u007f]/u.test(id) && id !== "." && id !== "..";

export function materialPdfPath({ courseId, materialId }: MaterialPdfTarget, download = false) {
  if (!materialPdfId(courseId) || !materialPdfId(materialId)) return null;
  return "/api/native/student/material-pdf?" + new URLSearchParams({ courseId, materialId, ...(download ? { download: "1" } : {}) });
}
