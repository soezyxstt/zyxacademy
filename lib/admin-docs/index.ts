import { getAdminDocs, searchAdminDocs as searchLocalizedAdminDocs } from "@/lib/docs/admin";
import { docSectionId } from "@/lib/docs/search";
import type { DocEntry, DocLocale } from "@/lib/docs/types";

export type AdminDoc = DocEntry;

export const adminDocs: AdminDoc[] = getAdminDocs("id");

export { docSectionId, getAdminDocs };

export function searchAdminDocs(query: string, locale: DocLocale = "id"): AdminDoc[] {
  return searchLocalizedAdminDocs(query, locale);
}
