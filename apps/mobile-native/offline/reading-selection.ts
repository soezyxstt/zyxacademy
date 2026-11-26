export const readingSelectionKeys = { ask: "askZyra", copy: "copySelection" } as const;
export type ReadingSelectionKey = (typeof readingSelectionKeys)[keyof typeof readingSelectionKeys];

export function normalizeReadingSelection(value: unknown, mode: "quote" | "clipboard" = "quote") {
  if (typeof value !== "string") return "";
  const text = mode === "clipboard" ? value.slice(0, 64_000)
    : value.slice(0, 80_000).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "").trim().slice(0, 1200);
  return text.replace(/[\uD800-\uDBFF]$/u, "");
}

export function readerSelectionUsesContentEngine(platform: string, hasSelectionHandler: boolean) {
  // Android's native selection callback needs the engine to evaluate its own fixed query.
  // The document CSP still prohibits authored scripts, connections and form actions.
  return platform === "android" && hasSelectionHandler;
}
