import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { formatIsoDate } from "../../../../../lib/date-utils";
import { scopedDemoMaterialId, scopedDemoReviewId } from "../../../../../lib/demo/session-overlay";
import { demoSelectionHref } from "../../../../../lib/demo/selection";
import { demoPageHref, type NativeDemoContentView, type PublicDemoContent, type PublicQuizResult } from "../../../../../packages/native-parity/operations/public-contract";
import { ReadMarkdown } from "./blog";
import { DemoMasteryView, DemoPathView, DemoProgressView, DemoTryoutListView } from "./demo-learning";
import { readNativeDemoProgress, recordNativeDemoProgress, recordNativeDemoQuizPage } from "./demo-progress-store";
import { Action, Divider, Label, layout, StatePanel, textWith, usePublic, usePublicResource } from "./ui";

type Cards = Extract<PublicDemoContent, { kind: "flashcards" }>;
type Quiz = Extract<PublicDemoContent, { kind: "quiz" | "quiz-list" | "quiz-start" }>;

function Flashcards({ data, href }: { data: Cards; href: string }) {
  const { copy: { demo }, colors, openExternal } = usePublic();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const { setId } = data;
  const grades = [demo.flashcards.grades.again, demo.flashcards.grades.hard, demo.flashcards.grades.good, demo.flashcards.grades.easy];
  function grade(setId: string, value: number) {
    recordNativeDemoProgress(data.courseId, data.revision, {
      kind: "review", id: scopedDemoReviewId(setId, data.offset, String(index)), grade: value, date: formatIsoDate(new Date()),
    });
    if (index + 1 < data.cards.length) setIndex(index + 1);
    setFlipped(false);
  }
  const card = data.cards[index];
  const total = data.cards.length;
  if (!card) return <StatePanel kind="empty" title={demo.flashcards.empty} />;
  return <View style={layout.section}>
    <Label tone="meta">{textWith(demo.flashcards.counter, { current: index + 1, total })}</Label>
    <View style={[layout.panel, { borderColor: colors.border }]}>
      <Label tone="subheading">{flipped ? demo.flashcards.answer : demo.flashcards.question}</Label>
      <ReadMarkdown markdown={flipped ? card.back : card.front} onLink={openExternal} />
      {flipped && card.explanation && <ReadMarkdown markdown={card.explanation} onLink={openExternal} />}
      <Action onPress={() => setFlipped(!flipped)}>{flipped ? demo.flashcards.flipBack : demo.flashcards.flip}</Action>
    </View>
    {flipped && setId && <View style={layout.row}>
      {grades.map((label, gradeIndex) => <Action key={label} onPress={() => grade(setId, gradeIndex + 1)}>{label}</Action>)}
    </View>}
    <View style={layout.row}>
      <Action disabled={index === 0} onPress={() => { setIndex(index - 1); setFlipped(false); }}>{demo.flashcards.previous}</Action>
      <Action disabled={index + 1 >= total} onPress={() => { setIndex(index + 1); setFlipped(false); }}>{demo.flashcards.next}</Action>
    </View>
    {(data.offset > 0 || data.nextOffset !== null) && <View style={layout.row}>
      {data.offset > 0 && <Action href={demoPageHref(href, "flashcardOffset", Math.max(0, data.offset - 100))}>{demo.products.previousPage}</Action>}
      {data.nextOffset !== null && <Action href={demoPageHref(href, "flashcardOffset", data.nextOffset)}>{demo.products.nextPage}</Action>}
    </View>}
  </View>;
}

