import { resolveDocs, searchDocs } from "../search";
import type { DocEntry, DocLocale } from "../types";
import { adminCourseDocs } from "./courses";
import { adminAuthoringDocs } from "./authoring";
import { adminOperationsDocs } from "./operations";
import { adminAdditionalDocs } from "./additional";

export const adminBilingualDocs = [
  ...adminCourseDocs,
  ...adminAuthoringDocs,
  ...adminOperationsDocs,
  ...adminAdditionalDocs,
];

export function getAdminDocs(locale: DocLocale = "id"): DocEntry[] {
  return resolveDocs(adminBilingualDocs, locale);
}

export function getAdminDocBySlug(slug: string, locale: DocLocale = "id"): DocEntry | undefined {
  return getAdminDocs(locale).find((doc) => doc.slug === slug);
}

export function searchAdminDocs(query: string, locale: DocLocale = "id"): DocEntry[] {
  return searchDocs(getAdminDocs(locale), query, locale);
}
