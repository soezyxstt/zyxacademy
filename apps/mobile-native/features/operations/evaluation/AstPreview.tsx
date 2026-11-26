import { useMemo, useState } from "react";
import { View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { z } from "zod";
import type { ChartVisualDataSchema, WebsiteMaterialAST } from "../../../../../lib/ast-validator";
import { scientificNumberToText } from "../../../../../lib/math/scientific-format";
import { fitNumericRange } from "../../../../../lib/zyra/canvas/viewport";
import { nativeColors, nativeLinkInks } from "../../../../../packages/design-tokens/native-colors";
import { evaluationBlockMarkdown, evaluationPreviewTable, evaluationPreviewVisual } from "../../../../../packages/native-parity/operations/evaluation-ast-preview";
import { Button } from "../../../components/Button";
import type { NativeSessionTransport } from "../../../network/transport";
import { AdminMarkdownDiagram } from "../../shared-ui/AdminMarkdownDiagram";
import { AdminMarkdownPreview } from "../../shared-ui/AdminMarkdownPreview";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import { CanvasPlot } from "../../student/zyra/CanvasPlot";
import { Copy, Heading, language, type Locale, type Theme } from "./ui";

type PreviewProps = { theme: Theme; locale: Locale; session: NativeSessionTransport };
type Chart = z.infer<typeof ChartVisualDataSchema>;
const step = 12;

export function EvaluationAstPreview({ ast, ...props }: PreviewProps & { ast: WebsiteMaterialAST }) {
  const { locale, theme, session } = props;
  const [visible, setVisible] = useState(step);
  const blocks = useMemo(() => [...ast.blocks].sort((a, b) => a.globalOrderIndex - b.globalOrderIndex), [ast]);
  const preview = { ...props, audience: "course" as const, origin: session.scope.origin };
  const renderText = (source: string) => <AdminMarkdownPreview {...preview} source={source} />;

  return <View style={{ gap: 16 }} testID="admin-ast-rich-preview">
    <Heading theme={theme}>{ast.documentMetadata.title}</Heading>
    {blocks.slice(0, visible).map(block => {
      if (block.type === "visual") {
        return <AstVisual key={block.id} block={block} {...props} />;
      }
      if (block.type === "image" || block.type === "media") {
        const media = block.type === "image" ? { src: block.content.url, caption: block.content.caption || block.content.alt } : block.metadata;
        return media && <AdminMarkdownPreview key={block.id} {...preview} source={block.id} previewBlocks={[{ type: "media", media }]} />;
      }
      const text = evaluationBlockMarkdown(block, locale);
      return text ? <View key={block.id}>{renderText(text)}</View> : null;
    })}
    {visible < blocks.length ? <Button theme={theme} variant="outline" onPress={() => setVisible(value => value + step)}>
      {language(locale, "Tampilkan bagian berikutnya", "Show more of the document")}
    </Button> : null}
  </View>;
}

function AstVisual({ block, locale, theme, session }: PreviewProps & { block: Extract<WebsiteMaterialAST["blocks"][number], { type: "visual" }> }) {
  const visual = useMemo(() => evaluationPreviewVisual(block, locale), [block, locale]);
  const renderText = (source: string) => <CourseMarkdown source={source} theme={theme} allowLinks={false}
    services={{ session: { origin: session.scope.origin, locale } }} />;
  return <View style={{ gap: 8 }}>
    {block.title ? <Heading theme={theme}>{block.title}</Heading> : null}
    {visual?.kind === "diagram" ? <AdminMarkdownDiagram diagram={visual.diagram} locale={locale} theme={theme}
      title={block.title || language(locale, "Diagram", "Diagram")} /> : null}
    {visual?.kind === "graph" ? <CanvasPlot spec={visual.spec} locale={locale} theme={theme}
      renderValues={table => renderText(evaluationPreviewTable(table.columns.map(column => column.label), table.rows))} /> : null}
    {visual?.kind === "chart" ? <AstChart chart={visual.chart} title={block.title} theme={theme} locale={locale} renderText={renderText} /> : null}
    {!visual && <Copy theme={theme} tone="muted">{language(locale, "Visual belum dapat ditampilkan.", "This visual is unavailable.")}</Copy>}
    {block.caption ? renderText(block.caption) : null}
  </View>;
}

function AstChart({ chart, title, locale, theme, renderText }: Pick<PreviewProps, "locale" | "theme"> & {
  chart: Chart; title?: string; renderText(source: string): React.ReactNode;
}) {
  const [rows, setRows] = useState(0);
  const colors = nativeColors[theme];
  const { xLabel = "X", yLabel = "Y", chartType } = chart;
  const axis = chartType === "box" ? [xLabel, "Min", "Q1", "Median", "Q3", "Max"] : [xLabel, yLabel];
  const label = title || language(locale, "Grafik data", "Data chart");
  const count = chart.data.length;
  const points = chart.data.slice(0, 200).map(row => ({
    x: row[0], y: Number(row[1]) || 0,
    box: row.length >= 6 ? row.slice(1, 6).map(Number) : [0.8, 0.9, 1, 1.1, 1.2].map(factor => (Number(row[1]) || 0) * factor).sort((a, b) => a - b),
  })).filter(point => Number.isFinite(point.y) && (chartType !== "scatter" || Number.isFinite(Number(point.x))) &&
    (chartType !== "box" || point.box.every(Number.isFinite)));
  const viewport = { left: 44, top: 8, width: 248, height: 112 };
  const { left, top, width, height } = viewport;
  const bars = chartType === "bar" || chartType === "histogram";
  const scatter = chartType === "scatter";
  const xs = scatter ? fitNumericRange(points.map(point => Number(point.x))) : undefined;
  const range = fitNumericRange(points.flatMap(point => chartType === "box" ? point.box : [point.y])
    .concat(bars || chartType === "area" ? [0] : []));
  const span = width / Math.max(1, points.length);
  const x = (index: number) => xs ? left + (Number(points[index].x) - xs.min) * width / (xs.max - xs.min) : left + (index + 0.5) * span;
  const y = (value: number) => range ? top + (range.max - value) * height / (range.max - range.min) : top + height;
  const color = colors.primary;
  const values = points.map((point, index) => [x(index), y(point.y)].join(" "));
  const path = "M " + values.join(" L ");
  const total = points.reduce((sum, point) => sum + Math.max(0, point.y), 0);
  const pie = chartType === "pie";
  const circleLength = Math.PI * 64;
  const palette = [colors.primary, colors.secondary, nativeLinkInks["tertiary-1"], nativeLinkInks["tertiary-2"], nativeLinkInks["tertiary-3"]];
  let offset = 0;
  return <View style={{ gap: 8 }}>
    {pie && total > 0 && Number.isFinite(total) ?
      <Svg width="100%" height={144} viewBox="0 0 144 144" accessible accessibilityRole="image" accessibilityLabel={label}>
        {points.map((point, index) => {
          if (point.y <= 0) return null;
          const length = circleLength * point.y / total;
          const start = offset;
          offset += length;
          return <Circle key={index} cx={72} cy={72} r={32} fill="none" strokeWidth={64}
            stroke={palette[index % palette.length]} strokeDasharray={[length, circleLength]} strokeDashoffset={-start}
            rotation={-90} originX={72} originY={72} />;
        })}
      </Svg> : !pie && range && points.length > 0 ?
        <Svg width="100%" height={144} viewBox="0 0 304 144" accessible accessibilityRole="image" accessibilityLabel={label}>
          {[range.min, (range.min + range.max) / 2, range.max].map((value, index) => <G key={index}>
            <Line x1={left} x2={left + width} y1={y(value)} y2={y(value)} stroke={colors.border} />
            <SvgText x={left - 4} y={y(value) + 3} textAnchor="end" fontSize={9} fill={colors.mutedForeground}>{scientificNumberToText(value)}</SvgText>
          </G>)}
          {chartType === "area" ? <Path d={path + " L " + x(points.length - 1) + " " + y(0) + " L " + x(0) + " " + y(0) + " Z"} fill={color} fillOpacity={0.2} /> : null}
          {chartType === "line" || chartType === "area" ? <Path d={path} fill="none" stroke={color} strokeWidth={2} /> : null}
          {points.map((point, index) => {
            const cx = x(index);
            const cy = y(point.y);
            if (bars) return <Rect key={index} x={cx - span * 0.3} y={Math.min(cy, y(0))} width={span * 0.6}
              height={Math.abs(cy - y(0))} fill={color} />;
            if (chartType !== "box") return <Circle key={index} cx={cx} cy={cy} r={2.4} fill={color} />;
            const [min, q1, median, q3, max] = point.box.map(y);
            const half = Math.min(12, span / 3);
            return <G key={index} stroke={color}>
              <Line x1={cx} x2={cx} y1={min} y2={max} />
              <Rect x={cx - half} y={q3} width={2 * half} height={Math.max(1, q1 - q3)} fill={colors.card} />
              {[min, max, median].map((position, i) => <Line key={i} x1={cx - half} x2={cx + half} y1={position} y2={position} />)}
            </G>;
          })}
          {points.map((point, index) => points.length <= 5 || index === 0 || index === points.length - 1 ?
            <SvgText key={index} x={x(index)} y={top + height + 15} textAnchor="middle" fontSize={8} fill={colors.mutedForeground}>{String(point.x).slice(0, 12)}</SvgText> : null)}
        </Svg> : <Copy theme={theme} tone="muted">{language(locale, "Grafik belum dapat ditampilkan.", "This chart is unavailable.")}</Copy>}
    <Copy theme={theme} tone="muted">{xLabel} · {yLabel}</Copy>
    {count > 200 ? <Copy theme={theme} tone="muted">{language(locale, "Grafik menampilkan 200 baris pertama.", "The chart shows the first 200 rows.")}</Copy> : null}
    {rows > 0 ? renderText(evaluationPreviewTable(axis, chart.data.slice(0, rows))) : null}
    {rows < count ? <Button theme={theme} variant="outline" onPress={() => setRows(value => value + 20)}>
      {rows ? language(locale, "Tampilkan baris berikutnya", "Show more rows") : language(locale, "Lihat data grafik", "View chart data")}
    </Button> : null}
  </View>;
}
