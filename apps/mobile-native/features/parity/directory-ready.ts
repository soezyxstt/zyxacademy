import { directoryCases, directoryFrame } from "../../../../packages/public-links/fixtures";

export function directoryReadyScript(uri: string, caseId: keyof typeof directoryCases, message: string) {
  const { locale, theme, links } = directoryCases[caseId];
  const expected = { uri, caseId, locale, theme, hrefs: links.map(link => link.url), ...directoryFrame };
  return `
    (async function () {
      const expected = ${JSON.stringify(expected)};
      const viewportMatches = () => {
        const view = window.visualViewport;
        return window.devicePixelRatio === 1 && window.scrollX === 0 && window.scrollY === 0
          && window.innerWidth === expected.width && window.innerHeight === expected.height
          && view && view.scale === 1 && view.width === expected.width && view.height === expected.height;
      };
      const root = document.querySelector("[data-directory-case]");
      if (window.location.href !== expected.uri || !root || root.dataset.directoryCase !== expected.caseId
        || root.lang !== expected.locale || !root.classList.contains(expected.theme)) return;

      const main = root.querySelector("main");
      const heading = main?.querySelector("h1");
      const footer = main?.querySelector("footer");
      const links = [...(main?.querySelectorAll("a[href]") ?? [])];
      if (!heading?.textContent?.trim() || !footer?.textContent?.trim() || links.length !== expected.hrefs.length
        || links.some((link, index) => link.href !== expected.hrefs[index] || !link.textContent?.trim())
        || (!expected.hrefs.length && !main.querySelector("h2")?.textContent?.trim())) return;

      const fonts = await Promise.all([
        document.fonts.load('400 14px "Parity Inter"'),
        document.fonts.load('600 16px "Directory Lexend"'),
        document.fonts.load('700 24px "Directory Lexend"')
      ]);
      await document.fonts.ready;
      if (fonts.some(faces => !faces.length || faces.some(face => face.status !== "loaded"))) return;
      const logos = [...main.querySelectorAll("header img")].filter(image => image.getBoundingClientRect().width > 0);
      if (logos.length !== 1) return;
      await logos[0].decode();

      // Let the stylesheet, images and layout reach the compositor before signaling.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const frame = main.getBoundingClientRect();
      if (!viewportMatches() || frame.left !== 0 || frame.top !== 0 || frame.width !== expected.width
        || frame.height !== expected.height || !logos[0].naturalWidth || footer.getBoundingClientRect().bottom > frame.bottom) return;
      window.ReactNativeWebView.postMessage(${JSON.stringify(message)});
    })().catch(() => {});
    true;
  `;
}
