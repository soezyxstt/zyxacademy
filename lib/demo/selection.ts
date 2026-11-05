import type { DemoProductSelection } from "@/app/(marketing)/demo/demo-data";

export type DemoSearchParams = Record<string, string | string[] | undefined>;
export type ParsedDemoSelection = { course?: string; selection: DemoProductSelection };
const idKeys = ["articleId", "diktatId", "flashcardSetId"] as const;
const offsetKeys = ["quizOffset", "collectionOffset", "flashcardOffset"] as const;

export function parseDemoSelection(params: DemoSearchParams): ParsedDemoSelection | null {
  const selection: DemoProductSelection = {};
  for (const key of ["course", ...idKeys] as const) {
    const value = params[key];
    if (value !== undefined && (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 128)) return null;
    if (key !== "course" && typeof value === "string") selection[key] = value;
  }
  for (const key of offsetKeys) {
    const value = params[key];
    if (value === undefined) continue;
    if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) return null;
    const offset = Number(value);
    if (!Number.isSafeInteger(offset) || offset > 1_000_000) return null;
    selection[key] = offset;
  }
  return { course: params.course as string | undefined, selection };
}

export function demoSelectionHref(base: string, selection: DemoProductSelection, changes: Partial<Record<keyof DemoProductSelection, string | number | null>> = {}): string {
  const [path, query = ""] = base.split("?", 2);
  const params = new URLSearchParams(query);
  for (const key of [...idKeys, ...offsetKeys]) {
    const value = Object.prototype.hasOwnProperty.call(changes, key) ? changes[key] : selection[key];
    if (value === null || value === undefined || value === 0) params.delete(key);
    else params.set(key, String(value));
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}
