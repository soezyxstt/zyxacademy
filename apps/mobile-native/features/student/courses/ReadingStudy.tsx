import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { mergeArticleSectionProgress, type ArticleProgressUpdate } from "../../../../../lib/articles/progress-contract";
import type { FormativeLearnerResponse } from "../../../../../lib/materials/formative-evaluation";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { ReadingContentDocument } from "../../../offline/ReadingDocument";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { CourseMarkdown } from "../CourseMarkdown";
import type { StudentRequest, StudentSession } from "../contracts";
import { OnlineReadingError, type OnlineReadingContent } from "./online-reading";
import { readingLearning, readingStudySections, resumeReadingSection, type CheckResult, type ReadProgress, type StudyBlock, type StudySection } from "./reading-learning";

type Theme = keyof typeof nativeColors;
type Study = ReturnType<typeof readingLearning>;
type Props = { content: OnlineReadingContent; courseId: string; request: StudentRequest; session: StudentSession;
  theme: Theme; onCompleted(): void; reload(): void };

const toolbar = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 };
const stale = (error: unknown) => error instanceof OnlineReadingError && [401, 403, 404, 409].includes(error.status);
type Visit = { id: string; start: number; percent: number; autoCompleted: boolean };

function takeVisit(visit: Visit) {
  const now = Date.now();
  const elapsed = Math.min(3_600, Math.max(0, Math.floor((now - visit.start) / 1000)));
  visit.start = now;
  return elapsed;
}

