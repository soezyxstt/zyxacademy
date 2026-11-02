import { courseDocs } from "./courses";
import { authoringDocs } from "./authoring";
import { operationsDocs } from "./operations";
import { additionalDocs } from "./additional";

export const adminDocs = [...courseDocs, ...authoringDocs, ...operationsDocs, ...additionalDocs];

export function docSectionId(index: number) {
  return `bagian-${index + 1}`;
}

export function searchAdminDocs(query: string) {
  const terms = query.trim().toLocaleLowerCase("id").split(/\s+/).filter(Boolean);
  return adminDocs.filter((doc) => {
    const content = [doc.title, doc.summary, doc.category, ...doc.keywords, ...doc.sections.flatMap((section) => [section.title, ...(section.paragraphs ?? []), ...(section.steps ?? []), ...(section.examples ?? [])])].join(" ").toLocaleLowerCase("id");
    return terms.every((term) => content.includes(term));
  });
}
