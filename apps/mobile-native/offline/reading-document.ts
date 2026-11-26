import type { PublicArticleReadModel } from "../../../lib/articles/structured-read-model";
import { escapeHtml } from "../../../lib/offline/offline-snapshot-renderer";
import { buildOfflineReadingSections } from "../../../lib/offline/reading-sections";
import { nativeColors } from "../../../packages/design-tokens/native-colors";
import { offlineReadingAssetSource, type OfflineReadingAsset, type OfflineReadingPackage } from "./reading-contract";

export type ReadingDocumentProps = { saved: OfflineReadingPackage; locale: "id" | "en"; section?: string };

const policy = "default-src 'none'; script-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";
const media = /^image\/(?:avif|gif|jpeg|png|svg\+xml|webp)$/;

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--text); font: 16px/1.65 -apple-system, BlinkMacSystemFont, system-ui, sans-serif; overflow-wrap: break-word; }
  main { width: 100%; max-width: 48rem; margin: 0 auto; padding: 12px clamp(16px, 4vw, 28px) 40px; }
  section + section { border-top: 1px solid var(--line); margin-top: 30px; padding-top: 22px; }
  h2, h3, h4, h5 { line-height: 1.3; margin: 1em 0 .55em; }
  h2 { font-size: 1.35em; }
  h3 { font-size: 1.125em; }
  h4, h5 { font-size: 1em; }
  p, ol, ul, figure, blockquote, pre { margin: 0 0 1em; }
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
    const result = `data:${asset.mime};base64,${base64(asset.bytes)}`;
    rendered.set(asset, result);
    return result;
  };
}

export function buildReadingDocumentHtml(
  { saved, locale, section }: ReadingDocumentProps, katexCss: string, theme: keyof typeof nativeColors = "light",
) {
  const options = { allowLinks: false, resolveImage: resolvePackageImages(saved, locale) };
  const article = saved.summary.kind === "article" && "sections" in saved.data
    ? saved.data as unknown as Pick<PublicArticleReadModel, "sections" | "visuals"> : undefined;
  const diktat = saved.summary.kind === "diktat" && typeof saved.data.body === "string" ? saved.data.body : undefined;
  const sections = buildOfflineReadingSections({
    kind: article ? "structured_article" : "course_material", article, material: { body: diktat }, locale,
  }, options, section);
  if (!sections.length) return null;
  const content = sections.map(({ headingHtml, bodyHtml }) =>
    `<section>${headingHtml ? `<h2>${headingHtml}</h2>` : ""}${bodyHtml ?? ""}</section>`).join("");
  const colors = nativeColors[theme];
  const palette = `:root { color-scheme: ${theme}; --surface: ${colors.background}; --card: ${colors.card}; --text: ${colors.foreground}; --muted: ${colors.mutedForeground}; --line: ${colors.border}; }`;
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escapeHtml(saved.summary.title)}</title><style>${palette}\n${katexCss}\n${styles}</style></head><body><main>${content}</main></body></html>`;
}
