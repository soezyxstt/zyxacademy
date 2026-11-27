import { materialPdfId, type MaterialPdfTarget } from "../../student/courses/pdf";

export const ADMIN_PDF_ACCOUNT = "x-native-account";
export const ADMIN_PDF_SESSION = "x-native-session";

export type AdminPdfBundle = { importId: string; expectedRevision: string };

export function validAdminPdfBundle(bundle: AdminPdfBundle) {
  return materialPdfId(bundle.importId) && /^[a-f0-9]{64}$/.test(bundle.expectedRevision);
}

export function adminMaterialPdfPath({ courseId, materialId }: MaterialPdfTarget, bundle?: AdminPdfBundle) {
  if (!materialPdfId(courseId) || !materialPdfId(materialId)) return null;
  if (bundle && !validAdminPdfBundle(bundle)) return null;
  return "/api/native/academic/material-pdf?" + new URLSearchParams({ courseId, materialId,
    ...(bundle && { importId: bundle.importId, expectedRevision: bundle.expectedRevision }) });
}
