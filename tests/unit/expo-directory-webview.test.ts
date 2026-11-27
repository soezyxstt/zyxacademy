import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { directoryReadyScript } from "@/apps/mobile-native/features/parity/directory-ready";
import { directoryCases, directoryFrame } from "@/packages/public-links/fixtures";

type CaseId = keyof typeof directoryCases;

async function readiness(caseId: CaseId, options: {
  caseId?: CaseId;
  locale?: string;
  theme?: string;
  width?: number;
  dpr?: number;
  missingFonts?: boolean;
  brokenLogo?: boolean;
  missingLink?: boolean;
  footerBelowFrame?: boolean;
} = {}) {
  const messages: string[] = [];
  const fixture = directoryCases[caseId];
  const { width, height } = directoryFrame;
  const uri = `http://127.0.0.1:3211/tautan/${caseId}`;
  const message = `directory-ready:${caseId}`;
  const rect = { left: 0, top: 0, bottom: height, width, height };
  const heading = { textContent: "Directory" };
  const footer = { textContent: "Zyx Academy", getBoundingClientRect: () => ({ bottom: options.footerBelowFrame ? height + 1 : 240 }) };
  const logo = { naturalWidth: options.brokenLogo ? 0 : 32, decode: async () => {}, getBoundingClientRect: () => ({ width: 32 }) };
  const main = {
    querySelector: (selector: string) => selector === "footer" ? footer : heading,
    querySelectorAll: (selector: string) => selector === "header img" ? [logo]
      : options.missingLink ? [] : fixture.links.map(link => ({ href: link.url, textContent: link.title })),
    getBoundingClientRect: () => rect,
  };
  runInNewContext(directoryReadyScript(uri, caseId, message), {
    requestAnimationFrame: queueMicrotask,
    document: {
      fonts: { ready: Promise.resolve(), load: async () => options.missingFonts ? [] : [{ status: "loaded" }] },
      querySelector: () => ({
        dataset: { directoryCase: options.caseId ?? caseId },
        lang: options.locale ?? fixture.locale,
        classList: { contains: (name: string) => name === (options.theme ?? fixture.theme) },
        querySelector: () => main,
      }),
    },
    window: {
      location: { href: uri },
      innerWidth: options.width ?? width, innerHeight: height, devicePixelRatio: options.dpr ?? 1,
      scrollX: 0, scrollY: 0, visualViewport: { width, height, scale: 1 },
      ReactNativeWebView: { postMessage: (data: string) => messages.push(data) },
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return messages;
}

test("reports readiness for each directory fixture after fonts, logo and layout settle", async () => {
  for (const caseId of Object.keys(directoryCases) as CaseId[]) {
    expect(await readiness(caseId)).toEqual([`directory-ready:${caseId}`]);
  }
});

test("withholds the capture marker for mismatched or incomplete directory references", async () => {
  for (const options of [
    { caseId: "single" as const }, { locale: "en" }, { theme: "light" }, { width: 379 }, { dpr: 3 },
    { missingFonts: true }, { brokenLogo: true }, { missingLink: true }, { footerBelowFrame: true },
  ]) {
    expect(await readiness("grouped", options)).toEqual([]);
  }
});
