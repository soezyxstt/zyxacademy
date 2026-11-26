import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from "react-native";
import { landingFlashcardGrades, landingPathProfiles, landingQuizOptions } from "../../../../../lib/marketing-learning-previews";
import { nativeRadii } from "../../../../../packages/design-tokens/native-colors";
import { Action, Divider, Label, layout, RowLink, textWith, usePublic } from "./ui";

function Frame({ title, children }: { title?: string; children: ReactNode }) {
  const { colors } = usePublic();
  return <View style={[layout.panel, { borderColor: colors.border }]}>
    {title && <><Label tone="subheading">{title}</Label><Divider /></>}
    {children}
  </View>;
}

function LearningSection({ title, description, note, href, reverse, children }: {
  title: string; description?: string; note?: string; href: string; reverse?: boolean; children: ReactNode;
}) {
  const { width, fontScale } = useWindowDimensions();
  const { copy: { home } } = usePublic();
  const columns = width >= 850 && fontScale <= 1.3;
  return <View style={[layout.section, description && columns && (reverse ? styles.reverse : styles.columns)]}>
    <View style={[layout.item, description && columns && styles.column]}>
      <Label tone="heading">{title}</Label>
      {description && <Label tone="muted">{description}</Label>}
      {note && <Label tone="meta">{note}</Label>}
      <View style={layout.row}><Action href={href} variant="link">{home.tryDemo}</Action></View>
    </View>
    <View style={description && columns && styles.column}>{children}</View>
  </View>;
}

function Quiz() {
  const { copy: { home } } = usePublic();
  const [picked, setPicked] = useState<(typeof landingQuizOptions)[number] | null>(null);
  return <Frame title={home.weeklyQuizFrameTitle}>
    <Label tone="subheading">{home.quizDemoPrompt.replace("$\\int_0^1 2x\\,dx$", "∫₀¹ 2x dx")}</Label>
    {landingQuizOptions.map((option) => <Action
      key={option.id}
      id={`landing-quiz-option-${option.id}`}
      onPress={() => setPicked(option)}
      selected={picked?.id === option.id}
      disabled={picked !== null}
      variant={picked === option && !option.correct ? "destructive" : picked && option.correct ? "default" : "outline"}
    >{`${option.id.toUpperCase()}. ${option.text}`}</Action>)}
    {picked && <View style={layout.item}>
      <Label tone={picked.correct ? "subheading" : "error"} live="polite">{picked.correct ? home.quizCorrect.replace(/!$/, "") : home.quizWhyWrong}</Label>
      {!picked.correct && <>
        <Label>{home.quizMisconception}</Label>
        <Label>{`1. ${home.quizWorkedStep1.replace("$2x$", "2x").replace("$x^2$", "x²")}`}</Label>
        <Label>{`2. ${home.quizWorkedStep2} [x²]₀¹ = 1 − 0 = 1.`}</Label>
        <Label tone="muted">{`${home.quizReview} · ${home.quizReviewChapter}`}</Label>
      </>}
      {picked.correct && <Label>∫₀¹ 2x dx = [x²]₀¹ = 1² − 0² = 1.</Label>}
      <View style={layout.row}><Action id="landing-quiz-reset" onPress={() => setPicked(null)} variant="link">{home.quizTryAgain}</Action></View>
    </View>}
  </Frame>;
}