export function ReadingStudy({ content, courseId, request, session, theme, onCompleted, reload }: Props) {
  const { canInteract } = useProtectedInteraction();
  const study = useMemo(() => readingLearning(request, courseId, content), [request, courseId, content]);
  const sections = useMemo(() => readingStudySections(content), [content]);
  const [selected, setSelected] = useState<string>();
  const [progress, setProgress] = useState<ReadProgress>();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<"unavailable" | "stale">();
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<StudyBlock>();
  const pending = useRef<AbortController | null>(null);
  const visit = useRef<Visit | undefined>(undefined);
  const locale = content.locale;
  const id = locale === "id";
  const colors = nativeColors[theme];
  const active = sections.find(section => section.id === selected) ?? sections.find(section => section.slug === content.section) ?? sections[0];
  const sectionProgress = progress && "sectionProgress" in progress ? progress.sectionProgress : {};
  const completed = progress && ("status" in progress ? progress.status === "completed"
    : sections.length > 0 && sections.every(section => sectionProgress[section.id]?.completed));
  const completionReported = useRef(false);
  const checks = active?.checks ?? [];
  const selectedContent = useMemo(() => active ? { ...content, section: active.slug } : content, [active, content]);

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    void study.progress(controller.signal).then(value => {
      if (controller.signal.aborted || !canInteract()) return;
      setProgress(value);
      setSelected(previous => previous ?? resumeReadingSection(value, sections, content.section)?.id);
      if ("status" in value && value.status === "unopened") {
        // An explicit completion can race this first-open write. The server keeps
        // completed statuses monotonic in either ordering.
        void study.setStatus("in_progress", controller.signal).catch(() => {});
      }
    }, failure => {
      if (!controller.signal.aborted) setError(stale(failure) ? "stale" : "unavailable");
    });
    return () => controller.abort();
  }, [study, attempt, canInteract, content.section, sections]);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (!completed || completionReported.current) return;
    completionReported.current = true;
    onCompleted();
  }, [completed, onCompleted]);

  function received(receipt: Awaited<ReturnType<Study["save"]>>) {
    setProgress(previous => previous && "sectionProgress" in previous ? {
      ...previous, sectionProgress: { ...previous.sectionProgress,
        [receipt.sectionId]: mergeArticleSectionProgress(previous.sectionProgress[receipt.sectionId], receipt),
      },
    } : previous);
  }

  useEffect(() => {
    if (!active || !progress || !("sectionProgress" in progress) || !canInteract()) return;
    const current: Visit = { id: active.id, start: Date.now(), percent: 0, autoCompleted: false };
    visit.current = current;
    return () => {
      if (visit.current === current) visit.current = undefined;
      if (!canInteract() || Date.now() - current.start < 2_000) return;
      const timeSpentSeconds = takeVisit(current);
      // A lost response does not replay elapsed time. Explicit completion
      // remains idempotent and can be retried without reusing those seconds.
      void study.save({ sectionId: current.id, percent: Math.min(89, current.percent), timeSpentSeconds }).catch(() => {});
    };
    // Visit timers depend on the scope and selected section, not receipt renders.
  }, [active?.id, Boolean(progress), canInteract, study]);

  async function complete(ids?: string[]) {
    if (!progress || completed || pending.current || !canInteract()) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(undefined);
    try {
      if ("status" in progress) {
        await study.setStatus("completed", controller.signal);
        if (!controller.signal.aborted && canInteract()) setProgress({ ...progress, status: "completed" });
      } else {
        for (const section of sections) {
          if (controller.signal.aborted || !canInteract()) return;
          if (progress.sectionProgress[section.id]?.completed || (ids && !ids.includes(section.id))) continue;
          const current = visit.current;
          const receipt = await study.save({ sectionId: section.id, percent: 100, completed: true,
            timeSpentSeconds: current?.id === section.id ? takeVisit(current) : 0 }, controller.signal);
          if (!controller.signal.aborted && canInteract()) received(receipt);
        }
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(stale(failure) ? "stale" : "unavailable");
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function scroll(percent: number) {
    const current = visit.current;
    if (!current || !canInteract() || error || check) return;
    current.percent = Math.max(current.percent, percent);
    if (percent >= 90 && !current.autoCompleted && Date.now() - current.start >= 2_000 &&
      !sectionProgress[current.id]?.completed && !pending.current) {
      current.autoCompleted = true;
      void complete([current.id]);
    }
  }

  const page = active ? sections.indexOf(active) : -1;
  function select(section: StudySection | undefined) {
    if (section && !busy && canInteract()) setSelected(section.id);
  }
  return <>
    {sections.length > 1 && <View style={{ ...toolbar, justifyContent: "space-between", alignItems: "center", padding: 8 }}>
      <Button theme={theme} variant="outline" disabled={busy || page <= 0} onPress={() => select(sections[page - 1])}>{id ? "Bagian sebelumnya" : "Previous section"}</Button>
      <Text style={{ color: colors.mutedForeground }}>{page + 1} / {sections.length}</Text>
      <Button theme={theme} variant="outline" disabled={busy || page >= sections.length - 1}
        onPress={() => select(sections[page + 1])}>{id ? "Bagian berikutnya" : "Next section"}</Button>
    </View>}
    {error !== "stale" ? <ReadingContentDocument key={active?.id ?? content.data.id} content={selectedContent}
      testID="student-online-reading-document" onProgress={active ? scroll : undefined} /> : <View style={{ flex: 1 }} />}
    <View style={{ gap: 6, padding: 8, borderTopWidth: 1, borderColor: colors.border }}>
      {error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error === "stale"
        ? id ? "Bacaan atau akses berubah. Muat ulang." : "The reading or access changed. Reload."
        : id ? "Progres belum dapat dipastikan." : "Reading progress could not be confirmed."}</Text>}
      <View style={toolbar}>
        {error === "stale" ? <Button theme={theme} onPress={reload}>{id ? "Muat ulang bacaan" : "Reload reading"}</Button> : <>
          {error && !progress ? <Button theme={theme} variant="outline" onPress={() => setAttempt(value => value + 1)}>{id ? "Periksa progres" : "Check progress"}</Button> : null}
          {checks.length > 0 && <Button theme={theme} variant="outline" disabled={busy} onPress={() => setCheck(checks[0])}>
            {id ? "Cek pemahaman" : "Check understanding"}
          </Button>}
          {progress && <Button theme={theme} variant="outline" isLoading={busy} disabled={Boolean(completed)}
            testID="student-reading-mark-complete" onPress={() => void complete()}>
            {completed ? id ? "Selesai dibaca" : "Reading complete" : id ? "Tandai selesai" : "Mark complete"}
          </Button>}
        </>}
      </View>
    </View>
    {active && <Modal visible={Boolean(check)} onRequestClose={() => setCheck(undefined)} animationType="none">
      {check && <ReadingCheck key={check.id} block={check} blocks={checks} study={study} locale={locale}
        sectionId={active.id} select={setCheck} close={() => setCheck(undefined)} theme={theme} session={session} />}
    </Modal>}
  </>;
}

function ReadingCheck({ block, blocks, sectionId, study, session, locale, theme, select, close }: {
  block: StudyBlock; blocks: StudyBlock[]; sectionId: string; study: Study; theme: Theme;
  session: StudentSession; locale: "id" | "en"; select(block: StudyBlock): void; close(): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const [choice, setChoice] = useState<string>();
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(0);
  const [result, setResult] = useState<CheckResult>();
  const [reveal, setReveal] = useState<{ answer: string; explanation: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<boolean | "stale">(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const check = block.formativeCheck;
  if (!check) return null;
  const id = locale === "id";
  const colors = nativeColors[theme];
  const text = answer.trim();
  const response: FormativeLearnerResponse | undefined = check.checkKind === "multiple_choice" ? choice ? { kind: "choice", optionId: choice } : undefined
    : text ? check.checkKind === "short_answer" ? { kind: "text", text }
      : check.checkKind === "numeric_answer" ? { kind: "numeric", value: text } : { kind: "conceptual", text } : undefined;
  const markdown = (source: string) => <CourseMarkdown allowLinks={false} source={source} theme={theme} services={{ session }} />;
  const report = async (operation: "evaluate" | "reveal") => {
    if (!canInteract() || pending.current || error === "stale" || (operation === "evaluate" && !response)) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(false);
    try {
      if (operation === "evaluate" && response) {
        const result = await study.evaluate(sectionId, block.id, response, controller.signal);
        if (!controller.signal.aborted && canInteract()) { setResult(result.result); setReveal(undefined); }
      } else {
        const result = await study.reveal(sectionId, block.id, controller.signal);
        if (!controller.signal.aborted && canInteract()) setReveal(result);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(stale(failure) ? "stale" : true);
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  const hints = check.feedbackPolicy?.hints ?? [];
  const locked = busy || Boolean(result) || error === "stale";
  const index = blocks.indexOf(block);
  const verdicts = id ? { correct: "Benar", partial: "Sebagian benar", incorrect: "Belum tepat", ungradable: "Perlu diperiksa" }
    : { correct: "Correct", partial: "Partly correct", incorrect: "Incorrect", ungradable: "Needs review" };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={{ ...toolbar, alignItems: "center", padding: 12 }}>
      <Button theme={theme} variant="outline" onPress={close}>{id ? "Kembali" : "Back"}</Button>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16 }}>{id ? "Cek pemahaman" : "Check understanding"}</Text>
    </View>
    <ScrollView contentContainerStyle={{ gap: 8, padding: 12 }} keyboardShouldPersistTaps="handled">
      {block.title ? <Text style={{ color: colors.foreground, fontWeight: "600" }}>{block.title}</Text> : null}
      {markdown(block.content)}
      {check.options?.map(option => <View key={option.id} style={toolbar}>
        <Button theme={theme} variant={choice === option.id ? "default" : "outline"} disabled={locked}
          accessibilityLabel={option.text} onPress={() => setChoice(option.id)}>{String.fromCharCode(65 + (check.options?.indexOf(option) ?? 0))}</Button>
        {markdown(option.text)}
      </View>)}
      {!check.options?.length && check.evaluationMode && <Input theme={theme} accessibilityLabel={id ? "Jawaban" : "Answer"}
        value={answer} onChangeText={setAnswer} editable={!locked} multiline={check.checkKind === "conceptual_explanation"}
        maxLength={check.checkKind === "numeric_answer" ? 200 : check.checkKind === "short_answer" ? 2000 : 6000} />}
      {check.unit && <Text style={{ color: colors.mutedForeground }}>{check.unit}</Text>}
      {hints.slice(0, hint).map((value, index) => <View key={index}>{markdown(value)}</View>)}
      {result && <>
        <Text accessibilityRole="header" style={{ color: colors.foreground }}>{verdicts[result.verdict]}</Text>
        {markdown(result.feedback)}
        {result.misconceptions?.map((value, index) => <View key={index}>{markdown(value)}</View>)}
      </>}
      {reveal && <>
        <Text accessibilityRole="header" style={{ color: colors.foreground }}>{id ? "Pembahasan" : "Explanation"}</Text>
        {markdown(reveal.answer)}
        {markdown(reveal.explanation)}
      </>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{error === "stale"
        ? id ? "Bacaan atau akses berubah." : "The reading or access changed."
        : id ? "Cek belum berhasil. Coba lagi." : "Could not check. Try again."}</Text>}
      <View style={toolbar}>
        {hint < hints.length && <Button theme={theme} variant="outline" disabled={busy} onPress={() => setHint(value => value + 1)}>
          {id ? "Petunjuk" : "Hint"}
        </Button>}
        {!result && check.evaluationMode && <Button theme={theme} disabled={!response || error === "stale"} isLoading={busy}
          testID="student-formative-submit" onPress={() => void report("evaluate")}>{id ? "Periksa jawaban" : "Check answer"}</Button>}
        {result?.canRetry && <Button theme={theme} variant="outline" disabled={busy} onPress={() => { setResult(undefined); setReveal(undefined); setError(false); }}>
          {id ? "Coba jawaban lain" : "Try another answer"}
        </Button>}
        {(!check.evaluationMode || result?.revealAllowed || !result) && <Button theme={theme} variant="outline" disabled={busy || error === "stale"}
          onPress={() => reveal ? setReveal(undefined) : void report("reveal")}>{reveal ? id ? "Sembunyikan pembahasan" : "Hide explanation"
            : id ? "Lihat pembahasan" : "Show explanation"}</Button>}
      </View>
      {blocks.length > 1 && <View style={toolbar}>
        <Button theme={theme} variant="outline" disabled={busy || index === 0} onPress={() => select(blocks[index - 1])}>{id ? "Cek sebelumnya" : "Previous check"}</Button>
        <Button theme={theme} variant="outline" disabled={busy || index >= blocks.length - 1}
          onPress={() => select(blocks[index + 1])}>{id ? "Cek berikutnya" : "Next check"}</Button>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
