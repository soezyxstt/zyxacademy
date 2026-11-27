import type { BilingualDocEntry, DocEntry, DocLocale } from "./types";

export function docSectionId(index: number) {
  return `bagian-${index + 1}`;
}

export function resolveDocs(entries: BilingualDocEntry[], locale: DocLocale): DocEntry[] {
  return entries.map((entry) => ({
    slug: entry.slug,
    ...(locale === "en" ? entry.en : entry.id),
  }));
}

export function searchDocs(docs: DocEntry[], query: string, locale: DocLocale = "id"): DocEntry[] {
  const normalizedLocale = locale === "en" ? "en" : "id";
  const terms = query.trim().toLocaleLowerCase(normalizedLocale).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return docs;

  return docs.filter((doc) => {
    const content = [
      doc.title,
      doc.summary,
      doc.category,
      ...doc.keywords,
      ...(doc.quickLinks?.flatMap((link) => [link.label, link.href, link.description ?? ""]) ?? []),
      ...doc.sections.flatMap((section) => [
        section.title,
        ...(section.paragraphs ?? []),
        ...(section.steps?.map((step) => (typeof step === "string" ? step : `${step.title ?? ""} ${step.body}`)) ?? []),
        ...(section.examples ?? []),
        ...(section.callouts?.map((callout) => `${callout.title ?? ""} ${callout.body}`) ?? []),
        ...(section.codeBlocks?.map((block) => `${block.label ?? ""} ${block.code}`) ?? []),
        ...(section.table ? [...section.table.headers, ...section.table.rows.flat()] : []),
      ]),
    ]
      .join(" ")
      .toLocaleLowerCase(normalizedLocale);

    return terms.every((term) => content.includes(term));
  });
}
