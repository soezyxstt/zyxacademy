import { View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { evaluationRead, type Distractors, type EvaluationRequest } from "../../../../../packages/native-parity/operations/evaluation-contract";
import { Copy, Heading, Load, Section, Source, strings, useRead, type Presentation } from "./ui";

export function DistractorsScreen({ request, presentation }: { request: EvaluationRequest; presentation: Presentation }) {
  const { theme, locale } = presentation;
  const colors = nativeColors[theme];
  const { routes, distractors: copy } = strings(locale);
  const records = useRead<Distractors>(request, evaluationRead("/admin/distractors"));
  return <>
    <Heading theme={theme}>{routes.distractors}</Heading>
    <Load resource={records} presentation={presentation}>{(items) => items.length === 0
      ? <Section theme={theme}><Copy theme={theme} tone="strong">{copy.emptyTitle}</Copy><Copy theme={theme} tone="muted">{copy.emptyDescription}</Copy></Section>
      : items.map((item) => <Section key={item.id} theme={theme}>
        <Source source={item.prompt} presentation={presentation} />
        <Copy theme={theme} tone="muted">{item.course} · {item.total} {copy.answers}</Copy>
        {item.options.map((option, index) => <View key={index} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><Source source={option.text} presentation={presentation} /></View>
            {option.isCorrect && <Copy theme={theme} tone="strong">✓</Copy>}
            <Copy theme={theme} tone="muted">{option.percentage}%</Copy>
          </View>
          <View style={{ height: 6, borderRadius: 4, backgroundColor: colors.muted }}>
            <View style={{ height: 6, borderRadius: 4, backgroundColor: option.isCorrect ? colors.primary : colors.secondary, width: `${Math.max(0, Math.min(option.percentage, 100))}%` }} />
          </View>
          {option.misconception && <Copy theme={theme}>{copy.misconception} {option.misconception}</Copy>}
        </View>)}
      </Section>)}</Load>
  </>;
}
