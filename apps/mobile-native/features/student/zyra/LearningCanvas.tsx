import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { nativeColors, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { resolveFlowchartKind } from "../../../../../lib/flowchart";
import { scientificNumberToText, scientificValueToMathText } from "../../../../../lib/math/scientific-format";
import type { CanvasFallback, CanvasSpec, ChemistryCanvas, DiagramCanvas, VectorCanvas } from "../../../../../lib/zyra/canvas/contracts";
import { safeExpressionToLatex } from "../../../../../lib/zyra/canvas/expression";
import { normalizedVectorComponent } from "../../../../../lib/zyra/canvas/viewport";
import { Button } from "../../../components/Button";
import { nativeTypography } from "../../../typography";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { CourseMarkdown } from "../CourseMarkdown";
import { CanvasPlot, quantityLabel, type CanvasDisplay } from "./CanvasPlot";

const labels = {
  en: {
    values: "Reference table", previous: "Previous rows", next: "Next rows", steps: "Derivation steps",
    start: "Start", end: "End", input: "Input", output: "Output", process: "Process", decision: "Decision",
  },
  id: {
    values: "Tabel acuan", previous: "Baris sebelumnya", next: "Baris berikutnya", steps: "Langkah penurunan",
    start: "Mulai", end: "Selesai", input: "Masukan", output: "Keluaran", process: "Proses", decision: "Keputusan",
  },
} as const;

type CanvasProps = CanvasDisplay & { spec: CanvasSpec; origin: string };

function CanvasText({ text, locale, theme, origin, muted }: CanvasDisplay & { text: string; origin: string; muted?: boolean }) {
  return <CourseMarkdown source={text} services={{ session: { locale, origin } }} theme={theme} muted={muted} allowLinks={false}
    paragraphStyle={styles.text} />;
}

export function CanvasTable({ table, locale, theme, origin }: CanvasDisplay & { table: CanvasFallback; origin: string }) {
  const [page, setPage] = useState(0);
  const size = 8;
  const offset = page * size;
  const colors = nativeColors[theme];
  const copy = labels[locale];
  const rows = table.rows.slice(offset, offset + size);
  const stacked = table.columns.length > 3;
  return <View style={styles.stack}>
    <CanvasText text={table.summary} locale={locale} theme={theme} origin={origin} muted />
    {!stacked ? <View accessibilityRole="header" style={[styles.tableRow, { backgroundColor: colors.muted }]}>
      {table.columns.map((column, index) => <View key={index} style={styles.cell}>
        <CanvasText text={quantityLabel(column.label, column.unit)} locale={locale} theme={theme} origin={origin} />
      </View>)}
    </View> : null}
    {rows.map((row, index) => <View key={offset + index} style={[stacked ? styles.stackedRow : styles.tableRow, { borderBottomColor: colors.border }]}>
      {table.columns.map((column, columnIndex) => <View key={columnIndex} style={stacked ? styles.stackedCell : styles.cell}>
        {stacked ? <View style={styles.cell}><CanvasText text={quantityLabel(column.label, column.unit)} locale={locale} theme={theme} origin={origin} /></View> : null}
        <View style={stacked ? styles.cell : undefined} accessibilityLabel={stacked ? undefined : `${quantityLabel(column.label, column.unit)}: ${row[columnIndex] || "-"}`}>
          <CanvasText text={scientificValueToMathText(row[columnIndex] || "-")} locale={locale} theme={theme} origin={origin} />
        </View>
      </View>)}
    </View>)}
    {table.rows.length > size ? <View style={styles.row}>
      <Button theme={theme} variant="ghost" disabled={page === 0} onPress={() => setPage(page - 1)}>{copy.previous}</Button>
      <Text accessibilityLiveRegion="polite" style={[styles.text, { color: colors.foreground }]}>
        {offset + 1}{"-"}{offset + rows.length}{" / "}{table.rows.length}
      </Text>
      <Button theme={theme} variant="ghost" disabled={offset + size >= table.rows.length} onPress={() => setPage(page + 1)}>{copy.next}</Button>
    </View> : null}
  </View>;
}

function CanvasDiagram({ spec, locale, theme, origin }: Omit<CanvasProps, "spec"> & { spec: DiagramCanvas }) {
  const colors = nativeColors[theme];
  const copy = labels[locale];
  const nodes = useMemo(() => new Map(spec.nodes.map(node => [node.id, node])), [spec.nodes]);
  const outgoing = useMemo(() => {
    const groups = new Map<string, DiagramCanvas["edges"]>();
    for (const edge of spec.edges) {
      if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
      const existing = groups.get(edge.source);
      if (existing) existing.push(edge);
      else groups.set(edge.source, [edge]);
    }
    return groups;
  }, [nodes, spec.edges]);
  return <View style={styles.stack}>
    {spec.nodes.map((node, index) => <View key={index} style={[styles.diagramNode, { borderColor: colors.border }]}>
      {spec.type === "flowchart" ? <Text style={[styles.meta, { color: colors.mutedForeground }]}>{copy[resolveFlowchartKind(node)]}</Text> : null}
      <CanvasText text={node.label} locale={locale} theme={theme} origin={origin} />
      {outgoing.get(node.id)?.map((edge, edgeIndex) => <View key={edgeIndex} style={[styles.diagramEdge, { borderLeftColor: colors.primary }]}>
        <CanvasText text={`→ ${nodes.get(edge.target)?.label}${edge.label ? ` (${edge.label})` : ""}`} locale={locale} theme={theme} origin={origin} muted />
      </View>)}
    </View>)}
  </View>;
}

function CanvasVectors({ spec, locale, theme, origin }: Omit<CanvasProps, "spec"> & { spec: VectorCanvas }) {
  const colors = nativeColors[theme];
  const magnitude = Math.max(...spec.vectors.flatMap(vector => [Math.abs(vector.x), Math.abs(vector.y)]));
  return <View style={styles.stack}>
    <Svg width="100%" height={200} viewBox="0 0 300 200" accessible accessibilityRole="image" accessibilityLabel={spec.altText}>
      <Line x1={150} y1={8} x2={150} y2={192} stroke={colors.border} />
      <Line x1={8} y1={100} x2={292} y2={100} stroke={colors.border} />
      {spec.vectors.map((vector, index) => {
        const dx = normalizedVectorComponent(vector.x, magnitude) * 72;
        const dy = -normalizedVectorComponent(vector.y, magnitude) * 72;
        const x = 150 + dx;
        const y = 100 + dy;
        const length = Math.hypot(dx, dy);
        const color = index % 2 ? colors.secondary : colors.primary;
        const ux = length ? dx / length : 0;
        const uy = length ? dy / length : 0;
        return <G key={index}>
          {length ? <>
            <Line x1={150} y1={100} x2={x} y2={y} stroke={color} strokeWidth={2.5} />
            <Polygon points={`${x},${y} ${x - 9 * ux - 4 * uy},${y - 9 * uy + 4 * ux} ${x - 9 * ux + 4 * uy},${y - 9 * uy - 4 * ux}`} fill={color} />
          </> : <Circle cx={150} cy={100} r={3} fill={color} />}
          <SvgText x={x + 7} y={y - 7} fontSize={12} fill={colors.foreground}>{index + 1}</SvgText>
        </G>;
      })}
    </Svg>
    {spec.originLabel ? <CanvasText text={spec.originLabel} locale={locale} theme={theme} origin={origin} /> : null}
    {spec.vectors.map((vector, index) => <CanvasText key={index} locale={locale} theme={theme} origin={origin}
      text={`${index + 1}. ${vector.label}: (${scientificNumberToText(vector.x)}, ${scientificNumberToText(vector.y)}) ${vector.unit}`} />)}
  </View>;
}

const subscripts = "₀₁₂₃₄₅₆₇₈₉";
const chemicalFormula = (items: ChemistryCanvas["reactants"]) => items.map(item => {
  const coefficient = item.coefficient === 1 ? "" : `${item.coefficient} `;
  return coefficient + item.formula.replace(/\d/g, digit => subscripts[Number(digit)]);
}).join(" + ");

export function LearningCanvas({ initialExpanded, interactive = true, ...props }: CanvasProps & { initialExpanded: boolean; interactive?: boolean }) {
  const { spec, locale, theme, origin } = props;
  const colors = nativeColors[theme];
  const copy = labels[locale];
  const [showTable, setShowTable] = useState(false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const table = spec.type === "table" ? { ...spec.fallback, rows: spec.rows } : spec.fallback;
  return <View testID={`student-zyra-canvas-${spec.type}`} style={[styles.canvas, { borderColor: colors.border, backgroundColor: colors.card }]}>
    <Button theme={theme} variant="ghost" style={styles.titleButton} labelStyle={styles.title} wrapLabel accessibilityState={{ expanded }}
      renderIcon={(color, size) => <NavigationIcon name={expanded ? "chevron" : "chevron-right"} color={color} size={size} />}
      onPress={() => setExpanded(previous => !previous)}>{spec.title}</Button>
    {expanded ? <>
      {spec.type === "function_plot" || spec.type === "data_plot" ? <CanvasPlot spec={spec} locale={locale} theme={theme} interactive={interactive}
        renderValues={values => <CanvasTable table={values} locale={locale} theme={theme} origin={origin} />} /> : null}
      {spec.type === "derivation" ? <View style={styles.stack} accessibilityLabel={copy.steps}>
        {spec.steps.map((step, index) => <View key={index} style={[styles.step, { borderBottomColor: colors.border }]}>
          <CanvasText text={`${index + 1}. ${step.label}`} locale={locale} theme={theme} origin={origin} />
          <CanvasText text={`$$${safeExpressionToLatex(step.expression, spec.variables.map(variable => variable.id))}$$`}
            locale={locale} theme={theme} origin={origin} />
          <CanvasText text={step.explanation} locale={locale} theme={theme} origin={origin} muted />
        </View>)}
      </View> : null}
      {spec.type === "concept_map" || spec.type === "flowchart" ? <CanvasDiagram {...props} spec={spec} /> : null}
      {spec.type === "vector_diagram" || spec.type === "free_body" ? <CanvasVectors {...props} spec={spec} /> : null}
      {spec.type === "chemistry_reaction" ? <Text accessibilityLabel={spec.altText} style={[styles.reaction, { color: colors.foreground }]}>
        {`${chemicalFormula(spec.reactants)} → ${chemicalFormula(spec.products)}`}
      </Text> : null}
      <CanvasText text={spec.purpose} locale={locale} theme={theme} origin={origin} muted />
      {spec.type !== "table" ? <Button theme={theme} variant="ghost" accessibilityState={{ expanded: showTable }}
        onPress={() => setShowTable(!showTable)}>{copy.values}</Button> : null}
      {spec.type === "table" || showTable ? <CanvasTable table={table} locale={locale} theme={theme} origin={origin} /> : null}
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  canvas: { gap: 8, padding: 8, borderWidth: 1, borderRadius: nativeRadii.lg },
  stack: { gap: 8 },
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 8 },
  titleButton: { minHeight: 44, height: "auto", alignItems: "flex-start", paddingHorizontal: 0, paddingVertical: 4 },
  title: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20 },
  reaction: { ...nativeTypography.bodyRegular, fontSize: 16, lineHeight: 23 },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
  meta: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 17 },
  tableRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 5 },
  stackedRow: { gap: 3, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  stackedCell: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cell: { flex: 1, minWidth: 0, paddingHorizontal: 5 },
  step: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  diagramNode: { gap: 4, padding: 8, borderWidth: 1, borderRadius: nativeRadii.md },
  diagramEdge: { borderLeftWidth: 2, paddingLeft: 8, marginLeft: 8 },
});
