export function sourcePageMetadata(pdfPage: number, text: string, imageOnly = false) {
  const controls = text.match(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g) ?? [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const pageCandidates = [...new Set([lines[0], lines.at(-1)].filter((line) => line && /^\d{1,6}$/.test(line)))];
  return {
    pdfPage,
    printedPage: pageCandidates.length === 1 ? pageCandidates[0] : null,
    printedPageSource: pageCandidates.length === 1 ? "text_boundary" as const : null,
    printedPageVerified: false,
    textQuality: {
      status: imageOnly ? "not_requested" : controls.length || !text.trim() ? "needs_visual_review" : "extracted",
      controlCharacterCount: controls.length,
      issues: imageOnly ? [] : [...(controls.length ? ["CONTROL_CHARACTERS"] : []), ...(!text.trim() ? ["NO_TEXT"] : [])],
    },
  };
}
