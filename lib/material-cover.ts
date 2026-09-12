export type MaterialCoverKind = "article" | "diktat";

export interface MaterialCoverInput {
  kind: MaterialCoverKind;
  title: string;
  courseCode?: string | null;
  courseTitle?: string | null;
  chapterTitle?: string | null;
}

const palettes = [
  ["#0f3d5e", "#dbeeff", "#0b2840"],
  ["#245b78", "#e2f1f7", "#16384a"],
  ["#176b55", "#e1f5ed", "#0b3d30"],
  ["#8a4b16", "#fff0df", "#512b0c"],
  ["#93415b", "#fde9f0", "#552536"],
] as const;

function hashText(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function compact(value?: string | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function wrapCoverTitle(rawTitle: string, maxLines = 3): string[] {
  const title = compact(rawTitle) || "Materi Belajar";
  const words = title.split(" ");
  const lines: string[] = [];
  let current = "";
  const maxChars = title.length <= 42 ? 25 : title.length <= 75 ? 29 : 33;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }

  const consumed = lines.join(" ").split(" ").filter(Boolean).length + current.split(" ").filter(Boolean).length;
  if (current && lines.length < maxLines) lines.push(current);
  if (consumed < words.length && lines.length > 0) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].replace(/[.…]+$/, "")}…`;
  }
  return lines.slice(0, maxLines);
}

export function createMaterialCoverSvg(input: MaterialCoverInput): string {
  const identity = compact(input.courseCode) || compact(input.courseTitle) || input.title;
  const palette = palettes[hashText(identity) % palettes.length];
  const [accent, soft, ink] = palette;
  const isDiktat = input.kind === "diktat";
  const typeLabel = isDiktat ? "DIKTAT" : "ARTIKEL";
  const purposeLabel = isDiktat ? "Review Ujian" : "Bacaan Utama";
  const titleLines = wrapCoverTitle(input.title);
  const fontSize = titleLines.length === 1 ? 66 : titleLines.length === 2 ? 58 : 50;
  const lineHeight = Math.round(fontSize * 1.14);
  const courseLabel = compact(input.courseCode) || compact(input.courseTitle) || "ZYX ACADEMY";
  const chapterLabel = compact(input.chapterTitle) || (isDiktat ? "Ringkasan terarah untuk review" : "Materi terstruktur untuk dipahami");
  const titleMarkup = titleLines
    .map((line, index) => `<tspan x="88" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${escapeXml(typeLabel)} ${escapeXml(input.title)}">
  <rect width="1200" height="900" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="150" fill="${soft}"/>
  <rect x="0" y="0" width="18" height="900" fill="${accent}"/>
  <path d="M840 155 H1140 M840 215 H1140 M840 275 H1140 M900 95 V335 M960 95 V335 M1020 95 V335 M1080 95 V335" stroke="${accent}" stroke-opacity="0.12" stroke-width="2"/>
  <circle cx="1030" cy="585" r="250" fill="${soft}" fill-opacity="0.75"/>
  <circle cx="1030" cy="585" r="170" fill="none" stroke="${accent}" stroke-opacity="0.18" stroke-width="3"/>
  <path d="M835 650 C900 530 985 720 1100 520" fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="7" stroke-linecap="round"/>

  <text x="88" y="93" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="${ink}" letter-spacing="1.5">${escapeXml(courseLabel)}</text>
  <rect x="945" y="55" width="170" height="58" rx="12" fill="${accent}"/>
  <text x="1030" y="93" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="700" fill="#ffffff" letter-spacing="2">${typeLabel}</text>

  <text x="88" y="310" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="760" fill="#111827">${titleMarkup}</text>

  <rect x="88" y="600" width="720" height="2" fill="${accent}" fill-opacity="0.22"/>
  <text x="88" y="658" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="600" fill="${ink}">${escapeXml(chapterLabel)}</text>

  <text x="88" y="812" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="${accent}">${purposeLabel}</text>
  <text x="1115" y="812" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="600" fill="#4b5563">Zyx Academy</text>
</svg>`;
}
