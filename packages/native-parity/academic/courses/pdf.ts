import { materialPdfId, type MaterialPdfTarget } from "../../student/courses/pdf";

export const ADMIN_PDF_ACCOUNT = "x-native-account";
export const ADMIN_PDF_SESSION = "x-native-session";

export function adminMaterialPdfPath({ courseId, materialId }: MaterialPdfTarget) {
  if (!materialPdfId(courseId) || !materialPdfId(materialId)) return null;
  return "/api/native/academic/material-pdf?" + new URLSearchParams({ courseId, materialId });
}
