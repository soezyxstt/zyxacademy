import { useId, useMemo, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { scientificNumberToText } from "../../../../../lib/math/scientific-format";
import type { CanvasFallback, DataPlotCanvas, FunctionPlotCanvas } from "../../../../../lib/zyra/canvas/contracts";
import { resetCanvasValues } from "../../../../../lib/zyra/canvas/evaluator";
import { compileSafeExpression } from "../../../../../lib/zyra/canvas/expression";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { nativeTypography } from "../../../typography";
import { functionValues, inPlotBounds, plotBounds, plotFrame, plotHeight, plotPath, plotWidth, projectPlotPoint, samplePlot, stepParameter } from "./canvas-plot-model";

const labels = {
  en: { zoomIn: "Zoom in", zoomOut: "Zoom out", resetView: "Reset view", controls: "Parameters", formulas: "Formulas",
    increase: "Increase", decrease: "Decrease", reset: "Reset plot", apply: "Apply", values: "Calculated values", sampled: "Values for the current formulas and parameters.",
    invalid: "Enter a valid formula.", unavailable: "The plot is unavailable for these values." },
  id: { zoomIn: "Perbesar", zoomOut: "Perkecil", resetView: "Atur ulang tampilan", controls: "Parameter", formulas: "Rumus",
    increase: "Naikkan", decrease: "Turunkan", reset: "Atur ulang grafik", apply: "Terapkan", values: "Nilai hasil hitung", sampled: "Nilai sesuai rumus dan parameter saat ini.",
    invalid: "Masukkan rumus yang valid.", unavailable: "Grafik belum dapat ditampilkan untuk nilai ini." },
} as const;

export type CanvasDisplay = { locale: "en" | "id"; theme: keyof typeof nativeColors };
export const quantityLabel = (label: string, unit?: string | null) => unit ? `${label} (${unit})` : label;

export function CanvasPlot({ spec, locale, theme, renderValues, interactive = true }: CanvasDisplay & {
  spec: FunctionPlotCanvas | DataPlotCanvas;
  interactive?: boolean;
  renderValues(table: CanvasFallback): ReactNode;
}) {
  const uid = "zyra" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const copy = labels[locale];
  const colors = nativeColors[theme];
  const palette = [colors.primary, colors.secondary, colors.foreground];
  const seriesColor = (index: number) => palette[index % palette.length];
  const [zoom, setZoom] = useState(1);
  const [values, setValues] = useState(() => resetCanvasValues(spec.variables));
  const [formulas, setFormulas] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [pane, setPane] = useState<"parameters" | "formulas" | "values" | null>(null);
  const series = useMemo(() => samplePlot(spec, values, formulas), [spec, values, formulas]);
  const bounds = useMemo(() => plotBounds(spec, series, zoom), [spec, series, zoom]);
  const paths = useMemo(() => spec.type === "function_plot" && bounds ? series.map(item => plotPath(item.points, bounds)) : [], [spec.type, series, bounds]);
  const text = [styles.text, { color: colors.foreground }];
  const muted = [styles.text, { color: colors.mutedForeground }];

  function resetPlot() {
    setValues(resetCanvasValues(spec.variables));
    setFormulas({});
    setDrafts({});
    setErrors({});
    setHidden(new Set());
    setZoom(1);
  }

  function applyFormula(id: string, draft: string) {
    try {
      const { expression } = compileSafeExpression(draft, { variables: ["x", ...spec.variables.map(variable => variable.id)] });
      setFormulas(previous => ({ ...previous, [id]: expression }));
      setErrors(previous => ({ ...previous, [id]: false }));
    } catch {
      setErrors(previous => ({ ...previous, [id]: true }));
    }
  }

  return <View style={styles.stack}>
    {bounds ? <Svg width="100%" height={200} viewBox={`0 0 ${plotWidth} ${plotHeight}`} accessible accessibilityRole="image" accessibilityLabel={spec.altText}>
      <Defs><ClipPath id={uid}><Rect x={plotFrame.left} y={plotFrame.top} width={plotFrame.width} height={plotFrame.height} /></ClipPath></Defs>
      <Rect x={plotFrame.left} y={plotFrame.top} width={plotFrame.width} height={plotFrame.height} fill={colors.background} stroke={colors.border} />
      {[0, 0.25, 0.5, 0.75, 1].map((fraction, index) => {
        const x = plotFrame.left + plotFrame.width * fraction;
        const y = plotFrame.top + plotFrame.height * fraction;
        const xv = bounds.x.min + (bounds.x.max - bounds.x.min) * fraction;
        const yv = bounds.y.max - (bounds.y.max - bounds.y.min) * fraction;
        return <G key={fraction}>
          <Line x1={x} x2={x} y1={plotFrame.top} y2={plotFrame.top + plotFrame.height} stroke={colors.border} />
          <Line y1={y} y2={y} x1={plotFrame.left} x2={plotFrame.left + plotFrame.width} stroke={colors.border} />
          {index % 2 === 0 ? <>
            <SvgText x={x} y={plotFrame.top + plotFrame.height + 17} textAnchor="middle" fontSize="11" fill={colors.foreground}>{scientificNumberToText(xv)}</SvgText>
            <SvgText x={plotFrame.left - 4} y={y + 3} textAnchor="end" fontSize="10" fill={colors.foreground}>{scientificNumberToText(yv)}</SvgText>
          </> : null}
        </G>;
      })}
      <G clipPath={`url(#${uid})`}>
        {bounds.y.min < 0 && bounds.y.max > 0 ? <Line x1={plotFrame.left} x2={plotFrame.left + plotFrame.width}
          y1={projectPlotPoint(0, 0, bounds).y} y2={projectPlotPoint(0, 0, bounds).y} stroke={colors.mutedForeground} /> : null}
        {bounds.x.min < 0 && bounds.x.max > 0 ? <Line y1={plotFrame.top} y2={plotFrame.top + plotFrame.height}
          x1={projectPlotPoint(0, 0, bounds).x} x2={projectPlotPoint(0, 0, bounds).x} stroke={colors.mutedForeground} /> : null}
        {spec.type === "function_plot" ? <>
          {spec.series.map((item, index) => hidden.has(item.id) || !paths[index] ? null : <Path key={item.id} d={paths[index]} fill="none"
            stroke={seriesColor(index)} strokeWidth={2.5} strokeDasharray={item.lineStyle === "dashed" ? "7 4" : item.lineStyle === "dotted" ? "2 4" : undefined} />)}
          {!(Object.keys(formulas).length || Object.keys(values).some(id => values[id] !== spec.variables.find(variable => variable.id === id)?.defaultValue)) ?
            spec.pointMarkers?.map((marker, index) => {
              if (hidden.has(marker.seriesId) || !inPlotBounds(marker.x, marker.y, bounds)) return null;
              const { x, y } = projectPlotPoint(marker.x, marker.y, bounds);
              const color = seriesColor(spec.series.findIndex(item => item.id === marker.seriesId));
              return <Circle key={index} cx={x} cy={y} r={4} fill={marker.kind === "open" ? colors.background : color} stroke={color} strokeWidth={2} />;
            }) : null}
        </> : spec.points.map((point, index) => {
          if (!inPlotBounds(point.x, point.y, bounds)) return null;
          const { x, y } = projectPlotPoint(point.x, point.y, bounds);
          return <Circle key={index} cx={x} cy={y} r={3.5} fill={colors.primary} />;
        })}
      </G>
    </Svg> : <Text accessibilityLiveRegion="polite" style={muted}>{copy.unavailable}</Text>}
    {bounds ? <Text style={muted}>{spec.type === "function_plot" ? quantityLabel("x", spec.domain.unit) + " / y"
      : quantityLabel(spec.xLabel, spec.xUnit) + " / " + quantityLabel(spec.yLabel, spec.yUnit)}</Text> : null}
    {spec.type === "function_plot" ? <View style={styles.row}>
      {spec.series.map((item, index) => interactive ? <Button key={item.id} theme={theme} variant="outline" accessibilityState={{ selected: !hidden.has(item.id) }}
        onPress={() => setHidden(previous => {
          const next = new Set(previous);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        })} labelStyle={{ color: hidden.has(item.id) ? colors.mutedForeground : seriesColor(index) }} style={styles.legend} wrapLabel>{item.label}</Button>
        : <Text key={item.id} style={[styles.text, { color: seriesColor(index) }]}>{item.label}</Text>)}
    </View> : null}
    {interactive ? <View style={styles.row}>
      {bounds ? <>
        <Button theme={theme} variant="outline" accessibilityLabel={copy.zoomIn} disabled={zoom <= 0.125} onPress={() => setZoom(value => value / 2)}>+</Button>
        <Button theme={theme} variant="outline" accessibilityLabel={copy.zoomOut} disabled={zoom >= 8} onPress={() => setZoom(value => value * 2)}>-</Button>
        {zoom !== 1 ? <Button theme={theme} variant="ghost" onPress={() => setZoom(1)}>{copy.resetView}</Button> : null}
      </> : null}
      {spec.type === "function_plot" ? <>
        {spec.controls.length ? <Button theme={theme} variant="ghost" accessibilityState={{ expanded: pane === "parameters" }}
          onPress={() => setPane(pane === "parameters" ? null : "parameters")}>{copy.controls}</Button> : null}
        <Button theme={theme} variant="ghost" accessibilityState={{ expanded: pane === "formulas" }}
          onPress={() => setPane(pane === "formulas" ? null : "formulas")}>{copy.formulas}</Button>
        {bounds ? <Button theme={theme} variant="ghost" accessibilityState={{ expanded: pane === "values" }}
          onPress={() => setPane(pane === "values" ? null : "values")}>{copy.values}</Button> : null}
      </> : null}
    </View> : null}
    {spec.type === "function_plot" && pane === "parameters" ? spec.controls.map((control, index) => {
      const variable = spec.variables.find(item => item.id === control.variableId);
      if (!variable) return null;
      const value = values[variable.id] ?? variable.defaultValue;
      const label = quantityLabel(control.label, control.unit ?? variable.unit);
      function setValue(next: number) {
        setValues(previous => ({ ...previous, [control.variableId]: next }));
      }
      return <View key={index} style={styles.stack}>
        <Text testID={`student-zyra-parameter-${control.variableId}`} style={text} accessibilityLiveRegion="polite">{label}{": "}{scientificNumberToText(value)}</Text>
        <View style={styles.row}>
          <Button theme={theme} variant="outline" accessibilityLabel={`${copy.decrease} ${label}`}
            disabled={stepParameter(value, control, -1) >= value} onPress={() => setValue(stepParameter(value, control, -1))}>-</Button>
          <Button theme={theme} variant="outline" accessibilityLabel={`${copy.increase} ${label}`}
            disabled={stepParameter(value, control, 1) <= value} onPress={() => setValue(stepParameter(value, control, 1))}>+</Button>
          {[...new Set(control.presets)].map(preset => <Button theme={theme} key={preset}
            testID={`student-zyra-preset-${control.variableId}-${preset}`}
            accessibilityLabel={`${label}: ${scientificNumberToText(preset)}`} accessibilityState={{ selected: value === preset }}
            variant={value === preset ? "default" : "outline"} onPress={() => setValue(preset)}>{scientificNumberToText(preset)}</Button>)}
        </View>
      </View>;
    }) : null}
    {spec.type === "function_plot" && pane === "formulas" ? spec.series.map(item => {
      const draft = Object.hasOwn(drafts, item.id) ? drafts[item.id] : item.expression;
      const invalid = errors[item.id] === true;
      return <View key={item.id} style={styles.stack}>
        <Text style={text}>{item.label}</Text>
        <View style={styles.row}>
          <Input theme={theme} accessibilityLabel={`${copy.formulas}: ${item.label}`} value={draft} maxLength={180}
            autoCapitalize="none" autoCorrect={false} style={styles.formula} onChangeText={value => {
              setDrafts(previous => ({ ...previous, [item.id]: value }));
              if (invalid) setErrors(previous => ({ ...previous, [item.id]: false }));
            }} onSubmitEditing={() => applyFormula(item.id, draft)} />
          <Button theme={theme} variant="outline" onPress={() => applyFormula(item.id, draft)}>{copy.apply}</Button>
        </View>
        {invalid ? <Text accessibilityRole="alert" style={[styles.text, { color: colors.destructive }]}>{copy.invalid}</Text> : null}
      </View>;
    }) : null}
    {pane === "values" && spec.type === "function_plot" && bounds ? renderValues(functionValues(spec, values, formulas, copy.sampled)) : null}
    {pane === "parameters" || pane === "formulas" ? <Button theme={theme} variant="ghost" onPress={resetPlot}>{copy.reset}</Button> : null}
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  formula: { flex: 1, minWidth: 125, width: 0 },
  legend: { maxWidth: "100%", height: "auto", minHeight: 36, paddingVertical: 6 },
});
