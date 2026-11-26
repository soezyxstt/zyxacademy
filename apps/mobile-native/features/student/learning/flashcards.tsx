import { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { courseHref, isFlashcardReviewReceipt, learningApi, type Flashcard } from "../../../../../packages/native-parity/student/learning/contracts";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { hapticSelection } from "../../../device/haptics";
import type { StudentScreenProps } from "../contracts";
import { Body, Copy, Message, Progress, Section, english, postJson, readJson, RequestError, styles, useLearningColors, type Translate } from "./ui";

const batchSize = 10;
const gradeLabels = ["again", "hard", "understood", "easy"];
const reasonLabels: Record<string, string> = {
  "Tanpa pemetaan Idea": "reasonUnmapped",
  "Perlu dikuasai": "reasonMastery",
  "Kartu baru": "reasonNew",
  "Waktunya mengulang": "reasonDue",
};

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
  const render = (source: string, centered = false) => props.renderAssessmentMarkdown?.(source, courseId) ?? <Body source={source} centered={centered} />;
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
    if (!card || (!flipped && checked === null) || busy.current || failure === "uncertain") return;
    busy.current = true;
    setPending(true);
    setFailure(null);
    try {
      const receipt = await readJson<unknown>(props.request, learningApi, postJson({ action: "flashcard-review", courseId, flashcardId: card.id,
        grade: value, isExamMode: mode === "exam", manualAnswer: mode === "exam" ? answer : undefined }));
      if (!isFlashcardReviewReceipt(receipt)) throw new Error("Invalid flashcard receipt");
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
  const reason = reasonLabels[card.priorityReason] ? label(reasonLabels[card.priorityReason]) : card.priorityReason;
  const flipLabel = label(flipped ? "flipToQuestion" : "flipCard");
  const allowFlip = mode === "standard" || checked !== null;
  const flip = () => { void hapticSelection(); setFlipped(!flipped); };
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
    {card.dueStatus === "review" ? <Copy muted>{label("dueForReview")}</Copy> : null}
    <Pressable accessible={false} disabled={pending || failure === "uncertain" || !allowFlip} onPress={flip}
      style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, minHeight: 256, padding: 16, gap: 10, justifyContent: "space-between" }}>
      <View style={styles.rowMain}>
        <Copy>{flipped ? label("answer") : reason}</Copy>
        <Copy muted>{flipped && card.recallDifficulty !== null ? label("recallLevel", { level: card.recallDifficulty }) : label(flipped ? "details" : "question")}</Copy>
      </View>
      {render(flipped ? card.back : card.front, true)}
      {flipped && card.explanation ? <Section title={label("details")}>{render(card.explanation)}</Section> : null}
      {allowFlip ? <Button variant="ghost" style={{ ...styles.action, alignSelf: "center" }} disabled={pending || failure === "uncertain"}
        onPress={(event) => { event.stopPropagation(); flip(); }}>{flipLabel}</Button> : null}
    </Pressable>
    {mode === "exam" ? <Section>
      {checked !== null ? <Copy>{label(checked ? "correctMatch" : "incorrect")}</Copy> : null}
      <Input accessibilityLabel={label("yourAnswer")} placeholder={label("answerPlaceholder")} value={answer} onChangeText={setAnswer}
        onSubmitEditing={check} disabled={checked !== null || pending} maxLength={4000} style={styles.field} />
      <Button onPress={checked === null ? check : reset} disabled={pending || failure === "uncertain"} style={styles.action}>{label(checked === null ? "check" : "tryAgain")}</Button>
    </Section> : null}
    {flipped || checked !== null ? <View style={styles.wrap}>
      {gradeLabels.map((key, index) => <Button key={key} onPress={() => void grade(index + 1)} style={styles.action}
        variant={index === 0 ? "destructive" : index === 2 ? "default" : "outline"} disabled={pending || failure === "uncertain"}>{label(key)}</Button>)}
    </View> : null}
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
