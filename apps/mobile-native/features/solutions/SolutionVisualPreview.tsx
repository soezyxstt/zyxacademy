import { useMemo } from "react";
import { StyleSheet, Text, View, useColorScheme } from "react-native";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { resolveFlowchartKind } from "../../../../lib/flowchart";
import { nativeTypography } from "../../typography";
import { AdminMarkdownDiagram } from "../shared-ui/AdminMarkdownDiagram";
import { CourseMarkdown } from "../student/CourseMarkdown";
import { CanvasTable, LearningCanvas } from "../student/zyra/LearningCanvas";
import { SolutionGeometry } from "./geometry";
import { SolutionEpsilonGraph } from "./epsilon-graph";
import { SolutionInteractiveScene } from "./interactive-scene";
import { visualFunctionToLatex } from "../../../../lib/math/visual-function-latex";
import { readSolutionVisual, solutionFallback } from "./visual-preview-model";

type Props = { value: unknown; origin: string; locale: "id" | "en"; theme?: keyof typeof nativeColors };

export function SolutionVisualPreview({ value, origin, locale, theme }: Props) {
  const system = useColorScheme();
  const chosenTheme = theme ?? system ?? "light";
  const colors = nativeColors[chosenTheme];
  const visual = useMemo(() => readSolutionVisual(value), [value]);
  const en = locale === "en";
  const muted = [styles.text, { color: colors.mutedForeground }];
  if (!visual) {
    const reference = value && typeof value === "object" ? value as { description?: unknown; title?: unknown } : {};
    const description = typeof reference.description === "string" ? reference.description : typeof reference.title === "string" ? reference.title : null;
    return <Text style={muted}>{description || (en ? "This visual is unavailable." : "Visual ini belum tersedia.")}</Text>;
  }
  const markdown = (source: string, muted = false) => <CourseMarkdown source={source} services={{ session: { origin, locale } }}
    theme={chosenTheme} allowLinks={false} muted={muted} paragraphStyle={styles.text} />;
  const common = { locale, origin, theme: chosenTheme };
  if (visual.kind === "learning_canvas") {
    const { canvas } = visual;
    const diagram = canvas.type === "flowchart" || canvas.type === "concept_map" ? canvas : null;
    return <View style={styles.preview} testID={`student-solution-visual-${visual.kind}`}>
      {visual.label !== canvas.title ? <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{visual.label}</Text> : null}
      {visual.description !== canvas.purpose ? markdown(visual.description, true) : null}
      {diagram ? <>
        <AdminMarkdownDiagram diagram={{ nodes: diagram.nodes.map(node => ({ ...node, kind: resolveFlowchartKind(node) })), edges: diagram.edges,
          direction: diagram.direction }} title={canvas.title} locale={locale} theme={chosenTheme} />
        <CanvasTable table={canvas.fallback} {...common} />
      </> : <LearningCanvas spec={canvas} {...common} initialExpanded interactive={visual.interactive} />}
    </View>;
  }
  const fallback = solutionFallback(visual);
  return <View style={styles.preview} testID={`student-solution-visual-${visual.kind}`}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{visual.label}</Text>
    {markdown(visual.description, true)}
    {visual.kind === "geometry_2d" ? <SolutionGeometry visual={visual} theme={chosenTheme} /> : null}
    {visual.kind === "epsilon_delta_graph" && <>
      {markdown(`$${visualFunctionToLatex(visual.functionModel)}$`)}
      <SolutionEpsilonGraph key={visual.id} spec={visual} locale={locale} theme={chosenTheme} />
    </>}
    {visual.kind === "interactive_scene" && <SolutionInteractiveScene key={visual.id} spec={visual} locale={locale} theme={chosenTheme} />}
    {"table" in fallback ? <CanvasTable table={fallback.table} {...common} /> : <>
      {markdown(fallback.summary)}
      {fallback.content !== fallback.summary && fallback.content !== visual.description ? markdown(fallback.content) : null}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  preview: { gap: 8 },
  title: { ...nativeTypography.headingBold, fontSize: 16, lineHeight: 22 },
  text: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20 },
});
