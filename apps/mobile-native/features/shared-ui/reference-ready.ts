import type { sharedUiRelativeCases } from "../../../../packages/native-parity/shared-ui/relative-cases";

export function sharedUiReferenceScript(
  fixture: (typeof sharedUiRelativeCases)[number],
  uri: string,
  build: string,
  width: number,
  height: number,
) {
  const expected = {
    id: fixture.id, component: fixture.component, theme: fixture.theme,
    dialog: "open" in fixture ? fixture.open : null,
    rows: "rows" in fixture && fixture.component === "table" ? fixture.rows.map(row => row.name) : [],
    hasEvent: "events" in fixture && fixture.events.length > 0,
    uri, build, width, height,
  };
  return `
    (async () => {
      const expected = ${JSON.stringify(expected)};
      const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
      const fonts = await Promise.all([
        document.fonts.load('400 16px "Parity Inter"'),
        document.fonts.load('500 14px "Parity Inter"'),
        document.fonts.load('600 14px "Parity Inter"'),
        document.fonts.load('700 16px "Parity Lexend"')
      ]);
      await document.fonts.ready;
      if (fonts.some(faces => !faces.length || faces.some(face => face.status !== "loaded"))) return;
      const html = document.documentElement;
      const frame = document.querySelector("[data-reference]");
      if (!frame || frame.dataset.reference !== expected.id || frame.dataset.sharedBuild !== expected.build
        || location.href !== expected.uri || html.lang !== "id" || !html.classList.contains(expected.theme)) return;

      function ready() {
        const viewport = visualViewport;
        if (html.dataset.hydrated !== "true" || devicePixelRatio !== 1 || innerWidth !== expected.width
          || innerHeight !== expected.height || !viewport || viewport.width !== expected.width
          || viewport.height !== expected.height || viewport.scale !== 1 || scrollY !== 0
          || html.scrollWidth > expected.width + 1
          || Intl.DateTimeFormat().resolvedOptions().timeZone !== "Asia/Jakarta") return false;
        if ([...document.querySelectorAll("[data-page-transition]")].some(el => Number(getComputedStyle(el).opacity) < 0.999)) return false;
        if ([...document.images].some(image => visible(image) && (!image.complete || !image.naturalWidth))) return false;
        if (expected.dialog !== null && [...document.querySelectorAll('[role="dialog"]')].some(visible) !== expected.dialog) return false;
        if (expected.id === "shared-dialog-validation-light" && ![...document.querySelectorAll('[role="alert"]')].some(el => visible(el) && el.textContent.includes("wajib"))) return false;
        if (expected.component === "bottom-navigation" && ![...frame.querySelectorAll("[data-mobile-bottom-nav]")].some(visible)) return false;
        if (expected.component === "grid") {
          const grid = frame.querySelector('div.grid[class*="/documents:grid-cols-2"]');
          if (!grid || !visible(grid)) return false;
        }
        if (!expected.rows.every(name => frame.innerText.includes(name))) return false;
        if (expected.hasEvent && !frame.innerText.includes("Tutorial momentum")) return false;
        return Boolean(document.body.innerText.trim()) || document.body.querySelector('img, svg, [role="button"]') !== null;
      }
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (ready()) {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (ready()) {
            window.ReactNativeWebView.postMessage("shared-ui-ready:" + expected.id);
            return;
          }
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })().catch(() => {});
    true;
  `;
}
