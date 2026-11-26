import { useId, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, Marker, Path, Polygon, Rect } from "react-native-svg";
import { resolveFlowchartKind } from "../../../../lib/flowchart";
import { nativeColors, nativeRadii } from "../../../../packages/design-tokens/native-colors";
import { diagramNodeSize, layoutMarkdownDiagram, type MarkdownDiagram } from "../../../../packages/native-parity/operations/admin-markdown-preview";
import { Button } from "../../components/Button";
import { nativeTypography } from "../../typography";

type Props = { diagram: MarkdownDiagram; theme: keyof typeof nativeColors; title: string; locale: "en" | "id" };

export function AdminMarkdownDiagram({ diagram, theme, title, locale }: Props) {
  const [expanded, setExpanded] = useState(false);
  const en = locale === "en";
  return <View style={styles.stack}>
    <Button theme={theme} variant="outline" testID="admin-markdown-open-diagram" accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)}>{expanded ? (en ? "Close diagram" : "Tutup diagram") : (en ? "View diagram" : "Lihat diagram")}</Button>
    {expanded ? <DiagramGraph diagram={diagram} title={title} theme={theme} locale={locale} /> : null}
  </View>;
}

function DiagramGraph({ diagram, theme, title, locale }: Props) {
  const marker = "arrow" + useId().replace(/[^a-z0-9]/gi, "");
  const { width, height, positions } = useMemo(() => layoutMarkdownDiagram(diagram), [diagram]);
  const colors = nativeColors[theme];
  const { width: nodeWidth, height: nodeHeight } = diagramNodeSize;
  const names = new Map(diagram.nodes.map(node => [node.id, node.label]));
  return <>
    <ScrollView horizontal style={[styles.graph, { borderColor: colors.border }]} accessibilityLabel={title}>
      <View style={{ width, height }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs><Marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
            <Path d="M 0 0 L 8 4 L 0 8 Z" fill={colors.mutedForeground} />
          </Marker></Defs>
          {diagram.edges.map((edge, index) => {
            const a = positions.get(edge.source)!;
            const b = positions.get(edge.target)!;
            const markerEnd = `url(#${marker})`;
            const color = colors.mutedForeground;
            if (a === b) {
              const x = a.x + nodeWidth;
              const y = a.y + nodeHeight / 2;
              return <Path key={index} d={`M ${x} ${y - 10} c 18 -14 18 34 0 20`} markerEnd={markerEnd}
                stroke={color} strokeWidth={2} fill="none" />;
            }
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const factor = Math.min(nodeWidth / 2 / Math.abs(dx), nodeHeight / 2 / Math.abs(dy));
            const x1 = a.x + nodeWidth / 2 + dx * factor;
            const y1 = a.y + nodeHeight / 2 + dy * factor;
            const x2 = b.x + nodeWidth / 2 - dx * factor;
            const y2 = b.y + nodeHeight / 2 - dy * factor;
            return <Line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} markerEnd={markerEnd} />;
          })}
          {diagram.nodes.map(node => {
            const { x, y } = positions.get(node.id)!;
            const kind = resolveFlowchartKind(node);
            const ink = { fill: colors.card, stroke: colors.primary, strokeWidth: 1.5 };
            return kind === "decision"
              ? <Polygon key={node.id} points={`${x},${y + nodeHeight / 2} ${x + nodeWidth / 2},${y} ${x + nodeWidth},${y + nodeHeight / 2} ${x + nodeWidth / 2},${y + nodeHeight}`} {...ink} />
              : <Rect key={node.id} x={x} y={y} width={nodeWidth} height={nodeHeight}
                rx={kind === "start" || kind === "end" ? nodeHeight / 2 : nativeRadii.md} {...ink} />;
          })}
        </Svg>
        {diagram.nodes.map(node => {
          const { x, y } = positions.get(node.id)!;
          const decision = resolveFlowchartKind(node) === "decision";
          return <View key={node.id} style={[styles.node, { left: x, top: y, width: nodeWidth, height: nodeHeight, paddingHorizontal: decision ? 26 : 8 }]}>
            <Text numberOfLines={2} style={[styles.nodeText, { color: colors.foreground }]}>{node.label}</Text>
          </View>;
        })}
      </View>
    </ScrollView>
    <View style={styles.stack}>
      <Text accessibilityRole="header" style={[styles.caption, { color: colors.foreground }]}>{locale === "en" ? "Diagram relationships" : "Hubungan diagram"}</Text>
      {diagram.edges.map((edge, index) => <Text key={index} style={[styles.caption, { color: colors.mutedForeground }]}>
        {`${names.get(edge.source)} → ${names.get(edge.target)}${edge.label ? ` (${edge.label})` : ""}`}
      </Text>)}
      {diagram.nodes.filter(node => !diagram.edges.some(edge => edge.source === node.id || edge.target === node.id))
        .map(node => <Text key={node.id} style={[styles.caption, { color: colors.mutedForeground }]}>{node.label}</Text>)}
    </View>
  </>;
}

const styles = StyleSheet.create({
  stack: { gap: 8, alignItems: "flex-start" },
  graph: { alignSelf: "stretch", borderWidth: 1, borderRadius: nativeRadii.md },
  node: { position: "absolute", alignItems: "center", justifyContent: "center" },
  nodeText: { ...nativeTypography.bodyMedium, textAlign: "center", fontSize: 14, lineHeight: 17 },
  caption: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
});
