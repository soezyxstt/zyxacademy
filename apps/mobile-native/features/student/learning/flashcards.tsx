import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { courseHref, isFlashcardReviewReceipt, learningApi, type Flashcard } from "../../../../../packages/native-parity/student/learning/contracts";
import { nativeLinkInks, nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { Progress } from "../../../components/Progress";
import { RadioGroup, RadioGroupItem } from "../../../components/RadioGroup";
import { hapticSelection } from "../../../device/haptics";
import { useReducedMotion } from "../../../device/reduced-motion";
import { nativeTypography } from "../../../typography";
import type { StudentScreenProps } from "../contracts";
import { Body, Copy, LearningPage, Message, Section, english, postJson, readJson, RequestError, styles, useLearningColors, type Translate } from "./ui";

const batchSize = 10;
const cardHeight = 256;
const gradeDockBreakpoint = 768;
const gradeOptions = [
  { key: "again", tone: "error" }, { key: "hard", tone: "warning" },
  { key: "understood", tone: "brand" }, { key: "easy", tone: "success" },
] as const;
const reasonLabels: Record<string, string> = {
  "Tanpa pemetaan Idea": "reasonUnmapped",
  "Perlu dikuasai": "reasonMastery",
  "Kartu baru": "reasonNew",
  "Waktunya mengulang": "reasonDue",
};

function FlipCard({ flipped, disabled, onFlip, front, back }: {
  flipped: boolean; disabled: boolean; onFlip: () => void; front: ReactNode; back: ReactNode;
}) {
  const colors = useLearningColors();
  const reduceMotion = useReducedMotion();
  const [rotation] = useState(() => new Animated.Value(flipped ? 1 : 0));
  const [frontHeight, setFrontHeight] = useState(cardHeight);
  const [backHeight, setBackHeight] = useState(cardHeight);

  useEffect(() => {
    const target = flipped ? 1 : 0;
    if (reduceMotion) {
      rotation.setValue(target);
      return;
    }
    const animation = Animated.timing(rotation, {
      toValue: target, duration: 600, easing: Easing.bezier(0.4, 0, 0.2, 1), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [flipped, reduceMotion, rotation]);

  const face = (isBack: boolean, children: ReactNode, measure: (height: number) => void) => {
    const active = flipped === isBack;
    const angle = rotation.interpolate({ inputRange: [0, 1], outputRange: isBack ? ["180deg", "360deg"] : ["0deg", "180deg"] });
    const opacity = rotation.interpolate({
      inputRange: [0, 0.4999, 0.5, 1], outputRange: isBack ? [0, 0, 1, 1] : [1, 1, 0, 0],
    });
    return <Animated.View pointerEvents={active ? "auto" : "none"}
      accessible={false} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, { opacity: reduceMotion ? Number(active) : opacity },
        !reduceMotion && { transform: [{ perspective: 1000 }, { rotateY: angle }] }]}>
      <Pressable accessible={false} disabled={disabled || !active} onPress={onFlip}
        style={[flashcardStyles.face, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <View onLayout={({ nativeEvent }) => measure(nativeEvent.layout.height + 2)} style={flashcardStyles.faceContent}>
          {children}
        </View>
      </Pressable>
    </Animated.View>;
  };

  return <View style={{ height: Math.max(frontHeight, backHeight) }}>
    {face(false, front, setFrontHeight)}
    {face(true, back, setBackHeight)}
  </View>;
}

export function FlashcardsPage({ cards, props, title, t, reload }: {
  cards: Flashcard[]; props: StudentScreenProps; title: string; t: Translate; reload: () => void;
}) {
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
  const { width, fontScale } = useWindowDimensions();
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
  if (!queue.length) return <LearningPage props={props} title={title}><Message>{label("empty")}</Message></LearningPage>;
  if (!card) {
    const remaining = Math.max(0, queue.length - offset - batchSize);
    return <LearningPage props={props} title={title}><Section title={label("sessionDone", { current: session, total })}>
      <Copy>{label("sessionSummary", { count: batchLength, completed })}</Copy>
      {remaining ? <Button style={styles.action} onPress={() => { setOffset(offset + batchSize); setIndex(0); reset(); }}>{label("nextSession", { count: Math.min(batchSize, remaining) })}</Button> : null}
      <Button variant="outline" style={styles.action} onPress={() => props.navigate(courseHref(courseId))}>{label("backToOverview")}</Button>
    </Section></LearningPage>;
  }
  const reason = reasonLabels[card.priorityReason] ? label(reasonLabels[card.priorityReason]) : card.priorityReason;
  const allowFlip = mode === "standard" || checked !== null;
  const flip = () => { void hapticSelection(); setFlipped(!flipped); };
  const flipButton = (isBack: boolean) => allowFlip ? <Button variant="ghost" wrapLabel style={flashcardStyles.flipButton}
    disabled={pending || failure === "uncertain" || flipped !== isBack}
    onPress={(event) => { event.stopPropagation(); flip(); }}>{label(isBack ? "flipToQuestion" : "flipCard")}</Button> : null;
  const grades = flipped || checked !== null ? <View style={flashcardStyles.grades}>
      {gradeOptions.map(({ key, tone }, index) => <Button key={key} onPress={() => void grade(index + 1)} size="sm" wrapLabel
        testID={key === "understood" && pending ? "student.flashcard.grade-pending" : undefined}
        accessibilityState={{ busy: pending }}
        style={[flashcardStyles.grade, (width < 350 || fontScale > 1.3) && flashcardStyles.wideGrade]}
        softTone={tone} variant="ghost" disabled={pending || failure === "uncertain"}>{label(key)}</Button>)}
  </View> : null;
  const docked = width < gradeDockBreakpoint;
  const dock = docked && grades ? <View testID="student.flashcard.grade-dock" style={[flashcardStyles.dock, flashcardStyles.rating, { borderColor: colors.border }]}>{grades}</View> : null;
  return <View style={styles.frame}>
    <LearningPage props={props} title={title} footer={dock}>
    <View style={flashcardStyles.rating}>
      <Progress value={index} max={batchLength} accessibilityLabel={label("reviewTitle")} style={flashcardStyles.progress} />
      <View style={flashcardStyles.controls}>
        <Copy muted style={flashcardStyles.caption}>{label("sessionProgress", { session, total, current: index + 1, count: batchLength, all: queue.length })}</Copy>
        <RadioGroup accessibilityLabel={label("mode")} orientation="horizontal" value={mode} style={flashcardStyles.modes}
          disabled={pending || failure === "uncertain"} onValueChange={(option) => { setMode(option === "exam" ? "exam" : "standard"); reset(); }}>
          <RadioGroupItem value="standard" label={label("standard")} />
          <RadioGroupItem value="exam" label={label("typeAnswer")} />
        </RadioGroup>
      </View>
    </View>
    {card.dueStatus === "review" ? <Copy muted>{label("dueForReview")}</Copy> : null}
    <FlipCard key={position} flipped={flipped} disabled={pending || failure === "uncertain" || !allowFlip} onFlip={flip}
      front={<>
        <View style={flashcardStyles.faceHeader}>
          <Copy style={{ ...flashcardStyles.tag, color: colors.brandPrimary, borderColor: `${colors.brandPrimary}33`, backgroundColor: `${colors.brandPrimary}0d` }}>{reason}</Copy>
          <Copy muted style={flashcardStyles.caption}>{label("question")}</Copy>
        </View>
        <View style={flashcardStyles.faceBody}>{render(card.front, true)}</View>
        {flipButton(false)}
      </>}
      back={<>
        <View style={flashcardStyles.faceHeader}>
          <Copy style={{ ...flashcardStyles.tag, color: colors.foreground, borderColor: `${nativeLinkInks.success}33`, backgroundColor: `${nativeLinkInks.success}0d` }}>{label("answer")}</Copy>
          {card.recallDifficulty === null ? <Copy muted style={flashcardStyles.caption}>{label("details")}</Copy>
            : <View accessible accessibilityLabel={label("recallLevel", { level: card.recallDifficulty })} style={flashcardStyles.recall}>
              {[1, 2, 3, 4, 5].map((level) => <View key={level} style={[flashcardStyles.recallDot,
                { backgroundColor: level <= (card.recallDifficulty ?? 0) ? nativeLinkInks.warning : colors.muted }]} />)}
            </View>}
        </View>
        <View style={flashcardStyles.faceBody}>
          {render(card.back, true)}
          {card.explanation ? <View style={[flashcardStyles.explanation, { borderColor: colors.border }]}>
            <Copy muted style={nativeTypography.bodySemibold}>{label("explanation")}</Copy>{render(card.explanation)}
          </View> : null}
        </View>
        {flipButton(true)}
      </>} />
    <Button variant="ghost" style={[styles.action, flashcardStyles.skip]} disabled={queue.length - position <= 1 || pending || failure === "uncertain"} onPress={() => {
      setQueue((current) => [...current.slice(0, position), ...current.slice(position + 1), card]); reset();
    }}>{label("skip")}</Button>
    {mode === "exam" ? <Section>
      {checked !== null ? <Copy>{label(checked ? "correctMatch" : "incorrect")}</Copy> : null}
      <Input accessibilityLabel={label("yourAnswer")} placeholder={label("answerPlaceholder")} value={answer} onChangeText={setAnswer}
        onSubmitEditing={check} disabled={checked !== null || pending} maxLength={4000} style={styles.field} />
      <Button onPress={checked === null ? check : reset} disabled={pending || failure === "uncertain"} style={styles.action}>{label(checked === null ? "check" : "tryAgain")}</Button>
    </Section> : null}
    {!docked && grades ? <View style={flashcardStyles.rating}>{grades}</View> : null}
    {failure === "answer" ? <Message>{label("answerRequired")}</Message> : null}
    {failure === "uncertain" ? <Message action={isEnglish ? "Refresh due cards" : "Muat ulang kartu"} onAction={reload}>
      {isEnglish ? "The review may have been saved. Refresh the queue to continue." : "Ulasan mungkin sudah tersimpan. Muat ulang antrean untuk melanjutkan."}
    </Message> : null}
    </LearningPage>
    {failure === "review" && <View pointerEvents="none" style={[flashcardStyles.reviewNotice,
      { backgroundColor: colors.card, borderColor: `${nativeLinkInks.error}80` }]}>
      <View style={[flashcardStyles.reviewNoticeTint, { backgroundColor: `${nativeLinkInks.error}1f` }]}>
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
          style={[flashcardStyles.noticeText, { color: colors.foreground }]}>{label("saveReviewFailed")}</Text>
      </View>
    </View>}
  </View>;
}

const flashcardStyles = StyleSheet.create({
  face: { flex: 1, borderWidth: 1, borderRadius: nativeRadii["2xl"] },
  faceContent: { flexGrow: 1, minHeight: cardHeight - 2, minWidth: 0, padding: 16, gap: 16, justifyContent: "space-between" },
  faceHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  faceBody: { flexGrow: 1, justifyContent: "center", gap: 16 },
  caption: { ...nativeTypography.bodyMedium, fontSize: 12, lineHeight: 16, includeFontPadding: false },
  tag: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, includeFontPadding: false,
    borderRadius: nativeRadii.sm, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  recall: { flexDirection: "row", alignItems: "center", gap: 2 },
  recallDot: { width: 6, height: 6, borderRadius: 3 },
  explanation: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  flipButton: { minHeight: 44, height: "auto", alignSelf: "center", maxWidth: "100%" },
  skip: { alignSelf: "flex-end" },
  rating: { gap: 8 },
  progress: { height: 4 },
  controls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 4 },
  modes: { flexWrap: "wrap", gap: 12 },
  dock: { flexShrink: 0, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  grades: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  grade: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 46, height: "auto", paddingHorizontal: 4, paddingVertical: 12 },
  wideGrade: { flexBasis: "45%" },
  reviewNotice: { position: "absolute", top: 8, right: 12, width: 248, maxWidth: "90%", borderWidth: 1,
    borderRadius: nativeRadii.xl, overflow: "hidden", elevation: 4, boxShadow: "0 4px 8px #0000001f" },
  reviewNoticeTint: { padding: 14 },
  noticeText: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
});
