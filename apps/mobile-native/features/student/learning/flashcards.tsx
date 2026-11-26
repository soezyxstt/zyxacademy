import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { courseHref, learningApi, type Flashcard } from "../../../../../packages/native-parity/student/learning/contracts";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { hapticSelection } from "../../../device/haptics";
import type { StudentScreenProps } from "../contracts";
import { Body, Copy, Message, Progress, Section, english, postJson, readJson, RequestError, styles, useLearningColors, type Translate } from "./ui";

const batchSize = 10;
const gradeLabels = ["again", "hard", "understood", "easy"];

export function FlashcardsContent({ cards, props, t, reload }: { cards: Flashcard[]; props: StudentScreenProps; t: Translate; reload: () => void }) {
  const [queue, setQueue] = useState(cards);
  const [offset, setOffset] = useState(0);
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [mode, setMode] = useState<"standard" | "exam">("standard");
  const [answer, setAnswer] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<"answer" | "review" | "uncertain" | null>(null);
  const busy = useRef(false);
  const colors = useLearningColors();
  const label = (key: string, values?: Record<string, string | number>) => t(`learning.flashcards.${key}`, values);
  const position = offset + index;
  const batchLength = Math.min(batchSize, queue.length - offset);
  const card = index < batchSize ? queue[position] : undefined;
  const session = Math.floor(offset / batchSize) + 1;
  const total = Math.ceil(queue.length / batchSize);
  const isEnglish = english(props.session.locale);
  const courseId = props.route.params.id;

  const reset = () => {
    setAnswer(""); setFlipped(false); setChecked(null); setFailure(null);
  };
  const render = (source: string) => props.renderAssessmentMarkdown?.(source, courseId) ?? <Body source={source} />;
  const check = () => {
    const normalize = (value: string) => value.toLowerCase().trim().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
    if (!card || !answer.trim()) { setFailure("answer"); return; }
    const typed = normalize(answer);
    const expected = normalize(card.back);
    setFailure(null);
    setChecked(Boolean(typed && expected && (expected.includes(typed) || typed.includes(expected))));
    setFlipped(true);
  };
  const grade = async (value: number) => {
    if (!card || !flipped || busy.current || failure === "uncertain") return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    try {
      await readJson(props.request, learningApi, postJson({ action: "flashcard-review", courseId, flashcardId: card.id,
        grade: value, isExamMode: mode === "exam", manualAnswer: mode === "exam" ? answer : undefined }));
      if (value === 1) setQueue((current) => [...current, { ...card, dueStatus: "review" }]);
      void hapticSelection();
      setCompleted((current) => current + 1);
      setIndex((current) => current + 1);
      reset();
    } catch (error) {
      setFailure(error instanceof RequestError && error.status < 500 ? "review" : "uncertain");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  if (!queue.length) return <Message>{label("empty")}</Message>;
  if (!card) {
    const remaining = Math.max(0, queue.length - offset - batchSize);
    return <Section title={label("sessionDone", { current: session, total })}>
      <Copy>{label("sessionSummary", { count: batchLength, completed })}</Copy>
      {remaining ? <Button style={styles.action} onPress={() => { setOffset(offset + batchSize); setIndex(0); reset(); }}>{label("nextSession", { count: Math.min(batchSize, remaining) })}</Button> : null}
      <Button variant="outline" style={styles.action} onPress={() => props.navigate(courseHref(courseId))}>{label("backToOverview")}</Button>
    </Section>;
  }
  return <>
    <Section>
      <Copy muted>{label("sessionProgress", { session, total, current: index + 1, count: batchLength, all: queue.length })}</Copy>
      <Progress value={100 * index / batchLength} label={label("reviewTitle")} />
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label("mode")}>
        {(["standard", "exam"] as const).map((option) => <Button key={option} variant={mode === option ? "default" : "outline"}
          accessibilityRole="radio" accessibilityState={{ checked: mode === option }} disabled={pending || failure === "uncertain"} style={styles.action}
          onPress={() => { void hapticSelection(); setMode(option); reset(); }}>{label(option === "standard" ? "standard" : "typeAnswer")}</Button>)}
      </View>
    </Section>
    <Pressable accessibilityRole="button" accessibilityLabel={label(flipped ? "flipToQuestion" : "flipCard")}
      disabled={pending || failure === "uncertain" || (mode === "exam" && checked === null)} onPress={() => { void hapticSelection(); setFlipped(!flipped); }}
      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 148, padding: 16, gap: 10 }}>
      <Copy muted>{label(flipped ? "answer" : "question")}</Copy>
      {render(flipped ? card.back : card.front)}
      {flipped && card.explanation ? <Section title={label("details")}>{render(card.explanation)}</Section> : null}
    </Pressable>
    {mode === "exam" && checked === null ? <Section>
      <Input accessibilityLabel={label("yourAnswer")} placeholder={label("answerPlaceholder")} value={answer} onChangeText={setAnswer}
        onSubmitEditing={check} maxLength={4000} style={styles.field} />
      <Button onPress={check} style={styles.action}>{label("check")}</Button>
    </Section> : null}
    {checked !== null ? <Copy>{label(checked ? "correctMatch" : "incorrect")}</Copy> : null}
    {flipped ? <View style={styles.wrap}>
      {gradeLabels.map((key, index) => <Button key={key} onPress={() => void grade(index + 1)} style={styles.action}
        variant={index === 2 ? "default" : "outline"} disabled={pending || failure === "uncertain"}>{label(key)}</Button>)}
    </View> : mode === "standard" ? <Button variant="outline" style={styles.action} onPress={() => setFlipped(true)} disabled={failure === "uncertain"}>{label("flipCard")}</Button> : null}
    {queue.length - position > 1 ? <Button variant="ghost" style={styles.action} disabled={pending || failure === "uncertain"} onPress={() => {
      setQueue((current) => [...current.slice(0, position), ...current.slice(position + 1), card]); reset();
    }}>{label("skip")}</Button> : null}
    {failure === "answer" ? <Message>{label("answerRequired")}</Message> : null}
    {failure === "review" ? <Message action={label("reviewAgain")} onAction={reload}>{label("saveReviewFailed")}</Message> : null}
    {failure === "uncertain" ? <Message action={isEnglish ? "Refresh due cards" : "Muat ulang kartu"} onAction={reload}>
      {isEnglish ? "The review may have been saved. Refresh the queue to continue." : "Ulasan mungkin sudah tersimpan. Muat ulang antrean untuk melanjutkan."}
    </Message> : null}
  </>;
}
