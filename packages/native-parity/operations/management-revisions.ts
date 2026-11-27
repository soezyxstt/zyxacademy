import type { ArticleFields, FormSettings } from "./management-contract";

type DraftValue = Record<string, unknown>;
export type DraftResolution = "local" | "saved";
export type DraftConflict = { path: string[]; local: unknown; saved: unknown };

function isObject(value: unknown): value is DraftValue {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function sameDraftValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => sameDraftValue(value, right[index]));
  if (!isObject(left) || !isObject(right)) return false;
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].every(key => sameDraftValue(ownValue(left, key), ownValue(right, key)));
}

function ownValue(value: DraftValue, key: string): unknown {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}

export function draftConflictKey(path: string[]): string {
  return JSON.stringify(path);
}

/** Merge independent edits against the last observed revision. Ordered lists are a unit. */
export function mergeManagementDraft<T extends object>(baseline: T, local: T, saved: T, resolutions: Readonly<Record<string, DraftResolution>> = {}) {
  const conflicts: DraftConflict[] = [];
  function merge(previous: unknown, edited: unknown, current: unknown, path: string[]): unknown {
    if (sameDraftValue(previous, edited)) return current;
    if (sameDraftValue(previous, current) || sameDraftValue(edited, current)) return edited;
    if (isObject(edited) && isObject(current) && (isObject(previous) || previous === undefined)) {
      const original = previous ?? {};
      const keys = new Set([...Object.keys(original), ...Object.keys(edited), ...Object.keys(current)]);
      const entries = [...keys].flatMap(key => {
        const value = merge(ownValue(original, key), ownValue(edited, key), ownValue(current, key), [...path, key]);
        return value === undefined ? [] : [[key, value]];
      });
      return Object.fromEntries(entries);
    }
    conflicts.push({ path, local: edited, saved: current });
    return resolutions[draftConflictKey(path)] === "local" ? edited : current;
  }

  const fields = merge(baseline, local, saved, []) as T;
  return { fields, conflicts, ready: conflicts.every(conflict => Object.hasOwn(resolutions, draftConflictKey(conflict.path))) };
}

export function articlePublicationIntent(previous: ArticleFields["status"], next: ArticleFields["status"]): "publish" | "withdraw" | null {
  if (next === "published") return "publish";
  return previous === "published" && next === "draft" ? "withdraw" : null;
}

export function formAcceptanceChanged(previous: FormSettings, next: FormSettings): boolean {
  return (previous.acceptingResponses ?? true) !== (next.acceptingResponses ?? true);
}
