import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { resolveDateDisplay } from "../../../../../lib/date-utils/display";
import type { AssessmentResult } from "../../../../../packages/native-parity/student/assessment/contract";
import { nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../../../typography";
import { Body, Button, useAssessment, useAssessmentColors, useAssessmentCopy } from "./ui";

type ResultLinkProps = {
  result: AssessmentResult;
  status: string;
  divided: boolean;
  onPress: () => void;
};

function ResultLink({ result, status, divided, onPress }: ResultLinkProps) {
  const { messages } = useAssessmentCopy();
  const { session, resultsTimeZone } = useAssessment();
  const colors = useAssessmentColors();
  const [focused, setFocused] = useState(false);
  const pendingReview = result.status === "pending_review";
  const submittedAt = result.submittedAt ? resolveDateDisplay({
    date: result.submittedAt, options: { dateStyle: "medium", timeStyle: "short", timeZone: resultsTimeZone },
  }, session.locale.toLowerCase().startsWith("en") ? "en" : "id")?.text : undefined;
  const submitted = [messages.results[result.kind], submittedAt].filter(Boolean).join(", ");
  const visibleStatus = result.score == null && pendingReview ? null : status;
  const score = result.score != null ? `${result.score}%` : pendingReview ? status : messages.results.pending;

  return <View style={divided && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: `${colors.border}4d` }}>
    <Pressable
      testID={`student-assessment-${result.id}`}
      accessibilityRole="link"
      accessibilityLabel={[result.assessmentTitle, submitted, visibleStatus, score].filter(Boolean).join(", ")}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: `${colors.muted}66` },
        focused && { outlineWidth: 2, outlineColor: colors.ring },
      ]}
    >
      <View style={styles.rowBody}>
        <Text style={[styles.title, { color: colors.foreground }]}>{result.assessmentTitle}</Text>
        <View style={styles.meta}>
          <Body tone="muted" style={styles.caption}>{submitted}</Body>
          {visibleStatus ? <Body tone="muted" style={pendingReview ? { ...styles.caption, color: nativeLinkInks.warning } : styles.caption}>{visibleStatus}</Body> : null}
        </View>
      </View>
      <Body tone={result.score != null ? "normal" : "muted"} style={result.score != null ? styles.score : styles.unscored}>{score}</Body>
    </Pressable>
  </View>;
}

export function ResultsHistory({ results, status, openResult, startPractice }: {
  results: AssessmentResult[];
  status(result: AssessmentResult): string;
  openResult(id: string): void;
  startPractice(): void;
}) {
  const { messages } = useAssessmentCopy();
  const colors = useAssessmentColors();

  if (results.length) {
    return <View accessibilityRole="list">
      {results.map((result, index) => <ResultLink key={result.id} result={result} status={status(result)}
        divided={index > 0} onPress={() => openResult(result.id)} />)}
    </View>;
  }

  return <View style={[styles.empty, { borderTopColor: `${colors.border}8c` }]}>
    <Svg width={20} height={20} viewBox="0 0 24 24" accessible={false} style={styles.historyIcon}>
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8m0-5v5h5m4-1v5l4 2"
        stroke={colors.mutedForeground} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
    <View style={styles.rowBody}>
      <Text accessibilityRole="header" style={[styles.title, nativeTypography.headingBold, { color: colors.foreground }]}>
        {messages.results.emptyTitle}
      </Text>
      <Body tone="muted" style={styles.emptyDescription}>{messages.results.emptyDescription}</Body>
      <Button size="sm" variant="secondary" accessibilityRole="link" testID="student-assessment-start-practice"
        style={styles.practice} onPress={startPractice}>{messages.results.startPractice}</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: nativeRadii.sm },
  rowBody: { minWidth: 0, flex: 1 },
  title: { ...nativeTypography.headingSemibold, fontSize: 16, lineHeight: 26, includeFontPadding: false },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2, marginTop: 2 },
  caption: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  score: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, fontVariant: ["tabular-nums"] },
  unscored: { maxWidth: 96, fontSize: 12, lineHeight: 18, textAlign: "right" },
  empty: { maxWidth: 576, flexDirection: "row", alignItems: "flex-start", gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 20 },
  emptyDescription: { marginTop: 4, fontSize: 12, lineHeight: 19.5 },
  historyIcon: { marginTop: 2 },
  practice: { alignSelf: "flex-start", marginTop: 12 },
});
