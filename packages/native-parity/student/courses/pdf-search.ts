import { z } from "zod";

export const maxPdfSearchPages = 12;
export const pdfSearchRequest = z.strictObject({
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  query: z.string().trim().min(2).max(120),
  from: z.number().int().min(1).max(50_000),
  to: z.number().int().min(1).max(50_000),
}).refine(({ from, to }) => to >= from && to - from < maxPdfSearchPages);

export const pdfSearchResponse = z.strictObject({
  total: z.number().int().min(1),
  matches: z.array(z.strictObject({
    page: z.number().int().min(1),
    excerpt: z.string().max(250),
  })).max(maxPdfSearchPages),
});

export type PdfSearchResult = z.infer<typeof pdfSearchResponse>;
export type PdfSearchInput = z.infer<typeof pdfSearchRequest>;

export function pdfPageTextMatch(text: string, query: string): string | null {
  const visible = text.replace(/\s+/g, " ").trim();
  const term = query.toLocaleLowerCase().replace(/\s+/g, " ").trim();
  if (term.length < 2) return null;
  const index = visible.toLocaleLowerCase().indexOf(term);
  if (index < 0) return null;
  const from = Math.max(0, index - 40);
  const until = Math.min(visible.length, index + term.length + 55);
  return (from ? "…" : "") + visible.slice(from, until) + (until < visible.length ? "…" : "");
}
