/** Run in the print browser after applying A4 media, before creating PDF bytes. */
export async function inspectDiktatPrintReadiness(): Promise<string[]> {
  await document.fonts.ready;
  const errors: string[] = [];
  if (document.fonts.status !== "loaded") errors.push("DIKTAT_PRINT_FONTS_NOT_READY");
  if ([...document.images].some((image) => !image.complete || image.naturalWidth === 0)) errors.push("DIKTAT_PRINT_ASSET_NOT_READY");
  if (document.querySelector(".katex-error")) errors.push("DIKTAT_MATH_RENDER_INVALID");
  if (Math.abs(parseFloat(getComputedStyle(document.body).fontSize) - 14) > 0.05) errors.push("DIKTAT_PRINT_FONT_SIZE_INVALID");
  // A4 minus the fixed 9 mm top and 15 mm bottom margins, at 96 CSS px/inch.
  const pageContentHeight = (297 - 9 - 15) * 96 / 25.4;
  if ([...document.querySelectorAll<HTMLElement>(".diktat-unit, .diktat-static-visual")].some((element) => element.getBoundingClientRect().height > pageContentHeight)) errors.push("DIKTAT_PRINT_UNIT_TOO_TALL_SPLIT_CONTENT");
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth || [...document.querySelectorAll<HTMLElement>(".diktat-unit, .diktat-table, .formula-display")].some((element) => element.scrollWidth > element.clientWidth + 1)) errors.push("DIKTAT_PRINT_CONTENT_OVERFLOW_REVISE_CONTENT");
  if ([...document.querySelectorAll<HTMLElement>("foreignObject > div")].some((element) => element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > Number(element.parentElement?.getAttribute("height")) + 1)) errors.push("DIKTAT_PRINT_VISUAL_LABEL_OVERFLOW_REVISE_CONTENT");
  return [...new Set(errors)];
}
