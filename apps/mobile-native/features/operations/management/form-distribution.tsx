import { useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { nativeLinkInks } from "../../../../../packages/design-tokens/native-colors";
import { distributionClipboardText, distributionValue, formResponseDistribution } from "../../../../../packages/native-parity/operations/form-distribution";
import type { FormQuestion, FormResponse } from "../../../../../packages/native-parity/operations/management-contract";
import { FormClipboardActions } from "./form-copy";
import { Action, Choices, Copy, Item, styles, useManagement } from "./ui";

const chartChoices = [["pie", "Lingkaran"], ["bar", "Batang"]] as const;
type ChoiceDistribution = Extract<ReturnType<typeof formResponseDistribution>, { kind: "choice" }>;

function DistributionChart({ chart, title }: { chart: ChoiceDistribution; title: string }) {
  const [mode, setMode] = useState<"pie" | "bar">("pie");
  const { colors } = useManagement();
  const bars = chart.multiple || mode === "bar";
  const palette = [colors.primary, colors.secondary, nativeLinkInks["tertiary-1"], nativeLinkInks["tertiary-2"], nativeLinkInks["tertiary-3"]];
  const circleLength = Math.PI * 64;
  let offset = 0;
  return <View style={[styles.field, { width: "100%" }]}>
    {!chart.multiple && <Choices values={chartChoices} current={mode} onChange={setMode} />}
    {!bars && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={144} height={144} viewBox="0 0 144 144">
        <Circle cx={72} cy={72} r={32} stroke={colors.muted} strokeWidth={64} fill="none" />
        {chart.items.map(({ label, percent }, index) => {
          if (percent <= 0) return null;
          const length = circleLength * percent / 100;
          const start = offset;
          offset += length;
          return <Circle key={label} cx={72} cy={72} r={32} fill="none" strokeWidth={64}
            stroke={palette[index % palette.length]} strokeDasharray={[length, circleLength]} strokeDashoffset={-start}
            rotation={-90} originX={72} originY={72} />;
        })}
      </Svg>
    </View>}
    {chart.items.map((item, index) => <View key={item.label} style={styles.field}>
      <View style={styles.row}>
        {!bars && <View importantForAccessibility="no" style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: palette[index % palette.length] }} />}
        <View style={{ flex: 1 }}><Copy>{item.label}</Copy></View>
        <Copy>{distributionValue(item)}</Copy>
      </View>
      {bars && <View importantForAccessibility="no-hide-descendants" style={{ height: 7, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
        <View style={{ height: "100%", width: `${Math.min(100, item.percent)}%`, backgroundColor: colors.primary }} />
      </View>}
    </View>)}
    <FormClipboardActions actions={[{ label: "Salin data grafik", text: distributionClipboardText(title, chart.items) }]} />
  </View>;
}

export function FormQuestionDistribution({ question, index, responses, answer }: {
  question: FormQuestion;
  index: number;
  responses: readonly FormResponse[];
  answer: (response: FormResponse, index: number) => ReactNode;
}) {
  const data = useMemo(() => formResponseDistribution(question, index, responses), [question, index, responses]);
  const [page, setPage] = useState<number | null>(null);
  const pageSize = 20;
  return <Item title={question.title} meta={`${data.answered} / ${responses.length} respons`} actions={
    data.kind === "choice" && data.items.length ? <DistributionChart chart={data} title={question.title} /> :
    data.kind === "grid" ? <View style={[styles.field, { width: "100%" }]}>
      {data.rows.map((row, rowIndex) => <Item key={rowIndex} title={row.label} actions={<View style={[styles.field, { width: "100%" }]}>
        {row.cells.map((cell, cellIndex) => <Copy key={cellIndex}>{`${cell.label} · ${distributionValue(cell)}`}</Copy>)}
      </View>} />)}
    </View> :
    data.kind === "answers" ? <View style={[styles.field, { width: "100%" }]}>
      <Action onPress={() => setPage(page === null ? 0 : null)}>{page === null ? "Lihat jawaban" : "Sembunyikan jawaban"}</Action>
      {page !== null && <>
        {data.responses.slice(page * pageSize, (page + 1) * pageSize).map((response, index) => answer(response, page * pageSize + index))}
        {data.responses.length > pageSize && <View style={styles.row}>
          <Action disabled={page === 0} onPress={() => setPage(page - 1)}>Sebelumnya</Action>
          <Action disabled={(page + 1) * pageSize >= data.responses.length} onPress={() => setPage(page + 1)}>Berikutnya</Action>
        </View>}
      </>}
    </View> : undefined
  } />;
}
