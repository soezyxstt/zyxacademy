/**
 * lib/offline/offline-snapshot-renderer.ts
 *
 * Browser-safe HTML + KaTeX + SVG renderer for native offline snapshots.
 * Pre-renders LaTeX formulas (via KaTeX + mhchem), structured markdown,
 * worked examples, and typed learning visuals into self-contained HTML so
 * Android and Desktop offline readers display legible math and diagrams
 * without network access.
 */

import katex from "@/lib/math/katex";
import { scientificLiteralToLatex, scientificNumberToLatex } from "@/lib/math/scientific-format";
import { splitScientificText } from "@/lib/math/text-segments";
import type {
  PublicVisualSpec,
  PublicWorkedExamplePayload,
} from "@/lib/articles/structured-read-model";
import { renderDiktatSceneSvg } from "@/lib/materials/diktat-scene-svg";
import { deriveEpsilonDelta, sampleEpsilonDeltaCurve } from "@/lib/materials/epsilon-delta";
import { initialSceneState, sceneValue } from "@/lib/materials/interactive-scene";
import type { FunctionPlotCanvas } from "@/lib/zyra/canvas/contracts";
import { evaluateFunctionPlot } from "@/lib/zyra/canvas/evaluator";
import { safeExpressionToLatex } from "@/lib/zyra/canvas/expression";
import { fitNumericRange } from "@/lib/zyra/canvas/viewport";

const PLOT_COLORS = ["#164e87", "#af4510", "#146b43", "#7b3158", "#514900", "#334155"];

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

function isSafeUrl(rawUrl: string, allowDataImage = false): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return !trimmed.startsWith("//");
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (allowDataImage && /^data:image\/(?:png|jpeg|jpg|webp|gif|svg\+xml);base64,/i.test(trimmed)) {
    return true;
  }
  return false;
}

export function renderOfflineMath(latex: string, displayMode = false): string {
  const trimmed = latex.trim();
  if (!trimmed) return "";
  try {
    return katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: "htmlAndMathml",
      maxSize: 10,
      maxExpand: 1000,
    });
  } catch {
    return displayMode
      ? `<pre class="offline-math-fallback">${escapeHtml(trimmed)}</pre>`
      : `<code class="offline-math-fallback">${escapeHtml(trimmed)}</code>`;
  }
}

function renderScientificProse(value: string): string {
  const literal = scientificLiteralToLatex(value);
  if (literal) return renderOfflineMath(literal, false);
  return splitScientificText(value)
    .map((segment) =>
      segment.type === "math"
        ? renderOfflineMath(segment.value, false)
        : escapeHtml(segment.value),
    )
    .join("");
}

export type OfflineRenderOptions = {
  resolveImage?: (url: string) => string | undefined;
  allowLinks?: boolean;
};

function imageSource(url: string, options?: OfflineRenderOptions) {
  if (options?.resolveImage) return options.resolveImage(url);
  return isSafeUrl(url, true) ? url : undefined;
}

function renderInlineFormatting(raw: string, options?: OfflineRenderOptions): string {
  const tokens: string[] = [];
  const stash = (html: string): string => {
    const idx = tokens.length;
    tokens.push(html);
    return `\u0000TOK${idx}\u0000`;
  };

  let text = String(raw ?? "");

  // 1. Inline code spans first so math/markdown inside code is never transformed.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) =>
    stash(`<code>${escapeHtml(code)}</code>`),
  );

  // 2. Display math written inline ($$...$$) or \[...\]
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, expr: string) =>
    stash(`<span class="offline-math-block">${renderOfflineMath(expr, true)}</span>`),
  );
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, expr: string) =>
    stash(`<span class="offline-math-block">${renderOfflineMath(expr, true)}</span>`),
  );

  // 3. Inline math ($...$ and \(...\))
  text = text.replace(/\\\((.+?)\\\)/g, (_m, expr: string) =>
    stash(renderOfflineMath(expr, false)),
  );
  text = text.replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_m, expr: string) => {
    if (!expr.trim()) return _m;
    return stash(renderOfflineMath(expr, false));
  });

  // 4. Markdown images ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string, url: string) => {
    const src = imageSource(url, options);
    if (!src) {
      return stash(`<span class="offline-img-fallback">${escapeHtml(alt || "Gambar")}</span>`);
    }
    return stash(
      `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" class="offline-img" />`,
    );
  });

  // 5. Markdown links [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    if (options?.allowLinks === false || !isSafeUrl(url, false)) {
      return stash(escapeHtml(label));
    }
    return stash(
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
  });

  // 6. Escape remaining raw HTML before applying emphasis.
  let escaped = escapeHtml(text);

  // Bold and italic
  escaped = escaped.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
  escaped = escaped.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

  // Restore stashed HTML tokens.
  return escaped.replace(/\u0000TOK(\d+)\u0000/g, (_m, idxStr: string) => {
    const idx = Number(idxStr);
    return tokens[idx] ?? "";
  });
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
  return cells.length >= 2 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