function QuizPractice({ data, href, reload }: { data: Quiz; href: string; reload: () => void }) {
  const { client, copy: { demo }, colors, openExternal } = usePublic();
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [result, setResult] = useState<PublicQuizResult | null>(null);
  const [error, setError] = useState<"network" | "expired" | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const answered = data.questions.every(({ id }) => answers[id]?.length > 0);

  function select(question: Quiz["questions"][number], index: number) {
    setAnswers((current) => {
      const selected = current[question.id] ?? [];
      return { ...current, [question.id]: question.multiple
        ? selected.includes(index) ? selected.filter((item) => item !== index) : [...selected, index]
        : [index] };
    });
  }

  function submit() {
    if (request.current || !answered) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    void client.gradeDemoQuiz({
      courseId: data.courseId,
      questionIds: data.questions.map(({ id }) => id),
      quizOffset: data.offset,
      questionSetToken: data.token,
      answers: data.questions.map(({ id }) => answers[id]),
    }, controller.signal).then((graded) => {
      if (controller.signal.aborted) return;
      if (graded) {
        recordNativeDemoQuizPage(data.courseId, data.revision, {
          offset: data.offset, total: data.total, nextOffset: data.nextOffset, questionCount: data.questions.length,
        }, formatIsoDate(new Date()));
        setResult(graded);
      } else setError("expired");
    }, () => {
      if (!controller.signal.aborted) setError("network");
    }).finally(() => {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    });
  }

  if (data.questions.length === 0) return <StatePanel kind="empty" title={demo.quiz.empty} />;
  return <View style={layout.stack}>
    {data.questions.map((question, i) => <View key={question.id} style={[layout.panel, { borderColor: colors.border }]}>
      <ReadMarkdown markdown={question.prompt} onLink={openExternal} />
      {question.options.map((option, index) => {
        const selected = answers[question.id]?.includes(index);
        const correct = result?.results[i]?.correctIndices.includes(index);
        return <Action key={index} disabled={busy || Boolean(result)} selected={selected} variant={correct || selected ? "default" : "outline"}
          accessibilityLabel={correct ? `${option}, ${demo.quiz.correct}` : option}
          onPress={() => select(question, index)}>{option}</Action>;
      })}
      {result?.results[i] && <>
        <Label tone={result.results[i].isCorrect ? "link" : "error"}>{result.results[i].isCorrect ? demo.quiz.correct : demo.quiz.incorrect}</Label>
        {!!result.results[i].explanation && <ReadMarkdown markdown={result.results[i].explanation!} onLink={openExternal} />}
      </>}
    </View>)}
    {error && <StatePanel kind="error" title={demo.quiz.error} retry={error === "expired" ? reload : submit} />}
    {result ? <View style={layout.section}>
      <Label tone="subheading" live="polite">{textWith(demo.quiz.score, { score: result.score, total: result.total })}</Label>
      <View style={layout.row}>
        <Action onPress={() => { setAnswers({}); setResult(null); }}>{demo.quiz.retry}</Action>
        {data.nextOffset !== null && <Action href={demoPageHref(href, "quizOffset", data.nextOffset)}>{demo.products.nextPage}</Action>}
      </View>
    </View> : <Action disabled={!answered || error === "expired"} onPress={submit} loading={busy} variant="default">{demo.quiz.submit}</Action>}
    {data.previousOffset !== null && <Action href={demoPageHref(href, "quizOffset", data.previousOffset)}>{demo.products.previousPage}</Action>}
  </View>;
}

function CompleteMaterial({ data, completionId }: { data: { courseId: string; revision: string }; completionId: string }) {
  const { copy: { demo } } = usePublic();
  const { courseId, revision } = data;
  const hasCompleted = () => readNativeDemoProgress(courseId, revision).events.some(({ kind, id }) => kind === "article" && id === completionId);
  const [completed, setCompleted] = useState(hasCompleted);
  return completed ? <Label live="polite">{demo.session.completed}</Label>
    : <Action id="public-demo-complete-material" onPress={() => {
      recordNativeDemoProgress(courseId, revision, { kind: "article", id: completionId, date: formatIsoDate(new Date()) });
      setCompleted(hasCompleted());
    }}>{demo.session.markComplete}</Action>;
}

