import { useId, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { scientificNumberToText } from "../../../../lib/math/scientific-format";
import { nativeColors, nativeLinkInks } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { Input } from "../../components/Input";
import { nativeTypography } from "../../typography";
import { inPlotBounds, plotFrame, plotHeight, plotPath, plotWidth, projectPlotPoint } from "../student/zyra/canvas-plot-model";
import type { CanvasDisplay } from "../student/zyra/CanvasPlot";
import { graphBounds, graphEntryLimit, hitGraphPoint, moveGraphPoint, readGraphEntry, type GraphEntry } from "./admin-interactive-graph-model";
import { NavigationIcon } from "./navigation-icons";

type Drag = NonNullable<ReturnType<typeof hitGraphPoint>> & {
  bounds: ReturnType<typeof graphBounds>; scale: number; x: number; y: number;
  identifier: GestureResponderEvent["nativeEvent"]["identifier"];
};

export function AdminInteractiveGraph({ entries: initialEntries, theme, locale, current }: CanvasDisplay & {
  entries: GraphEntry[]; current(): boolean;
}) {
  const [rows, setRows] = useState(() => initialEntries.map(readGraphEntry));
  const [focusId, setFocusId] = useState<number>();
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<Drag>();
  const drag = useRef<Drag | null>(null);
  const nextId = useRef(initialEntries.length);
  const clip = "markdownPlot" + useId().replace(/[^a-z0-9]/gi, "");
  const en = locale === "en";
  const colors = nativeColors[theme];
  const palette = [colors.primary, colors.secondary, nativeLinkInks["tertiary-1"], nativeLinkInks["tertiary-2"], nativeLinkInks["tertiary-3"]];
  const title = en ? "Interactive graph" : "Grafik interaktif";
  const bounds = useMemo(() => dragging?.bounds ?? graphBounds(rows), [dragging, rows]);
  const active = current();
  const hasPoints = rows.some(row => row.kind === "point" && inPlotBounds(row.point.x, row.point.y, bounds));
  const muted = [styles.caption, { color: colors.mutedForeground }];

  function add() {
    if (!current() || rows.length >= graphEntryLimit) return;
    const id = nextId.current++;
    setRows(previous => previous.length < graphEntryLimit ? [...previous, readGraphEntry({ id, raw: "" })] : previous);
    setFocusId(id);
  }

  function edit(id: number, raw: string) {
    if (current()) setRows(previous => previous.map(entry => entry.id === id && entry.raw !== raw ? readGraphEntry({ id, raw }) : entry));
  }

  function pointAt(event: GestureResponderEvent) {
    if (!current() || width <= 0) return;
    const scale = plotWidth / width;
    const { locationX, locationY } = event.nativeEvent;
    return hitGraphPoint(rows, { x: locationX * scale, y: locationY * scale }, 22 * scale, bounds);
  }

  function startDrag(event: GestureResponderEvent) {
    const point = pointAt(event);
    if (!point) return;
    const { pageX, pageY, identifier } = event.nativeEvent;
    const selection = { ...point, bounds, scale: plotWidth / width, x: pageX, y: pageY, identifier };
    drag.current = selection;
    setDragging(selection);
  }

  function move(event: GestureResponderEvent) {
    const selection = drag.current;
    if (!selection || !current()) return;
    const touch = event.nativeEvent.touches.find(item => item.identifier === selection.identifier);
    if (!touch) return;
    const x = selection.center.x + (touch.pageX - selection.x) * selection.scale;
    const y = selection.center.y + (touch.pageY - selection.y) * selection.scale;
    edit(selection.row.id, moveGraphPoint(selection.row.point, { x, y }, selection.bounds));
  }

  function endDrag() {
    drag.current = null;
    setDragging(undefined);
  }

  return <View style={styles.stack} testID="admin-markdown-interactive-graph">
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.foreground }]}>{title}</Text>
    {rows.map((row, index) => <View key={row.id} style={styles.row}>
      <View importantForAccessibility="no" style={[styles.dot, { backgroundColor: palette[index % palette.length] }]} />
      <Input theme={theme} onChangeText={value => edit(row.id, value)} value={row.raw} disabled={!active}
        accessibilityLabel={`${en ? "Expression" : "Ekspresi"} ${index + 1}`} autoFocus={row.id === focusId}
        autoCapitalize="none" autoCorrect={false} spellCheck={false} returnKeyType="next"
        onSubmitEditing={add} style={[styles.input, row.kind === "invalid" && { color: colors.destructive }]}
        testID={`admin-markdown-graph-entry-${row.id}`} />
      <Button theme={theme} variant="ghost" size="icon" accessibilityLabel={`${en ? "Remove expression" : "Hapus ekspresi"} ${index + 1}`}
        disabled={!active} renderIcon={(color, size) => <NavigationIcon name="close" color={color} size={size} />}
        onPress={() => { if (current()) setRows(previous => previous.filter(entry => entry.id !== row.id)); }} />
    </View>)}
    <Button theme={theme} variant="outline" disabled={!active || rows.length >= graphEntryLimit} onPress={add}
      testID="admin-markdown-graph-add">{en ? "Add expression or point" : "Tambah ekspresi atau titik"}</Button>
    {rows.length >= graphEntryLimit ? <Text style={muted}>{en ? "Maximum 64 entries." : "Maksimal 64 entri."}</Text> : null}
    {!rows.length || rows.some(row => row.kind === "invalid") ? <Text style={muted} accessibilityLiveRegion="polite">
      {en ? "Check formulas or enter points like A = (1, 2)." : "Periksa rumus atau masukkan titik seperti A = (1, 2)."}
    </Text> : null}
    {hasPoints ? <Text style={muted}>{en ? "Drag a point to update its coordinates." : "Seret titik untuk mengubah koordinatnya."}</Text> : null}
    <View style={styles.plot} onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={event => Boolean(pointAt(event))} onResponderGrant={startDrag} onResponderMove={move}
      onResponderRelease={endDrag} onResponderTerminate={endDrag} onResponderTerminationRequest={() => !drag.current}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox={`0 0 ${plotWidth} ${plotHeight}`} accessible accessibilityRole="image" accessibilityLabel={title}>
          <Defs><ClipPath id={clip}><Rect x={plotFrame.left} y={plotFrame.top} width={plotFrame.width} height={plotFrame.height} /></ClipPath></Defs>
          <Rect x={plotFrame.left} y={plotFrame.top} width={plotFrame.width} height={plotFrame.height} fill={colors.background} stroke={colors.border} />
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, index) => {
            const plotX = plotFrame.left + plotFrame.width * fraction;
            const plotY = plotFrame.top + plotFrame.height * fraction;
            const domainX = bounds.x.min + (bounds.x.max - bounds.x.min) * fraction;
            const domainY = bounds.y.max - (bounds.y.max - bounds.y.min) * fraction;
            return <G key={fraction}>
              <Line x1={plotX} x2={plotX} y1={plotFrame.top} y2={plotFrame.top + plotFrame.height} stroke={colors.border} />
              <Line y1={plotY} y2={plotY} x1={plotFrame.left} x2={plotFrame.left + plotFrame.width} stroke={colors.border} />
              {index % 2 === 0 ? <>
                <SvgText x={plotX} y={plotFrame.top + plotFrame.height + 17} textAnchor="middle" fontSize="10" fill={colors.foreground}>{scientificNumberToText(domainX)}</SvgText>
                <SvgText x={plotFrame.left - 4} y={plotY + 3} textAnchor="end" fontSize="9" fill={colors.foreground}>{scientificNumberToText(domainY)}</SvgText>
              </> : null}
            </G>;
          })}
          <G clipPath={`url(#${clip})`}>
            {rows.map((row, index) => row.kind === "formula" ? <Path key={row.id} d={plotPath(row.points, bounds)} fill="none"
              stroke={palette[index % palette.length]} strokeWidth={2} /> : null)}
          </G>
          {rows.map((row, index) => {
            if (row.kind !== "point" || !inPlotBounds(row.point.x, row.point.y, bounds)) return null;
            const center = projectPlotPoint(row.point.x, row.point.y, bounds);
            const color = palette[index % palette.length];
            return <G key={row.id}>
              <Circle cx={center.x} cy={center.y} r={dragging?.row.id === row.id ? 8 : 6} fill={color} stroke={colors.background} strokeWidth={2} />
              <SvgText x={center.x + 9} y={center.y - 9} fontSize="11" fontWeight="700" fill={color}>{row.point.name ?? String.fromCharCode(65 + index % 26)}</SvgText>
            </G>;
          })}
        </Svg>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  row: { gap: 8, flexDirection: "row", alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  input: { flex: 1, minWidth: 0, width: "auto", ...nativeTypography.mono },
  plot: { width: "100%", aspectRatio: plotWidth / plotHeight },
  heading: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
});