export function renderOfflineMarkdownHtml(markdown: string, options?: OfflineRenderOptions): string {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const out: string[] = [];
  let paragraphLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let quoteLines: string[] = [];
  let codeLines: string[] | null = null;
  let mathBlockLines: string[] | null = null;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const joined = paragraphLines.join("\n").trim();
    paragraphLines = [];
    if (!joined) return;
    out.push(`<p>${renderInlineFormatting(joined, options).replaceAll("\n", "<br />")}</p>`);
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }
    const tag = listType;
    out.push(`<${tag}>${listItems.map((item) => `<li>${renderInlineFormatting(item, options)}</li>`).join("")}</${tag}>`);
    listType = null;
    listItems = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const content = quoteLines.join("\n").trim();
    quoteLines = [];
    if (!content) return;
    out.push(`<blockquote>${renderInlineFormatting(content, options).replaceAll("\n", "<br />")}</blockquote>`);
  };

  const flushAllText = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code blocks
    if (trimmed.startsWith("```")) {
      flushAllText();
      if (codeLines === null) {
        codeLines = [];
      } else {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      }
      continue;
    }
    if (codeLines !== null) {
      codeLines.push(line);
      continue;
    }

    // Multi-line $$...$$ display math blocks
    if (mathBlockLines !== null) {
      if (trimmed === "$$" || trimmed.endsWith("$$")) {
        const tail = trimmed === "$$" ? "" : trimmed.slice(0, -2);
        if (tail) mathBlockLines.push(tail);
        out.push(`<div class="offline-math-block">${renderOfflineMath(mathBlockLines.join("\n"), true)}</div>`);
        mathBlockLines = null;
      } else {
        mathBlockLines.push(line);
      }
      continue;
    }

    if (trimmed === "$$") {
      flushAllText();
      mathBlockLines = [];
      continue;
    }

    if (trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4) {
      flushAllText();
      const expr = trimmed.slice(2, -2);
      out.push(`<div class="offline-math-block">${renderOfflineMath(expr, true)}</div>`);
      continue;
    }

    if (trimmed.startsWith("$$")) {
      flushAllText();
      mathBlockLines = [trimmed.slice(2)];
      continue;
    }

    if (!trimmed) {
      flushAllText();
      continue;
    }

    // Markdown table
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1])) {
      flushAllText();
      const headers = splitTableCells(line);
      i += 1; // skip separator
      const rows: string[][] = [];
      while (i + 1 < lines.length && lines[i + 1].trim().includes("|")) {
        i += 1;
        rows.push(splitTableCells(lines[i]));
      }
      const headHtml = headers.map((cell) => `<th>${renderInlineFormatting(cell, options)}</th>`).join("");
      const bodyHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineFormatting(cell, options)}</td>`).join("")}</tr>`)
        .join("");
      out.push(
        `<div class="offline-table-wrap"><table class="offline-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      );
      continue;
    }

    // Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushAllText();
      out.push("<hr />");
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushAllText();
      const level = Math.min(4, Math.max(2, headingMatch[1].length));
      out.push(`<h${level}>${renderInlineFormatting(headingMatch[2], options)}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      quoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      flushParagraph();
      if (listType && listType !== "ul") flushList();
      listType = "ul";
      listItems.push(trimmed.replace(/^[-*+]\s+/, ""));
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      if (listType && listType !== "ol") flushList();
      listType = "ol";
      listItems.push(trimmed.replace(/^\d+\.\s+/, ""));
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  if (codeLines !== null) {
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  if (mathBlockLines !== null) {
    out.push(`<div class="offline-math-block">${renderOfflineMath(mathBlockLines.join("\n"), true)}</div>`);
  }
  flushAllText();

  return out.join("\n");
}

function svgLabel(x: number, y: number, text: string, width = 130, height = 44): string {
  return `<foreignObject x="${x}" y="${y}" width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" style="font-size:15px;line-height:1.25;text-align:center;color:currentColor">${text}</div></foreignObject>`;
}

function wrapSvg(content: string, height = 300, ariaLabel = "Diagram"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" class="offline-visual-svg">${content}</svg>`;
}

function renderQuantityLabel(label: string, unit?: string | null): string {
  return renderScientificProse(label) + (unit ? `&nbsp;${renderOfflineMath(`\\left[\\pu{${unit}}\\right]`, false)}` : "");
}

function renderQuantityValue(value: number, unit?: string | null): string {
  return renderOfflineMath(
    scientificNumberToLatex(value) + (unit ? `\\,\\pu{${unit}}` : ""),
    false,
  );
}

function renderPlotSvg(
  groups: { label: string; points: { x: number; y: number | null }[] }[],
  xLabel: string,
  yLabel: string,
  ariaLabel: string,
  bounds?: { xMin: number; xMax: number; yMin: number; yMax: number },
  bands?: { c: number; l: number; delta: number; epsilon: number },
  functionSpec?: FunctionPlotCanvas,
): string {
  const points = [
    ...groups.flatMap((group) =>
      group.points.filter((point): point is { x: number; y: number } => point.y !== null),
    ),
    ...(functionSpec?.pointMarkers ?? []),
  ];
  const xr = bounds ? { min: bounds.xMin, max: bounds.xMax } : fitNumericRange(points.map((p) => p.x));
  const yr = bounds ? { min: bounds.yMin, max: bounds.yMax } : fitNumericRange(points.map((p) => p.y));
  if (!xr || !yr || xr.max === xr.min || yr.max === yr.min) return "";

  if (functionSpec?.equalAxisScale) {
    const xSpan = xr.max - xr.min;
    const ySpan = yr.max - yr.min;
    if (xSpan / ySpan < 350 / 200) {
      const mid = (xr.min + xr.max) / 2;
      xr.min = mid - (ySpan * 350) / 400;
      xr.max = mid + (ySpan * 350) / 400;
    } else {
      const mid = (yr.min + yr.max) / 2;
      yr.min = mid - (xSpan * 200) / 700;
      yr.max = mid + (xSpan * 200) / 700;
    }
  }

  const px = (x: number) => 125 + ((x - xr.min) / (xr.max - xr.min)) * 370;
  const py = (y: number) => 240 - ((y - yr.min) / (yr.max - yr.min)) * 200;
  const exponent = (min: number, max: number) => {
    const mag = Math.max(Math.abs(min), Math.abs(max));
    return mag > 0 && (mag < 0.01 || mag >= 10000)
      ? Math.max(-323, Math.min(308, Math.floor(Math.log10(mag))))
      : 0;
  };
  const xe = exponent(xr.min, xr.max);
  const ye = exponent(yr.min, yr.max);

  let content = bands
    ? `<rect x="${px(bands.c - bands.delta)}" y="40" width="${Math.max(1, px(bands.c + bands.delta) - px(bands.c - bands.delta))}" height="200" fill="#fff1b8" fill-opacity="0.75"/>` +
      `<rect x="125" y="${py(bands.l + bands.epsilon)}" width="370" height="${Math.max(1, py(bands.l - bands.epsilon) - py(bands.l + bands.epsilon))}" fill="#dbeafe" fill-opacity="0.65"/>`
    : "";

  for (let i = 0; i <= 2; i++) {
    const x = xr.min + (i / 2) * (xr.max - xr.min);
    const y = yr.min + (i / 2) * (yr.max - yr.min);
    content += `<path d="M${px(x)} 40V240 M125 ${py(y)}H495" stroke="#cbd5e1" stroke-width="1"/>`;
    content += svgLabel(px(x) - 55, 246, renderOfflineMath(scientificNumberToLatex(x / 10 ** xe)), 110, 34);
    content += svgLabel(0, py(y) - 12, renderOfflineMath(scientificNumberToLatex(y / 10 ** ye)), 120, 34);
  }
  content += svgLabel(190, 286, xLabel, 220, 36) + svgLabel(0, 2, yLabel, 220, 36);
  if (xe) content += svgLabel(410, 286, renderOfflineMath(`\\times10^{${xe}}`), 130, 36);
  if (ye) content += svgLabel(390, 2, renderOfflineMath(`\\times10^{${ye}}`), 130, 36);

  groups.forEach((group, index) => {
    let path = "";
    let open = false;
    for (const point of group.points) {
      if (point.y === null || point.y < yr.min || point.y > yr.max) {
        open = false;
        continue;
      }
      path += `${open ? "L" : "M"}${px(point.x).toFixed(2)} ${py(point.y).toFixed(2)} `;
      open = true;
    }
    const stroke = PLOT_COLORS[index % PLOT_COLORS.length];
    if (path) {
      content += `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="2.2"/>`;
    }
    if (group.points.length === 1 && group.points[0].y !== null) {
      content += `<circle cx="${px(group.points[0].x)}" cy="${py(group.points[0].y)}" r="3.5" fill="${stroke}"/>`;
    }
  });

  for (const marker of functionSpec?.pointMarkers ?? []) {
    if (marker.x >= xr.min && marker.x <= xr.max && marker.y >= yr.min && marker.y <= yr.max) {
      content += `<circle cx="${px(marker.x)}" cy="${py(marker.y)}" r="4" fill="${marker.kind === "open" ? "#ffffff" : "#164e87"}" stroke="#164e87" stroke-width="1.5"/>`;
    }
  }

  const legend = groups
    .filter((g) => g.label)
    .map((g, idx) => `<p class="offline-visual-note" style="color:${PLOT_COLORS[idx % PLOT_COLORS.length]}">${renderScientificProse(g.label)}</p>`)
    .join("");
  const markerNotes = (functionSpec?.pointMarkers ?? [])
    .map(
      (m) =>
        `<p class="offline-visual-note">${renderScientificProse(m.label)}: ${renderOfflineMath(`(${scientificNumberToLatex(m.x)},${scientificNumberToLatex(m.y)})`)} (${m.kind === "open" ? "terbuka" : "tertutup"})</p>`,
    )
    .join("");

  return wrapSvg(content, 332, ariaLabel) + (legend || markerNotes ? `<div class="offline-visual-legend">${legend}${markerNotes}</div>` : "");
}

function renderStaticFallbackHtml(
  fallback:
    | { type: "table"; summary: string; headers: string[]; rows: Array<Array<string | number>> }
    | { type: "text"; summary: string; content: string }
    | undefined,
): string {
  if (!fallback) return "";
  if (fallback.type === "table") {
    const head = fallback.headers.map((h) => `<th>${renderScientificProse(h)}</th>`).join("");
    const body = fallback.rows
      .map((row) => `<tr>${row.map((cell) => `<td>${renderScientificProse(String(cell))}</td>`).join("")}</tr>`)
      .join("");
    return `<p class="offline-visual-note">${renderScientificProse(fallback.summary)}</p><div class="offline-table-wrap"><table class="offline-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  return `<p class="offline-visual-note"><strong>${renderScientificProse(fallback.summary)}</strong></p><p class="offline-visual-note">${renderScientificProse(fallback.content)}</p>`;
}

export function renderOfflineVisualHtml(visual: PublicVisualSpec, options?: OfflineRenderOptions): string {
  const safeId = escapeHtml(visual.id || "visual");
  const safeLabel = renderScientificProse(visual.label || "");
  const safeDesc = visual.description ? `<p class="offline-visual-desc">${renderScientificProse(visual.description)}</p>` : "";

  try {
    let body = "";

    if (visual.kind === "epsilon_delta_graph") {
      const delta = deriveEpsilonDelta(visual, visual.defaultEpsilon);
      const segments = sampleEpsilonDeltaCurve(visual);
      const band =
        delta.status === "guaranteed"
          ? {
              c: visual.limitPoint,
              l: visual.limitValue,
              delta: delta.delta,
              epsilon: visual.defaultEpsilon,
            }
          : undefined;
      body = renderPlotSvg(
        segments.map((pts) => ({ label: "", points: pts })),
        renderOfflineMath("x"),
        renderOfflineMath("f(x)"),
        visual.label,
        visual.bounds,
        band,
      );
      if (band) {
        body += `<p class="offline-visual-note">${renderOfflineMath(`c=${scientificNumberToLatex(visual.limitPoint)},\\; L=${scientificNumberToLatex(visual.limitValue)},\\; \\varepsilon=${scientificNumberToLatex(visual.defaultEpsilon)},\\; \\delta=${scientificNumberToLatex(band.delta)}`)}</p>`;
      } else {
        body += renderStaticFallbackHtml(visual.staticFallback);
      }
    } else if (visual.kind === "geometry_2d") {
      const { xMin, xMax, yMin, yMax } = visual.bounds;
      const scale = Math.min(420 / Math.max(1e-6, xMax - xMin), 260 / Math.max(1e-6, yMax - yMin));
      const px = (x: number) => 260 + (x - (xMin + xMax) / 2) * scale;
      const py = (y: number) => 160 - (y - (yMin + yMax) / 2) * scale;
      const pointMap = new Map(visual.geometry.points.map((pt) => [pt.id, pt]));
      let drawing = visual.geometry.polygons
        .map((poly) => {
          const coords = poly.pointIds
            .map((id) => pointMap.get(id))
            .filter((pt): pt is NonNullable<typeof pt> => Boolean(pt))
            .map((pt) => `${px(pt.x).toFixed(1)},${py(pt.y).toFixed(1)}`)
            .join(" ");
          return coords ? `<polygon points="${coords}" fill="#dbeafe" fill-opacity="0.55" stroke="#164e87" stroke-width="1.8"/>` : "";
        })
        .join("");
      drawing += visual.geometry.circles
        .map((circle) => {
          const center = pointMap.get(circle.center);
          return center
            ? `<circle cx="${px(center.x).toFixed(1)}" cy="${py(center.y).toFixed(1)}" r="${(circle.radius * scale).toFixed(1)}" fill="none" stroke="#164e87" stroke-width="1.8"/>`
            : "";
        })
        .join("");
      drawing += visual.geometry.segments
        .map((seg) => {
          const a = pointMap.get(seg.from);
          const b = pointMap.get(seg.to);
          return a && b
            ? `<path d="M${px(a.x).toFixed(1)} ${py(a.y).toFixed(1)}L${px(b.x).toFixed(1)} ${py(b.y).toFixed(1)}" stroke="#164e87" stroke-width="1.8"/>`
            : "";
        })
        .join("");
      drawing += visual.geometry.points
        .map(
          (pt) =>
            `<circle cx="${px(pt.x).toFixed(1)}" cy="${py(pt.y).toFixed(1)}" r="3.5" fill="#164e87"/>` +
            (pt.labelLatex ? svgLabel(px(pt.x) - 45, py(pt.y) + 6, renderOfflineMath(pt.labelLatex), 90, 32) : ""),
        )
        .join("");
      const shapeNotes = [...visual.geometry.segments, ...visual.geometry.circles, ...visual.geometry.polygons]
        .filter((s) => s.labelLatex)
        .map((s) => `<p class="offline-visual-note">${escapeHtml(s.id)}: ${renderOfflineMath(s.labelLatex!)}</p>`)
        .join("");
      body = wrapSvg(drawing, 330, visual.label) + shapeNotes;
    } else if (visual.kind === "interactive_scene") {
      const state = initialSceneState(visual);
      const outputsHtml = visual.outputs
        .map((output) => {
          let result = "tidak tersedia";
          try {
            result = String(Number(sceneValue(output.value, state).toPrecision(6)));
          } catch {
            // keep fallback
          }
          return `<p class="offline-visual-note">${renderScientificProse(output.label)}: ${escapeHtml(result)}${output.unit ? ` ${escapeHtml(output.unit)}` : ""}</p>`;
        })
        .join("");
      body =
        renderDiktatSceneSvg(visual, state) +
        outputsHtml +
        renderStaticFallbackHtml(visual.staticFallback);
    } else if (visual.kind === "source_figure") {
      const imgUrl = imageSource(visual.asset?.imageUrl ?? "", options);
      if (imgUrl) {
        body += `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(visual.description || visual.label)}" loading="lazy" class="offline-img" />`;
      }
      if (visual.captionMarkdown) {
        body += `<p class="offline-visual-note">${renderInlineFormatting(visual.captionMarkdown, options)}</p>`;
      }
      if (visual.asset?.attribution) {
        body += `<p class="offline-visual-note">${escapeHtml(visual.asset.attribution)}</p>`;
      }
      if (!imgUrl) {
        body += renderStaticFallbackHtml(visual.staticFallback);
      }
    } else if (visual.kind === "interactive_document") {
      body = `<p class="offline-visual-note">${renderScientificProse(visual.printCaption)}</p>`;
      if (visual.staticFallback.content.trim() !== visual.printCaption.trim()) {
        body += `<p class="offline-visual-note">${renderScientificProse(visual.staticFallback.content)}</p>`;
      }
    } else if (visual.kind === "learning_canvas") {
      const spec = visual.canvas;
      switch (spec.type) {
        case "function_plot": {
          const units = [...new Set(spec.series.map((s) => s.unit))];
          body = renderPlotSvg(
            evaluateFunctionPlot(spec).map((group, idx) => ({
              ...group,
              label: `$\\displaystyle f_{${idx + 1}}(x)=${safeExpressionToLatex(spec.series[idx].expression, ["x", ...spec.variables.map((v) => v.id)])}$`,
            })),
            renderQuantityLabel("$x$", spec.domain.unit),
            renderQuantityLabel("$f(x)$", units.length === 1 ? units[0] : undefined),
            visual.label,
            undefined,
            undefined,
            spec,
          );
          break;
        }
        case "data_plot":
          body = renderPlotSvg(
            spec.points.map((pt) => ({ label: pt.label ?? "", points: [pt] })),
            renderQuantityLabel(spec.xLabel, spec.xUnit),
            renderQuantityLabel(spec.yLabel, spec.yUnit),
            visual.label,
          );
          break;
        case "derivation":
          body = spec.steps
            .map(
              (step) =>
                `<div class="offline-derivation-step"><p><strong>${renderScientificProse(step.label)}</strong></p><div class="offline-math-block">${renderOfflineMath(safeExpressionToLatex(step.expression, ["x", ...spec.variables.map((v) => v.id)]), true)}</div><p>${renderScientificProse(step.explanation)}</p></div>`,
            )
            .join("");
          break;
        case "table": {
          const head = spec.fallback.columns
            .map((col) => `<th>${renderScientificProse(col.label)}${col.unit ? ` ${renderOfflineMath(`\\pu{${col.unit}}`)}` : ""}</th>`)
            .join("");
          const rows = spec.rows
            .map((row) => `<tr>${row.map((cell) => `<td>${renderScientificProse(cell)}</td>`).join("")}</tr>`)
            .join("");
          body = `<div class="offline-table-wrap"><table class="offline-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
          break;
        }
        case "flowchart":
        case "concept_map": {
          const columns = spec.direction === "down" ? 1 : 2;
          const rows = Math.ceil(spec.nodes.length / columns);
          const positions = new Map(
            spec.nodes.map((node, idx) => [
              node.id,
              {
                x: columns === 1 ? 180 : 20 + (idx % columns) * 260,
                y: 20 + Math.floor(idx / columns) * 140,
              },
            ]),
          );
          const markerId = `offline-arrow-${safeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
          const edgesSvg = spec.edges
            .map((edge) => {
              const from = positions.get(edge.source);
              const to = positions.get(edge.target);
              if (!from || !to) return "";
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              if (dx === 0 && dy === 0) return "";
              const scale = 1 / Math.max(Math.abs(dx) / 100, Math.abs(dy) / 45);
              return `<path d="M${from.x + 100 + dx * scale} ${from.y + 45 + dy * scale} L${to.x + 100 - dx * scale} ${to.y + 45 - dy * scale}" stroke="#475569" stroke-width="1.6" marker-end="url(#${markerId})"/>`;
            })
            .join("");
          const nodesSvg = spec.nodes
            .map((node) => {
              const p = positions.get(node.id)!;
              return `<rect x="${p.x}" y="${p.y}" width="200" height="90" rx="8" fill="var(--card, #ffffff)" stroke="#475569" stroke-width="1.4"/>${svgLabel(p.x + 8, p.y + 12, renderScientificProse(node.label), 184, 68)}`;
            })
            .join("");
          const edgeNotes = spec.edges
            .filter((e) => e.label)
            .map((e) => {
              const src = spec.nodes.find((n) => n.id === e.source)?.label ?? e.source;
              const dst = spec.nodes.find((n) => n.id === e.target)?.label ?? e.target;
              return `<p class="offline-visual-note">${renderScientificProse(src)} ${renderOfflineMath("\\to")} ${renderScientificProse(dst)}: ${renderScientificProse(e.label!)}</p>`;
            })
            .join("");
          body =
            wrapSvg(
              `<defs><marker id="${markerId}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="#475569"/></marker></defs>${edgesSvg}${nodesSvg}`,
              rows * 140 + 24,
              visual.label,
            ) + edgeNotes;
          break;
        }
        case "vector_diagram":
        case "free_body": {
          const mag = Math.max(...spec.vectors.flatMap((v) => [Math.abs(v.x), Math.abs(v.y)])) || 1;
          const markerId = `offline-vec-${safeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
          const vecsSvg = spec.vectors
            .map((v) => {
              const x = 260 + (v.x / mag) * 120;
              const y = 150 - (v.y / mag) * 120;
              return (
                `<path d="M260 150L${x.toFixed(1)} ${y.toFixed(1)}" stroke="#164e87" stroke-width="2.2" marker-end="url(#${markerId})"/>` +
                svgLabel(
                  Math.max(0, Math.min(420, x + (v.x < 0 ? -140 : 8))),
                  Math.max(0, Math.min(250, y + (v.y > 0 ? -12 : 8))),
                  renderScientificProse(v.label),
                  136,
                  34,
                )
              );
            })
            .join("");
          const vecNotes =
            (spec.originLabel ? `<p class="offline-visual-note">${renderScientificProse(spec.originLabel)}</p>` : "") +
            spec.vectors
              .map(
                (v) =>
                  `<p class="offline-visual-note">${renderScientificProse(v.label)}: ${renderOfflineMath(`(${scientificNumberToLatex(v.x)},${scientificNumberToLatex(v.y)})\\,\\pu{${v.unit}}`)}</p>`,
              )
              .join("");
          body =
            wrapSvg(
              `<defs><marker id="${markerId}" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L7 3L0 6" fill="#164e87"/></marker></defs><path d="M20 150H500 M260 20V280" stroke="#cbd5e1"/>${vecsSvg}`,
              300,
              visual.label,
            ) + vecNotes;
          break;
        }
        case "chemistry_reaction": {
          const lhs = spec.reactants.map((r) => `${r.coefficient} ${r.formula}`).join(" + ");
          const rhs = spec.products.map((p) => `${p.coefficient} ${p.formula}`).join(" + ");
          body = `<div class="offline-math-block">${renderOfflineMath(`\\ce{${lhs} -> ${rhs}}`, true)}</div>`;
          body += [...spec.reactants, ...spec.products]
            .filter((item) => item.amount !== undefined)
            .map(
              (item) =>
                `<p class="offline-visual-note">${renderOfflineMath(`\\ce{${item.formula}}`)}: ${renderQuantityValue(item.amount!, item.unit)}</p>`,
            )
            .join("");
          break;
        }
      }
      if (spec.variables?.length) {
        body += spec.variables
          .map(
            (v) =>
              `<p class="offline-visual-note">${renderScientificProse(v.label)}: ${renderOfflineMath(scientificNumberToLatex(v.defaultValue))}${v.unit ? ` ${renderOfflineMath(`\\pu{${v.unit}}`)}` : ""}</p>`,
          )
          .join("");
      }
    }

    return `<figure class="offline-visual" data-visual-id="${safeId}"><figcaption>${safeLabel}</figcaption>${body}${safeDesc}</figure>`;
  } catch {
    const fallbackHtml =
      "staticFallback" in visual && visual.staticFallback
        ? renderStaticFallbackHtml(visual.staticFallback)
        : "";
    return `<figure class="offline-visual" data-visual-id="${safeId}"><figcaption>${safeLabel}</figcaption>${fallbackHtml}${safeDesc}</figure>`;
  }
}

export function renderOfflineWorkedExampleHtml(workedExample: PublicWorkedExamplePayload, options?: OfflineRenderOptions): string {
  if (!workedExample?.steps?.length) return "";
  const stepsHtml = workedExample.steps
    .map(
      (step) =>
        `<li><strong>${renderInlineFormatting(step.label, options)}</strong>: ${renderInlineFormatting(step.explanation, options)}${step.reason ? `<div class="offline-step-reason">${renderInlineFormatting(step.reason, options)}</div>` : ""}</li>`,
    )
    .join("");
  const verifyHtml = workedExample.verification?.trim()
    ? `<p class="offline-worked-verify"><strong>Verifikasi:</strong> ${renderInlineFormatting(workedExample.verification.trim(), options)}</p>`
    : "";
  return `<div class="offline-worked-example"><ol>${stepsHtml}</ol>${verifyHtml}</div>`;
}
