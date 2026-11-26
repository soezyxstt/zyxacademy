import { DEFAULT_APPEARANCE_PREFERENCES, type AppearancePreferences } from "../../../lib/appearance-preferences";
import { readingDensityScales, readingFontScales } from "../device/reading-scales";
import type { PublicArticleReadModel } from "../../../lib/articles/structured-read-model";
import { escapeHtml } from "../../../lib/offline/offline-snapshot-renderer";
import { buildOfflineReadingSections } from "../../../lib/offline/reading-sections";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { offlineReadingAssetSource, type OfflineReadingAsset, type OfflineReadingData, type OfflineReadingPackage } from "./reading-contract";

export type ReadingDocumentProps = { saved: OfflineReadingPackage; locale: "id" | "en"; section?: string };
export type ReadingContent = {
  kind: "article" | "diktat";
  title: string;
  data: OfflineReadingData;
  locale: ReadingDocumentProps["locale"];
  section?: string;
  resolveImage(source: string): string | undefined;
};

const policy = "default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";
const media = /^image\/(?:avif|gif|jpeg|png|svg\+xml|webp)$/;

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--text); font: var(--reading-size)/1.65 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; overflow-wrap: break-word; }
  main { width: 100%; max-width: 48rem; margin: 0 auto; padding: 12px clamp(16px, 4vw, 28px) 40px; }
  section + section { border-top: 1px solid var(--line); margin-top: calc(30px * var(--reading-spacing)); padding-top: calc(22px * var(--reading-spacing)); }
  h2, h3, h4, h5 { line-height: 1.3; margin: 1em 0 .55em; }
  h2 { font-size: 1.35em; }
  h3 { font-size: 1.125em; }
  h4, h5 { font-size: 1em; }
  p, ol, ul, figure, blockquote, pre { margin: 0 0 calc(1em * var(--reading-spacing)); }
  section > :first-child { margin-top: 0; }
  ul, ol { padding-inline-start: 1.45em; }
  li + li { margin-top: .35em; }
  img, svg { max-width: 100%; }
  .offline-img { display: block; height: auto; margin: .65em auto; }
  .offline-objective, blockquote { border-inline-start: 3px solid var(--line); padding-inline: 14px; }
  .offline-visual { padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
  .offline-visual figcaption { font-weight: 600; margin-bottom: .5rem; }
  .offline-visual-svg { display: block; width: 100%; height: auto; }
  .offline-visual-note, .offline-visual-desc, .offline-img-fallback { color: var(--muted); }
  .offline-visual-note:last-child, .offline-visual-desc:last-child { margin-bottom: 0; }
  .offline-table-wrap, pre, .katex-display { max-width: 100%; overflow-x: auto; }
  table { border-collapse: collapse; min-width: 100%; font-size: .9em; }
  td, th { border: 1px solid var(--line); padding: .45em .65em; text-align: start; }
  th, pre, code { background: var(--card); }
  pre, blockquote { padding: .75em; }
  .offline-worked-example { padding-inline-start: .85em; border-inline-start: 1px solid var(--line); }
  .offline-math-block { display: block; }
`;

function base64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return globalThis.btoa(chunks.join(""));
}

export function readingAssetDataUrl(asset: Pick<OfflineReadingAsset, "mime" | "bytes">) {
  return media.test(asset.mime) && asset.bytes.byteLength > 0 ? `data:${asset.mime};base64,${base64(asset.bytes)}` : undefined;
}

function resolvePackageImages(saved: OfflineReadingPackage, locale: ReadingDocumentProps["locale"]) {
  const assets = new Map<string, OfflineReadingAsset>();
  for (const asset of saved.assets) {
    const source = offlineReadingAssetSource(asset.url, saved.summary, locale, saved.summary.revision);
    if (source && /^(?:https?:\/\/|\/(?!\/))/i.test(source) && media.test(asset.mime) && asset.bytes.byteLength > 0) {
      // Older packages may keep the original reference in the authored body.
      assets.set(source, asset);
      assets.set(asset.url, asset);
    }
  }
  const rendered = new Map<OfflineReadingAsset, string>();
  return (url: string): string | undefined => {
    const asset = assets.get(url);
    if (!asset) return undefined;
    const current = rendered.get(asset);
    if (current) return current;
    const result = readingAssetDataUrl(asset);
    if (result) rendered.set(asset, result);
    return result;
  };
}

export function savedReadingContent({ saved, locale, section }: ReadingDocumentProps): ReadingContent {
  return { kind: saved.summary.kind, title: saved.summary.title, data: saved.data, locale, section,
    resolveImage: resolvePackageImages(saved, locale) };
}

export function buildReadingDocumentHtml(props: ReadingDocumentProps, katexCss: string, theme: keyof typeof nativeColors = "light") {
  return buildReadingContentHtml(savedReadingContent(props), katexCss, theme);
}

export function buildReadingContentHtml({ data, kind, title, locale, resolveImage, section }: ReadingContent, katexCss: string, theme: keyof typeof nativeColors,
  appearance: Pick<AppearancePreferences, "fontSize" | "density"> = DEFAULT_APPEARANCE_PREFERENCES) {
  const options = { allowLinks: false, resolveImage };
  const article = kind === "article" && "sections" in data
    ? data as unknown as Pick<PublicArticleReadModel, "sections" | "visuals"> : undefined;
  const diktat = kind === "diktat" && typeof data.body === "string" ? data.body : undefined;
  const sections = buildOfflineReadingSections({
    kind: article ? "structured_article" : "course_material", article, material: { body: diktat }, locale,
  }, options, section);
  if (!sections.length) return null;
  const content = sections.map(({ headingHtml, bodyHtml }) =>
    `<section>${headingHtml ? `<h2>${headingHtml}</h2>` : ""}${bodyHtml ?? ""}</section>`).join("");
  const colors = nativeColors[theme];
  const palette = `:root { color-scheme: ${theme}; --reading-size: ${16 * readingFontScales[appearance.fontSize]}px; --reading-spacing: ${readingDensityScales[appearance.density]}; --surface: ${colors.background}; --card: ${colors.card}; --text: ${colors.foreground}; --muted: ${colors.mutedForeground}; --line: ${colors.border}; }`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(title)}</title><style>${palette}\n${katexCss}\n${styles}</style></head><body><main>${content}</main></body></html>`;
}
