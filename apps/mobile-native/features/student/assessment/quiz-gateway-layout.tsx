import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { AssessmentResult, AssessmentRow } from "../../../../../packages/native-parity/student/assessment/contract";
import { nativeTypography } from "../../../typography";
import { Body, Button, fill, Heading, useAssessment, useAssessmentColors, useAssessmentCopy } from "./ui";

export function QuizGatewayInstructions({ assessment, completedCount }: { assessment: AssessmentRow; completedCount: number }) {
  const { drafts } = useAssessment();
  const { messages, tx } = useAssessmentCopy();
  const { border, mutedForeground } = useAssessmentColors();
  const copy = messages.quizTake;
  const minutes = assessment.durationSeconds === null ? null : Math.round(assessment.durationSeconds / 60);
  const facts = [
    { label: copy.questionCount, value: assessment.questionCount ?? "-" },
    { label: copy.duration, value: minutes === null ? messages.quizList.noLimit : tx(`${minutes} menit`, `${minutes} min`) },
    { label: copy.attemptsRemaining, value: assessment.maxAttempts === null ? copy.unlimitedAttempts : fill(copy.attemptsLeft, {
      remaining: Math.max(0, assessment.maxAttempts - completedCount), total: assessment.maxAttempts,
    }) },
  ];
  const instructions = [
    copy.instructions.independent,
    minutes !== null && copy.instructions.timer,
    drafts && tx("Draf jawaban tersimpan otomatis di perangkat ini.", "Your answer draft is saved automatically on this device."),
    minutes !== null && tx("Jika aplikasi ditutup, Anda dapat melanjutkan kuis selama batas waktu belum habis.", "If you close the app, you can resume while the time limit remains."),
  ];
  return <View style={quizGatewayStyles.instructions}>
    <Heading>{copy.instructionsTitle}</Heading>
    <View style={[quizGatewayStyles.facts, { borderColor: border }]}>
      {facts.map(({ label, value }, index) => <View key={label} style={[quizGatewayStyles.fact,
        index > 0 && { borderTopColor: border, borderTopWidth: 1 }]}>
        <Body tone="muted" style={quizGatewayStyles.caption}>{label}</Body>
        <Body style={quizGatewayStyles.metric}>{value}</Body>
      </View>)}
    </View>
    <View accessibilityRole="list" style={quizGatewayStyles.bullets}>
      {instructions.map(line => line && <View key={line} style={quizGatewayStyles.bullet}>
        <Text importantForAccessibility="no" accessibilityElementsHidden style={{ color: mutedForeground }}>•</Text>
        <Body tone="muted" style={quizGatewayStyles.instruction}>{line}</Body>
      </View>)}
    </View>
  </View>;
}

export function QuizGatewayHistory({ history, onReview }: { history: AssessmentResult[]; onReview(id: string): void }) {
  const { messages, tx } = useAssessmentCopy();
  const { border, mutedForeground } = useAssessmentColors();
  const copy = messages.quizTake;
  return <View style={quizGatewayStyles.history}>
    <Heading>{copy.attemptHistory}</Heading>
    {history.length === 0 ? <View style={[quizGatewayStyles.historyEntry, { borderTopColor: border }]}>
      <Body tone="muted" style={quizGatewayStyles.caption}>{copy.noCompletedAttempts}</Body>
    </View> : history.map((attempt, index) => {
      const title = fill(copy.attemptNumber, { number: history.length - index });
      const date = attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleDateString(tx("id-ID", "en"), { dateStyle: "medium" }) : null;
      const seconds = attempt.durationSeconds ?? 0;
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      const duration = seconds === 0 ? "-" : minutes > 0 ? tx(`${minutes} menit ${remainder} detik`, `${minutes} min ${remainder} sec`) : tx(`${remainder} detik`, `${remainder} sec`);
      return <View key={attempt.id} style={[quizGatewayStyles.historyEntry, { borderTopColor: border }]}>
        <View style={quizGatewayStyles.historyTop}>
          <Body style={quizGatewayStyles.attemptTitle}>{title}</Body>
          <Body style={quizGatewayStyles.metric}>{attempt.score === null ? messages.results.pending : `${attempt.score}%`}</Body>
        </View>
        <View style={quizGatewayStyles.historyMeta}>
          {date ? <View style={quizGatewayStyles.historyFact}>
            <QuizGatewayIcon name="calendar" color={mutedForeground} size={12} />
            <Body tone="muted" style={quizGatewayStyles.caption}>{date}</Body>
          </View> : null}
          <View style={quizGatewayStyles.historyFact}>
            <QuizGatewayIcon name="clock" color={mutedForeground} size={12} />
            <Body tone="muted" style={quizGatewayStyles.caption}>{fill(copy.durationValue, { duration })}</Body>
          </View>
        </View>
        <Button variant="ghost" accessibilityRole="link" accessibilityLabel={`${messages.summary.viewReview}, ${title}`}
          testID={`student-assessment-review-${attempt.id}`} size="sm" style={quizGatewayStyles.review} onPress={() => onReview(attempt.id)}>{messages.summary.viewReview}</Button>
      </View>;
    })}
  </View>;
}

const iconPaths = {
  calendar: "M8 2v4m8-4v4M3 10h18M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2",
  play: "M8 5a1 1 0 0 0-1 1v12a1 1 0 0 0 1.5.9l10-6a1 1 0 0 0 0-1.8l-10-6A1 1 0 0 0 8 5Z",
  warning: "M21.7 18 13.7 4a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4m0 4h.01",
} as const;

export function QuizGatewayIcon({ name, color, size }: { name: keyof typeof iconPaths; color: string; size: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Path d={iconPaths[name]} fill={name === "play" ? color : "none"} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

export const quizGatewayStyles = StyleSheet.create({
  instructions: { gap: 16 },
  facts: { borderTopWidth: 1, borderBottomWidth: 1 },
  fact: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingVertical: 6, gap: 12 },
  caption: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  metric: { ...nativeTypography.bodySemibold, fontVariant: ["tabular-nums"], lineHeight: 20, flexShrink: 1, textAlign: "right" },
  bullets: { gap: 4 },
  bullet: { flexDirection: "row", alignItems: "baseline", paddingLeft: 8, gap: 6 },
  instruction: { flexShrink: 1, lineHeight: 23 },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", borderTopWidth: 1, paddingTop: 12, gap: 8 },
  actionMessage: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actionMessageText: { flexShrink: 1, lineHeight: 20 },
  start: { borderRadius: 8, paddingHorizontal: 24 },
  history: { gap: 12, marginTop: 8 },
  historyEntry: { borderTopWidth: 1, paddingVertical: 12, gap: 4 },
  historyTop: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  attemptTitle: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, flexShrink: 1 },
  historyMeta: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  historyFact: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  review: { alignSelf: "flex-end" },
});
