import { readerPersonalStorageKeys } from "../../../../../lib/materials/reader-personal-storage";

export type PdfOutlineRow = { title: string; page: number; depth: number };

export function pdfOutline(input: unknown, pageCount: number): PdfOutlineRow[] {
  const output: PdfOutlineRow[] = [];
  function visit(items: unknown, depth: number) {
    if (!Array.isArray(items) || depth > 6) return;
    for (const item of items.slice(0, 200)) {
      if (output.length >= 200) return;
      if (!item || typeof item !== "object") continue;
      const { title, pageIdx, children } = item as Record<string, unknown>;
      const page = typeof pageIdx === "number" || (typeof pageIdx === "string" && /^\d{1,7}$/.test(pageIdx))
        ? Number(pageIdx) + 1 : NaN;
      if (typeof title === "string" && title.trim() && Number.isSafeInteger(page) && page >= 1 && page <= pageCount) {
        output.push({ title: title.trim().slice(0, 180), page, depth });
      }
      visit(children, depth + 1);
    }
  }
  visit(input, 0);
  return output;
}

export type PdfAnnotations = { bookmarks: number[]; notes: Record<number, string> };
type AnnotationStore = { read(key: string): string | null; write(key: string, value: string): void };
export const maxPdfNoteLength = 2_000;

export function bindPdfAnnotations(store: AnnotationStore, scope: { origin: string; userId: string; courseId: string; materialId: string; revision: string },
  isCurrent: () => boolean, pageCount: number) {
  const base = readerPersonalStorageKeys({ ...scope, demo: false });
  const key = base ? "expo.pdf:" + JSON.stringify([scope.origin, base.notes]) : null;
  const empty = (): PdfAnnotations => ({ bookmarks: [], notes: {} });
  const validPage = (page: number) => Number.isSafeInteger(page) && page >= 1 && page <= pageCount;
  function get(): PdfAnnotations {
    if (!key || !isCurrent()) return empty();
    const encoded = store.read(key);
    if (!encoded || encoded.length > 240_000) return empty();
    try {
      const saved = JSON.parse(encoded) as { revision?: unknown; bookmarks?: unknown; notes?: unknown };
      if (saved?.revision !== scope.revision) return empty();
      const bookmarks = Array.isArray(saved.bookmarks) ? [...new Set(saved.bookmarks.filter(validPage))].slice(0, 100).sort((a, b) => a - b) : [];
      const notes = saved.notes && typeof saved.notes === "object" && !Array.isArray(saved.notes) ?
        Object.fromEntries(Object.entries(saved.notes).filter(([page, text]) =>
          /^\d+$/.test(page) && validPage(Number(page)) && typeof text === "string" && text.length <= maxPdfNoteLength).slice(0, 100)) : {};
      return { bookmarks, notes };
    } catch { return empty(); }
  }
  function update(page: number, change: (value: PdfAnnotations) => PdfAnnotations) {
    if (!key || !isCurrent() || !validPage(page)) return null;
    const next = change(get());
    if (!isCurrent() || next.bookmarks.length > 100 || Object.keys(next.notes).length > 100) return null;
    store.write(key, JSON.stringify({ revision: scope.revision, ...next }));
    return next;
  }
  return {
    get,
    toggle(page: number) {
      return update(page, value => ({ ...value, bookmarks: value.bookmarks.includes(page)
        ? value.bookmarks.filter(item => item !== page) : [...value.bookmarks, page].sort((a, b) => a - b) }));
    },
    note(page: number, draft: string) {
      return update(page, value => {
        const notes = { ...value.notes };
        if (draft.trim()) notes[page] = draft.slice(0, maxPdfNoteLength);
        else delete notes[page];
        return { ...value, notes };
      });
    },
  };
}
