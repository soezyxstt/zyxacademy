import { articlePartSearchEntries, articlePartSchema } from "../../../../../lib/materials/article-parts";
import { parseArticleSections } from "../../../../../lib/materials/reader-markdown-sections";
import type { OnlineReadingContent } from "./online-reading";

export type ReadingSearchTarget = { sectionId: string; blockId: string; partId?: string };
type ReadingSearchText = { text: string; target?: ReadingSearchTarget };
export type ReadingNavigationItem = { id: string; slug: string; title: string; text: string; chunks?: ReadingSearchText[] };
const clean = (value: string) => value.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();

export function readingNavigationItems(content: OnlineReadingContent): ReadingNavigationItem[] {
  const data = content.data;
  if (!("sections" in data)) {
    if (typeof data.body !== "string") return [];
    const sections = diktatReadingSections(content);
    return sections.length ? sections.map((section, index) => ({
      id: data.id + ":" + index, slug: String(index), title: section.title, text: clean(section.title + " " + section.content),
    })) : [{ id: data.id, slug: "", title: data.title, text: clean(data.body) }];
  }
  return data.sections.map(section => {
    const title = typeof section.title === "string" && section.title.trim() ? section.title : data.title;
    const chunks: ReadingSearchText[] = [{ text: title }, { text: typeof section.learningObjective === "string" ? section.learningObjective : "" }];
    for (const block of section.blocks) {
      const target = { sectionId: section.id, blockId: block.id };
      if (typeof block.title === "string") chunks.push({ text: block.title, target });
      const parts = Array.isArray(block.parts) ? block.parts.flatMap(value => {
        const parsed = articlePartSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      }) : [];
      if (parts.length) {
        for (const part of parts) {
          for (const entry of articlePartSearchEntries([part])) {
            chunks.push({ text: entry.text, target: { ...target, partId: part.id } });
          }
        }
      } else if (typeof block.content === "string") chunks.push({ text: block.content, target });
    }
    return { id: section.id, slug: section.slug, title, chunks, text: clean(chunks.map(chunk => chunk.text).join(" ")) };
  });
}

export type ReadingSearchMatch = ReadingNavigationItem & { snippet: string; target?: ReadingSearchTarget };
const compare = (value: string) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("id-ID");

export function findReadingSections(items: readonly ReadingNavigationItem[], query: string): ReadingSearchMatch[] {
  const target = compare(query);
  if (target.length < 2) return items.map(item => ({ ...item, snippet: "" }));
  return items.flatMap(item => {
    const chunk = item.chunks?.find(entry => compare(entry.text).includes(target));
    if (item.chunks && !chunk) return [];
    const offset = compare(item.text).indexOf(target);
    if (offset < 0) return [];
    const start = Math.max(0, offset - 45);
    const end = Math.min(item.text.length, offset + target.length + 65);
    return [{ ...item, target: chunk?.target, snippet: (start ? "…" : "") + item.text.slice(start, end) + (end < item.text.length ? "…" : "") }];
  });
}

export function diktatReadingSections({ kind, data, title }: OnlineReadingContent) {
  if (kind !== "diktat" || typeof data.body !== "string") return [];
  const sections = parseArticleSections(data.body, title).sections;
  return sections.length > 1 ? sections : [];
}