function Tutor() {
  const { copy: { home }, locale, colors } = usePublic();
  const [shown, setShown] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean>();
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    }).catch(() => {
      if (mounted) setReducedMotion(false);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const messages = [
    { body: home.tutorQuestion1 },
    { body: home.tutorAnswer1.replace("$y$", "y").replace("$V = 2\\pi\\int_a^b x\\,f(x)\\,dx$", "V = 2π ∫ₐᵇ x f(x) dx"), sources: [home.tutorSourceRevolution, home.tutorSourceQuiz] },
    { body: home.tutorQuestion2 },
    { body: home.tutorAnswer2, sources: [home.tutorSourceMethod] },
  ];
  const done = shown === messages.length;
  useEffect(() => {
    if (!playing || done) return;
    const timer = setTimeout(() => setShown((count) => count + 1), shown % 2 ? 1600 : 700);
    return () => clearTimeout(timer);
  }, [done, playing, shown]);
  return <Frame title={home.tutorFrameTitle}>
    {messages.slice(0, shown).map(({ body, sources }) => <View key={body} style={[
      styles.bubble,
      sources ? { backgroundColor: colors.muted + "65" } : { alignSelf: "flex-end", backgroundColor: colors.primary },
    ]}>
      <Label style={sources ? undefined : { color: colors.primaryForeground }} live="polite">{body}</Label>
      {sources && <>
        <Label tone="meta">{home.sourceLabel}</Label>
        {sources.map((source) => <Label key={source} tone="muted">{source}</Label>)}
      </>}
    </View>)}
    {playing && !done && shown % 2 === 1 && <Label tone="muted" live="polite">{home.tutorTyping}</Label>}
    <View style={layout.row}><Action
      id="landing-tutor-play"
      disabled={reducedMotion === undefined || (done ? reducedMotion : playing)}
      onPress={() => {
        setShown(reducedMotion ? messages.length : 1);
        setPlaying(true);
      }}
    >{done ? home.replay : locale === "id" ? "Putar percakapan" : "Play conversation"}</Action></View>
  </Frame>;
}

const flashcards = [
  {
    front: { id: "Turunan dari sin x?", en: "Derivative of sin x?" },
    back: "cos x",
    note: { id: "Ingat siklusnya", en: "Remember the cycle" },
    cycle: "sin → cos → −sin → −cos",
  },
  {
    front: { id: "Aturan rantai · (f ∘ g)′(x) = ?", en: "Chain rule · (f ∘ g)′(x) = ?" },
    back: "f′(g(x)) · g′(x)",
    note: { id: "Turunkan fungsi luar, lalu kalikan turunan fungsi dalam.", en: "Differentiate the outer function, then multiply by the derivative of the inner function." },
  },
];

function Flashcards() {
  const { copy: { home }, locale, colors } = usePublic();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grade, setGrade] = useState<(typeof landingFlashcardGrades)[number] | null>(null);
  const card = flashcards[index];
  const counter = textWith(home.flashcardCounter, { current: index + 1, total: flashcards.length });
  const flip = locale === "id" ? "Balik kartu" : "Flip card";
  return <Frame title={home.flashcardsFrameTitle}>
    <Label tone="muted" live="polite">{counter}</Label>
    <RowLink id="landing-flashcards-flip" role="button" onPress={() => setFlipped((current) => !current)} active={flipped}
      label={`${flip}. ${flipped ? card.back : card.front[locale]}`}
      style={{ ...styles.flashcard, borderColor: flipped ? colors.primary : colors.border }}>
      <Label>{flipped ? card.back : card.front[locale]}</Label>
      {!flipped && <Label tone="meta">{flip}</Label>}
    </RowLink>
    {flipped ? <>
      <Label>{card.note[locale]}</Label>
      {card.cycle && <Label>{card.cycle}</Label>}
      <View style={layout.row}>
        {landingFlashcardGrades.map((item) => <Action key={item.key} id={`landing-flashcards-grade-${item.key}`} onPress={() => {
          setGrade(item);
          setFlipped(false);
          setIndex((current) => (current + 1) % flashcards.length);
        }}>{home.flashcardGrades[item.key]}</Action>)}
      </View>
    </> : null}
    {grade && <Label tone="muted" live="polite">
      {`${home.flashcardGrades[grade.key]} → ${grade.delay === 0 ? home.flashcardToday : textWith(home.flashcardLater, { days: grade.delay })}`}
    </Label>}
  </Frame>;
}

const englishTopics: Record<string, string> = {
  Turunan: "Derivatives",
  "Aturan Rantai": "Chain rule",
  Integral: "Integrals",
  "Integral Parsial": "Integration by parts",
  "Volume Benda Putar": "Solids of revolution",
};

function MasteryPath() {
  const { copy: { home }, locale, colors } = usePublic();
  const [profile, setProfile] = useState(landingPathProfiles[0]);
  const topicName = (name: string) => locale === "en" ? englishTopics[name] ?? name : name;
  return <Frame>
    <View style={layout.row} accessibilityLabel={home.path.profileLabel}>
      {landingPathProfiles.map((entry) => <Action key={entry.id} id={`landing-path-profile-${entry.id}`}
        selected={profile.id === entry.id} variant={profile.id === entry.id ? "default" : "outline"}
        onPress={() => setProfile(entry)}>{home.path[entry.labelKey]}</Action>)}
    </View>
    <View style={styles.nodes}>
      {profile.nodes.map(({ name, status, score, lockedNote }) => <View key={name} style={[styles.node, { borderColor: colors.border }]}>
        <Label>{topicName(name)}</Label>
        <Label tone="muted" live="polite">{home.path.status[status]}{score !== undefined ? ` · ${score}%` : ""}</Label>
        {score !== undefined && <View style={[styles.bar, { backgroundColor: colors.muted }]} importantForAccessibility="no">
          <View style={[styles.bar, { width: `${score}%`, backgroundColor: colors.primary }]} />
        </View>}
        {lockedNote && <Label tone="meta">{textWith(home.path.lockedNote, { topic: topicName(lockedNote) })}</Label>}
      </View>)}
    </View>
  </Frame>;
}

export function LandingLearningSections() {
  const { copy: { home } } = usePublic();
  return <>
    <LearningSection title={home.quizTitle} description={home.quizDescription} href="/demo/quiz"><Quiz /></LearningSection>
    <LearningSection title={home.tutorTitle} description={home.tutorDescription} note={home.tutorCaveat} href="/demo/zyra" reverse><Tutor /></LearningSection>
    <LearningSection title={home.flashcardsTitle} description={home.flashcardsDescription} href="/demo/flashcards"><Flashcards /></LearningSection>
    <LearningSection title={home.pathTitle} href="/demo/path"><MasteryPath /></LearningSection>
  </>;
}

const styles = StyleSheet.create({
  columns: { flexDirection: "row", alignItems: "center", gap: 32 },
  reverse: { flexDirection: "row-reverse", alignItems: "center", gap: 32 },
  column: { flex: 1, minWidth: 0 },
  bubble: { alignSelf: "flex-start", maxWidth: "90%", borderRadius: nativeRadii.md, padding: 12, gap: 4 },
  flashcard: { minHeight: 100, padding: 12, borderWidth: 1, borderRadius: nativeRadii.md, gap: 4 },
  nodes: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  node: { flexGrow: 1, flexBasis: 128, borderWidth: StyleSheet.hairlineWidth, borderRadius: nativeRadii.md, padding: 8, gap: 4 },
  bar: { height: 4, borderRadius: 2 },
});
