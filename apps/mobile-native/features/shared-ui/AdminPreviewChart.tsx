import { useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { z } from "zod";
import type { ChartVisualDataSchema } from "../../../../lib/ast-validator";
import { scientificNumberToText } from "../../../../lib/math/scientific-format";
import { fitNumericRange } from "../../../../lib/zyra/canvas/viewport";
import { nativeColors, nativeLinkInks } from "../../../../packages/design-tokens/native-colors";
import { chartPreviewRows, evaluationPreviewTable } from "../../../../packages/native-parity/operations/evaluation-ast-preview";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";
import type { CanvasDisplay } from "../student/zyra/CanvasPlot";

type Chart = z.infer<typeof ChartVisualDataSchema>;
type Point = NonNullable<ReturnType<typeof chartPreviewRows>[number]> & { index: number };
const chartLimit = 200;

export function AdminPreviewChart({ chart, title, locale, theme, renderText }: CanvasDisplay & {
  chart: Chart; title?: string; renderText(source: string): ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const colors = nativeColors[theme];
  const en = locale === "en";
  const muted = [styles.caption, { color: colors.mutedForeground }];
  const { xLabel = "X", yLabel = "Y", chartType } = chart;
  const axis = chartType === "box" ? [xLabel, "Min", "Q1", "Median", "Q3", "Max"] : [xLabel, yLabel];
  const label = title || (en ? "Data chart" : "Grafik data");
  const count = chart.data.length;
  const plotRows = useMemo(() => chartPreviewRows(chart, chartLimit), [chart]);
  const points = plotRows.flatMap((point, index) => point ? [{ ...point, index }] : []);
  const pageSize = 12;
  const rows = chart.data.slice(page * pageSize, (page + 1) * pageSize);
  const pie = chartType === "pie";

  return <View style={styles.stack} testID="admin-preview-chart">
    {pie ? <PieChart points={points} label={label} theme={theme} />
      : <CartesianChart points={points} plotLength={plotRows.length} chartType={chartType} label={label} theme={theme} />}
    {points.length === 0 || (pie && !points.some(point => point.y > 0)) ? <Text style={muted}>{en ? "This chart is unavailable." : "Grafik belum dapat ditampilkan."}</Text> : null}
    {!pie ? <Text style={muted}>{xLabel} · {yLabel}</Text> : null}
    {count > chartLimit ? <Text style={muted}>{en ? "The chart shows the first 200 rows." : "Grafik menampilkan 200 baris pertama."}</Text> : null}
    {points.length < plotRows.length ? <Text style={muted}>{en ? "Rows with missing or invalid values are listed in the chart data." : "Baris dengan nilai kosong atau tidak valid tercantum di data grafik."}</Text> : null}
    {count > 0 ? <Button theme={theme} variant="outline" accessibilityState={{ expanded: visible }} onPress={() => setVisible(value => !value)}>
      {visible ? (en ? "Hide chart data" : "Sembunyikan data grafik") : (en ? "View chart data" : "Lihat data grafik")}
    </Button> : null}
    {visible && rows.length > 0 ? renderText(evaluationPreviewTable(axis, rows)) : null}
    {visible && count > pageSize ? <View style={styles.row}>
      <Button theme={theme} variant="outline" disabled={page === 0} onPress={() => setPage(value => value - 1)}>{en ? "Previous rows" : "Baris sebelumnya"}</Button>
      <Text style={muted} accessibilityLiveRegion="polite">{page * pageSize + 1}{"-"}{page * pageSize + rows.length}{" / "}{count}</Text>
      <Button theme={theme} variant="outline" disabled={(page + 1) * pageSize >= count} onPress={() => setPage(value => value + 1)}>{en ? "Next rows" : "Baris berikutnya"}</Button>
    </View> : null}
  </View>;
}

type PlotProps = { points: Point[]; label: string; theme: CanvasDisplay["theme"] };

function PieChart({ points, label, theme }: PlotProps) {
  const colors = nativeColors[theme];
  const palette = [colors.primary, colors.secondary, nativeLinkInks["tertiary-1"], nativeLinkInks["tertiary-2"], nativeLinkInks["tertiary-3"]];
  const scale = Math.max(...points.map(point => point.y), 0);
  if (!scale) return null;
  const total = points.reduce((sum, point) => sum + point.y / scale, 0);
  const circleLength = Math.PI * 64;
  let offset = 0;

  return <Svg width="100%" height={144} viewBox="0 0 144 144" accessible accessibilityRole="image" accessibilityLabel={label}>
    {points.map((point, index) => {
      if (!point.y) return null;
      const length = circleLength * (point.y / scale) / total;
      const start = offset;
      offset += length;
      return <Circle key={index} cx={72} cy={72} r={32} fill="none" strokeWidth={64}
        stroke={palette[index % palette.length]} strokeDasharray={[length, circleLength]} strokeDashoffset={-start}
        rotation={-90} originX={72} originY={72} />;
    })}
  </Svg>;
}

function CartesianChart({ points, chartType, plotLength, theme, label }: PlotProps & { chartType: Chart["chartType"]; plotLength: number }) {
  const colors = nativeColors[theme];
  const { left, top, width, height } = { left: 44, top: 8, width: 248, height: 112 };
  const bars = chartType === "bar" || chartType === "histogram";
  const xs = chartType === "scatter" ? fitNumericRange(points.map(point => Number(point.x))) : undefined;
  const range = fitNumericRange(points.flatMap(point => chartType === "box" ? point.box : [point.y])
    .concat(bars || chartType === "area" ? [0] : []));
  if (!range || !points.length) return null;
  const span = width / Math.max(1, plotLength);
  const x = (point: Point) => xs ? left + (Number(point.x) - xs.min) * width / (xs.max - xs.min) : left + (point.index + 0.5) * span;
  const y = (value: number) => top + (range.max - value) * height / (range.max - range.min);
  const color = colors.primary;
  const segments: Point[][] = [];
  if (chartType === "line" || chartType === "area") {
    for (const point of points) {
      const previous = segments.at(-1);
      if (previous && previous[previous.length - 1].index === point.index - 1) previous.push(point);
      else segments.push([point]);
    }
  }
  return <Svg width="100%" height={144} viewBox="0 0 304 144" accessible accessibilityRole="image" accessibilityLabel={label}>
    {[range.min, range.min / 2 + range.max / 2, range.max].map((value, index) => <G key={index}>
      <Line x1={left} x2={left + width} y1={y(value)} y2={y(value)} stroke={colors.border} />
      <SvgText x={left - 4} y={y(value) + 3} textAnchor="end" fontSize={9} fill={colors.mutedForeground}>{scientificNumberToText(value)}</SvgText>
    </G>)}
    {segments.map(segment => {
      const path = "M " + segment.map(point => [x(point), y(point.y)].join(" ")).join(" L ");
      return <G key={segment[0].index}>
        {chartType === "area" ? <Path d={`${path} L ${x(segment[segment.length - 1])} ${y(0)} L ${x(segment[0])} ${y(0)} Z`} fill={color} fillOpacity={0.2} /> : null}
        <Path d={path} fill="none" stroke={color} strokeWidth={2} />
      </G>;
    })}
    {points.map(point => {
      const cx = x(point);
      const cy = y(point.y);
      if (bars) return <Rect key={point.index} x={cx - span * 0.3} y={Math.min(cy, y(0))} width={span * 0.6}
        height={Math.abs(cy - y(0))} fill={color} />;
      if (chartType !== "box") return <Circle key={point.index} cx={cx} cy={cy} r={2.4} fill={color} />;
      const [min, q1, median, q3, max] = point.box.map(y);
      const half = Math.min(12, span / 3);
      return <G key={point.index} stroke={color}>
        <Line x1={cx} x2={cx} y1={min} y2={max} />
        <Rect x={cx - half} y={q3} width={2 * half} height={Math.max(1, q1 - q3)} fill={colors.card} />
        {[min, max, median].map((position, index) => <Line key={index} x1={cx - half} x2={cx + half} y1={position} y2={position} />)}
      </G>;
    })}
    {points.map((point, index) => points.length <= 5 || index === 0 || index === points.length - 1 ?
      <SvgText key={point.index} x={x(point)} y={top + height + 15} textAnchor="middle" fontSize={8} fill={colors.mutedForeground}>{String(point.x).slice(0, 12)}</SvgText> : null)}
  </Svg>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
});
