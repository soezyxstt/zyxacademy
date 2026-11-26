import { articlePartSearchEntries, articlePartSchema } from "../../../../../lib/materials/article-parts";
import { parseArticleSections } from "../../../../../lib/materials/reader-markdown-sections";
import type { OnlineReadingContent } from "./online-reading";

export type ReadingNavigationItem = { id: string; slug: string; title: string; text: string };
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
    return {
      id: section.id, slug: section.slug, title,
      text: clean([title, section.learningObjective, ...section.blocks.flatMap(block => {
        const parts = Array.isArray(block.parts) ? block.parts.flatMap(value => {
          const parsed = articlePartSchema.safeParse(value);
          return parsed.success ? [parsed.data] : [];
        }) : [];
        return [block.title, ...(parts.length ? articlePartSearchEntries(parts).map(item => item.text) : [block.content])];
      })].filter((value): value is string => typeof value === "string").join(" ")),
    };
  });
}

export function findReadingSections(items: readonly ReadingNavigationItem[], query: string) {
  const target = clean(query).toLocaleLowerCase();
  if (!target) return items.map(item => ({ ...item, snippet: "" }));
  return items.flatMap(item => {
    const offset = item.text.toLocaleLowerCase().indexOf(target);
    if (offset < 0) return [];
    const start = Math.max(0, offset - 45);
    const end = Math.min(item.text.length, offset + target.length + 65);
    return [{ ...item, snippet: (start ? "…" : "") + item.text.slice(start, end) + (end < item.text.length ? "…" : "") }];
  });
}

export function diktatReadingSections({ kind, data, title }: OnlineReadingContent) {
  if (kind !== "diktat" || typeof data.body !== "string") return [];
  const sections = parseArticleSections(data.body, title).sections;
  return sections.length > 1 ? sections : [];
}