export function NativeDemoContent({ view, search }: { view: NativeDemoContentView; search: string }) {
  const { client, openExternal, renderArticle, origin, copy: { demo } } = usePublic();
  const { resource, retry } = usePublicResource(`${view}${search}`, client, (api, signal) => api.demoContent(view, search, signal));
  if (resource.status !== "ready") return <StatePanel kind={resource.status} retry={resource.status === "error" ? retry : undefined} />;
  if (!resource.value) return <StatePanel kind="empty" title={demo.emptyTitle} description={demo.emptyDescription} />;
  const data = resource.value;
  switch (data.kind) {
    case "progress": return <DemoProgressView key={`${data.baseline.courseId}:${data.baseline.revision}`} data={data} search={search} />;
    case "path": return <DemoPathView data={data} search={search} />;
    case "mastery": return <DemoMasteryView data={data} search={search} />;
    case "tryout-list": return <DemoTryoutListView data={data} search={search} />;
    case "overview":
      return <View style={layout.section}>
        {data.chapters.map((chapter) => <Label key={chapter.id}>{textWith(demo.chapter, { number: chapter.orderIndex, title: chapter.title })}</Label>)}
        <View style={layout.row}>
          <Action href={`/demo/documents${search}`}>{demo.products.choose}</Action>
          <Action href={`/demo/quiz-list${search}`}>{demo.session.assessments}</Action>
          <Action href={`/demo/progress${search}`}>{demo.views.progress}</Action>
          <Action href={`/demo/tryout-list${search}`}>{demo.views["tryout-list"]}</Action>
        </View>
      </View>;
    case "documents": {
      const params = new URLSearchParams(search);
      const course = params.get("course");
      return <View style={layout.section}>
        {data.documents.map((document) => {
          const selection = { collectionOffset: document.collectionOffset, [document.kind === "article" ? "articleId" : "diktatId"]: document.id };
          const target = course ? `/demo/${document.kind}?course=${encodeURIComponent(course)}` : `/demo/${document.kind}`;
          return <Action key={`${document.kind}-${document.id}`} href={demoSelectionHref(target, selection)}>{document.title}</Action>;
        })}
        {data.documents.length === 0 && <StatePanel kind="empty" title={demo.session.noDocuments} />}
      </View>;
    }
    case "article": {
      const completionId = scopedDemoMaterialId(data.kind, data.materialId);
      return <View style={layout.stack}>
        <Label tone="heading">{data.title}</Label>
        <Label tone="meta">{textWith(demo.article.readTime, { count: data.minutes })}</Label>
        {data.sections.map((section) => <View key={section.id} style={layout.section}>
          <Divider />
          <Label tone="subheading">{section.title}</Label>
          {!!section.objective && <Label tone="muted">{section.objective}</Label>}
          {section.blocks.map((block) => <View key={block.id} style={layout.item}>
            {!!block.title && <Label tone="subheading">{block.title}</Label>}
            {renderArticle ? renderArticle({ markdown: block.text, origin, onLink: openExternal }) : <ReadMarkdown markdown={block.text} onLink={openExternal} />}
          </View>)}
        </View>)}
        <CompleteMaterial key={completionId} data={data} completionId={completionId} />
      </View>;
    }
    case "diktat": {
      const completionId = scopedDemoMaterialId(data.kind, data.materialId);
      return <View style={layout.stack}>
        <Label tone="heading">{data.title}</Label>
        {data.sections.map((section, i) => <View key={i} style={layout.section}>
          <Divider /><Label tone="subheading">{section.title}</Label>
          <ReadMarkdown markdown={section.content} onLink={openExternal} />
        </View>)}
        {data.sections.length ? <CompleteMaterial key={completionId} data={data} completionId={completionId} /> : <StatePanel kind="empty" title={demo.diktat.empty} />}
      </View>;
    }
    case "flashcards": return <Flashcards data={data} href={`/demo/flashcards${search}`} />;
    case "quiz": return <QuizPractice data={data} href={`/demo/quiz${search}`} reload={retry} />;
    case "quiz-list":
    case "quiz-start":
      return data.total > 0 ? <View style={layout.section}>
        <Label>{demo.quiz.description}</Label>
        <Action href={`/demo/${data.kind === "quiz-list" ? "quiz-start" : "quiz"}${search}`} variant="default">{demo.session.openQuiz}</Action>
      </View> : <StatePanel kind="empty" title={demo.quiz.empty} />;
  }
}
