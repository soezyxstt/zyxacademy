import { useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../../components/Button";
import {
  evaluationAction, evaluationRead, questionRoute,
  type ActiveQuestion, type EvaluationRequest, type HistoricalQuestion, type QuestionBank,
} from "../../../../../packages/native-parity/operations/evaluation-contract";
import {
  HISTORICAL_CATEGORIES, QUESTION_DIFFICULTIES, QUESTION_PAGE_SIZES, historicalQueryUrl, historicalReviewActionFor,
  normalizeHistoricalQuery, normalizeQuestionQuery, questionParamsFromUrl, questionQueryUrl,
  toggleHistoricalQuestionEntries, toggleQuestionIds,
  type HistoricalSelectionItem, type QuestionQuery, type HistoricalQuestionQuery, type HistoricalReviewActionStatus,
} from "../../../../../packages/native-parity/operations/evaluation-question-query";
import { QuestionEditor, type EditAction } from "./QuestionEditor";
import { Choice, choices, Copy, Failure, Field, Heading, interpolate, language, Load, Row, Section, Source, strings, useRead, type Presentation } from "./ui";

type Query = QuestionQuery | HistoricalQuestionQuery;
const base = `https://local.invalid${questionRoute}`;
const statuses = ["reviewed", "published", "flagged", "retired"] as const;
const activeTypes = ["all", "multiple_choice", "multiple_choices", "short_answer", "essay"] as const;

export function QuestionsScreen({ request, presentation, navigate, initialSearch, importMarkdown }: {
  request: EvaluationRequest;
  presentation: Presentation;
  navigate: (href: string) => void;
  initialSearch: URLSearchParams;
  importMarkdown?: (signal: AbortSignal) => Promise<string | null>;
}) {
  const { theme, locale } = presentation;
  const { routes, questionBank: t, historicalQuestions: h } = strings(locale);
  const initial = questionParamsFromUrl(initialSearch);
  const [active, setActive] = useState(() => normalizeQuestionQuery(initial));
  const [historical, setHistorical] = useState(() => normalizeHistoricalQuery(initial));
  const [tab, setTab] = useState(() => normalizeQuestionQuery(initial).tab);
  const [search, setSearch] = useState(() => tab === "historical" ? historical.search : active.search);
  const [filters, setFilters] = useState(false);
  const [tools, setTools] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [historicalSelected, setHistoricalSelected] = useState(new Map<string, HistoricalSelectionItem>());
  const [editor, setEditor] = useState<{ action: EditAction; courses: QuestionBank["authoringCourses"] }>();
  const [deleting, setDeleting] = useState<ActiveQuestion>();
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState<string>();
  const [updating, setUpdating] = useState(false);
  const busy = useRef(false);
  const isHistorical = tab === "historical";
  const href = isHistorical ? historicalQueryUrl(base, { ...historical, tab }) : questionQueryUrl(base, { ...active, tab });
  const result = useRead<QuestionBank>(request, evaluationRead(href));

  function clearSelection() {
    setSelected(new Set());
    setHistoricalSelected(new Map());
  }

  function switchTab(next: Query["tab"]) {
    if (busy.current || next === tab) return;
    setSearch(next === "historical" ? historical.search : active.search);
    clearSelection();
    setError(undefined);
    setNotice(undefined);
    setTab(next);
  }

  function setActiveFilters(change: Partial<QuestionQuery>) {
    if (busy.current) return;
    clearSelection();
    setActive((previous) => ({ ...previous, ...change, page: 1 }));
  }

  function setHistoricalFilters(change: Partial<HistoricalQuestionQuery>) {
    if (busy.current) return;
    clearSelection();
    setHistorical((previous) => ({ ...previous, ...change, page: 1 }));
  }

  function applySearch() {
    if (isHistorical) setHistoricalFilters({ search });
    else setActiveFilters({ search });
  }

  function go(page: number) {
    if (busy.current) return;
    if (isHistorical) setHistorical((previous) => ({ ...previous, page }));
    else setActive((previous) => ({ ...previous, page }));
  }

  async function run<T>(work: () => Promise<T>, apply: (outcome: T) => void) {
    if (busy.current) return;
    busy.current = true;
    setUpdating(true);
    setError(undefined);
    setNotice(undefined);
    try { apply(await work()); } catch (failure) { setError(failure); }
    finally { busy.current = false; setUpdating(false); }
  }

  function toggleAll() {
    if (isHistorical) return run(() => request<HistoricalSelectionItem[]>(evaluationRead(href, "selection")), (items) => {
      setHistoricalSelected((current) => toggleHistoricalQuestionEntries(current, items));
    });
    return run(() => request<string[]>(evaluationRead(href, "selection")), (ids) => {
      setSelected((current) => toggleQuestionIds(current, ids));
    });
  }

  function updateStatus(ids: string[], next: typeof statuses[number]) {
    if (!ids.length) return;
    void run(() => request<{ updated: number }>(evaluationAction("questions"), { method: "PUT", body: { ids, reviewStatus: next } }), (response) => {
      setNotice(interpolate(t.updatedCount, { count: response.updated, status: t[next] }));
      clearSelection();
      result.retry();
    });
  }

  function remove() {
    if (!deleting) return;
    void run(() => request(evaluationAction("question", deleting.id), { method: "DELETE" }), () => {
      setDeleting(undefined);
      setNotice(t.questionDeleted);
      clearSelection();
      result.retry();
    });
  }

  if (editor) return <QuestionEditor action={editor.action} courses={editor.courses} request={request} presentation={presentation} importMarkdown={importMarkdown} onClose={() => setEditor(undefined)} onSaved={(message) => {
    setNotice(message);
    setEditor(undefined);
    clearSelection();
    result.retry();
  }} />;

  if (deleting) return <>
    <Heading theme={theme}>{t.deleteQuestion}</Heading>
    <Source source={deleting.prompt} presentation={presentation} />
    <Copy theme={theme}>{t.deleteQuestionConfirm}</Copy>
    {error !== undefined && <Failure error={error} presentation={presentation} />}
    <Row>
      <Button theme={theme} variant="outline" disabled={updating} onPress={() => { setDeleting(undefined); setError(undefined); result.retry(); }}>{t.cancel}</Button>
      <Button theme={theme} variant="destructive" isLoading={updating} onPress={remove}>{t.confirmDelete}</Button>
    </Row>
  </>;

  return <>
    <Heading theme={theme}>{routes.questionBank}</Heading>
    <Row>
      <Button theme={theme} variant={isHistorical ? "ghost" : "default"} accessibilityRole="tab" accessibilityState={{ selected: !isHistorical }} onPress={() => switchTab("ai-generated")}>{routes.activeQuestions}</Button>
      <Button theme={theme} variant={isHistorical ? "default" : "ghost"} accessibilityRole="tab" accessibilityState={{ selected: isHistorical }} onPress={() => switchTab("historical")}>{routes.historicalQuestions}</Button>
      <Button theme={theme} variant="outline" accessibilityState={{ expanded: tools }} onPress={() => setTools(!tools)}>{routes.questionTools}</Button>
    </Row>
    {tools && <Row>
      <Button theme={theme} variant="ghost" onPress={() => navigate("/admin/jobs")}>{routes.generationJobs}</Button>
      <Button theme={theme} variant="ghost" onPress={() => navigate("/admin/distractors")}>{routes.distractors}</Button>
    </Row>}
    <Field theme={theme} label={language(locale, "Cari soal", "Search questions")} placeholder={isHistorical ? h.search : t.search} value={search} onChangeText={setSearch} returnKeyType="search" onSubmitEditing={applySearch} />
    <Row>
      <Button theme={theme} variant="outline" onPress={applySearch}>{language(locale, "Cari", "Search")}</Button>
      <Button theme={theme} variant="outline" accessibilityState={{ expanded: filters }} onPress={() => setFilters(!filters)}>{t.filter}</Button>
    </Row>
    {notice && <View accessibilityLiveRegion="polite"><Copy theme={theme}>{notice}</Copy></View>}
    {error !== undefined && <Failure error={error} presentation={presentation} />}
    <Load resource={result} presentation={presentation}>{(bank) => {
      const query = isHistorical ? bank.historicalQuery : bank.query;
      const total = isHistorical ? bank.historicalTotal : bank.total;
      const maxPage = Math.max(1, Math.ceil(total / Number(query.pageSize)));
      const selectionCount = isHistorical ? historicalSelected.size : selected.size;
      return <>
        {filters && <Section theme={theme}>
          <Choice theme={theme} label={t.filterCourse} value={query.course} options={[{ value: "all", label: t.allCourses }, ...choices(bank.courses)]} onChange={(course) => isHistorical ? setHistoricalFilters({ course }) : setActiveFilters({ course })} />
          <Choice theme={theme} label={t.filterDifficulty} value={query.difficulty} options={QUESTION_DIFFICULTIES.map((value) => ({ value, label: value === "all" ? t.allDifficulties : t[value] }))} onChange={(difficulty) => isHistorical ? setHistoricalFilters({ difficulty }) : setActiveFilters({ difficulty })} />
          {isHistorical ? <Choice theme={theme} label={h.filterCategory} value={bank.historicalQuery.category} options={HISTORICAL_CATEGORIES.map((value) => ({ value, label: value === "all" ? h.allCategories : h.category[value] }))} onChange={(category) => setHistoricalFilters({ category })} /> : <>
            <Choice theme={theme} label={t.filterStatus} value={bank.query.status} options={["all", "generated", ...statuses].map((value) => ({ value: value as QuestionQuery["status"], label: value === "all" ? t.allStatuses : t[value as typeof statuses[number] | "generated"] }))} onChange={(status) => setActiveFilters({ status })} />
            <Choice theme={theme} label={t.filterOrigin} value={bank.query.origin} options={[{ value: "all", label: t.allOrigins }, { value: "zyx_original", label: t.zyxOriginal }, { value: "itb_example", label: t.itbExample }]} onChange={(origin) => setActiveFilters({ origin })} />
            <Choice theme={theme} label={t.filterType} value={bank.query.type} options={activeTypes.map((value, index) => ({ value, label: [t.allQuestionTypes, t.multipleChoice, t.multipleChoices, t.shortAnswer, t.essay][index] }))} onChange={(type) => setActiveFilters({ type })} />
          </>}
          <Row><Button theme={theme} variant="ghost" onPress={() => {
            if (busy.current) return;
            clearSelection();
            setSearch("");
            if (isHistorical) setHistorical(normalizeHistoricalQuery({ tab: "historical" }));
            else setActive(normalizeQuestionQuery({}));
          }}>{t.reset}</Button></Row>
        </Section>}
        {!isHistorical && <Row>
          <Button theme={theme} onPress={() => setEditor({ action: { kind: "create" }, courses: bank.authoringCourses })}>{t.addQuestion}</Button>
          <Button theme={theme} variant="outline" onPress={() => setEditor({ action: { kind: "import" }, courses: bank.authoringCourses })}>{t.importMarkdown}</Button>
        </Row>}
        {total > 0 && <Row>
          <Button theme={theme} variant="ghost" disabled={updating} onPress={() => void toggleAll()}>{isHistorical ? h.selectAllReviewable : t.selectAllQuestions}</Button>
          {selectionCount > 0 && <>
            <Copy theme={theme}>{selectionCount}</Copy>
            <Button theme={theme} variant="ghost" disabled={updating} onPress={clearSelection}>{t.clearAllSelection}</Button>
            {statuses.map((status) => {
              const ids = isHistorical ? [...historicalSelected.values()].filter((item) => historicalReviewActionFor(item) === status).map((item) => item.id) : [...selected];
              return ids.length > 0 && <Button key={status} theme={theme} variant="outline" disabled={updating} onPress={() => updateStatus(ids, status)}>{t[status]}</Button>;
            })}
          </>}
        </Row>}
        {total === 0 && <Copy theme={theme} tone="muted">{isHistorical ? h.empty : t.empty}</Copy>}
        {isHistorical
          ? bank.historicalQuestions.map((question) => <HistoricalRow key={question.id} question={question} course={question.courseId ? bank.courseMap[question.courseId] ?? question.courseId : ""} presentation={presentation} selected={historicalSelected.has(question.id)} busy={updating} toggle={() => setHistoricalSelected((current) => toggleHistoricalQuestionEntries(current, [question]))} review={(next) => updateStatus([question.id], next)} />)
          : bank.questions.map((question) => <ActiveRow key={question.id} question={question} course={bank.courseMap[question.courseId] ?? question.courseId} presentation={presentation} selected={selected.has(question.id)} busy={updating} toggle={() => setSelected((current) => toggleQuestionIds(current, [question.id]))} edit={() => setEditor({
            action: { kind: "edit", question: { ...question, courseId: bank.canonicalCourseMap[question.courseId] ?? question.courseId } },
            courses: bank.authoringCourses,
          })} remove={() => { setError(undefined); setDeleting(question); }} />)}
        {total > 0 && <Row>
          <Choice theme={theme} label={t.pageSize} options={QUESTION_PAGE_SIZES.map((value) => ({ value, label: value }))} value={query.pageSize} onChange={(pageSize) => isHistorical ? setHistoricalFilters({ pageSize }) : setActiveFilters({ pageSize })} />
          <Button theme={theme} variant="outline" disabled={query.page === 1 || updating} onPress={() => go(query.page - 1)}>{t.previousPage}</Button>
          <Copy theme={theme}>{query.page}/{maxPage}</Copy>
          <Button theme={theme} variant="outline" disabled={query.page >= maxPage || updating} onPress={() => go(query.page + 1)}>{t.nextPage}</Button>
        </Row>}
      </>;
    }}</Load>
  </>;
}

function ActiveRow({ question, course, presentation, selected, busy, toggle, edit, remove }: {
  question: ActiveQuestion;
  course: string;
  presentation: Presentation;
  selected: boolean;
  busy: boolean;
  toggle: () => void;
  edit: () => void;
  remove: () => void;
}) {
  const { theme, locale } = presentation;
  const { questionBank: t } = strings(locale);
  const [expanded, setExpanded] = useState(false);
  const type = { multiple_choice: t.multipleChoice, multiple_choices: t.multipleChoices, short_answer: t.shortAnswer, essay: t.essay }[question.questionType];
  const canEdit = question.origin !== "historical_reference";
  return <Section theme={theme}>
    <Source source={question.prompt} presentation={presentation} />
    <Copy theme={theme} tone="muted">{course} · {t[question.difficulty]} · {type} · {t[question.reviewStatus]}</Copy>
    <Copy theme={theme} tone="muted">{question.ideaLinks.length} {language(locale, "ide terkait", "linked ideas")} · {question.useCount} {language(locale, "kali digunakan", "uses")}</Copy>
    <Row>
      {canEdit && <Button theme={theme} variant={selected ? "default" : "outline"} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={toggle}>{language(locale, "Pilih soal", "Select question")}</Button>}
      <Button theme={theme} variant="ghost" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>{expanded ? t.close : language(locale, "Lihat detail", "View details")}</Button>
    </Row>
    {expanded && <>
      {question.sourceEventName && <Copy theme={theme} tone="muted">{question.sourceEventName}</Copy>}
      {Array.isArray(question.tags) && question.tags.length > 0 && <Copy theme={theme} tone="muted">{question.tags.join(" · ")}</Copy>}
      {Array.isArray(question.options) && question.options.map((item, index) => <Row key={index}>
        <Copy theme={theme} tone="strong">{question.correctIndices.includes(index) ? "✓" : String.fromCharCode(65 + index)}</Copy>
        <Source source={item} presentation={presentation} />
      </Row>)}
      {Array.isArray(question.acceptableAnswers) && question.acceptableAnswers.length > 0 && <Copy theme={theme}>{t.acceptedAnswerTitle} · {question.acceptableAnswers.join(", ")}</Copy>}
      {question.explanation && <Source source={question.explanation} kind="markdown" presentation={presentation} />}
      {canEdit && <Row>
        <Button theme={theme} variant="outline" disabled={busy} onPress={edit}>{t.editQuestionAnswerKey}</Button>
        <Button theme={theme} variant="destructive" disabled={busy} onPress={remove}>{t.deleteQuestion}</Button>
      </Row>}
    </>}
  </Section>;
}

function HistoricalRow({ question, course, presentation, selected, busy, toggle, review }: {
  question: HistoricalQuestion;
  course: string;
  presentation: Presentation;
  selected: boolean;
  busy: boolean;
  toggle: () => void;
  review: (status: HistoricalReviewActionStatus) => void;
}) {
  const { theme, locale } = presentation;
  const { historicalQuestions: t } = strings(locale);
  const [expanded, setExpanded] = useState(false);
  const action = historicalReviewActionFor(question);
  const options = Array.isArray(question.options) ? question.options as unknown[] : [];
  const labels = { reviewed: t.markReviewed, published: t.publish, flagged: t.needsAttention };
  return <Section theme={theme}>
    <Copy theme={theme} tone="muted">{[course, question.sourceTitle, question.sourceYear].filter(Boolean).join(" · ")}</Copy>
    <Source source={question.questionMarkdown} kind="markdown" presentation={presentation} />
    <Copy theme={theme} tone="muted">{t.status[question.reviewStatus]} · {question.quizEligible ? t.quizEligible : t.referenceOnly}</Copy>
    <Row>
      {action && <Button theme={theme} variant={selected ? "default" : "outline"} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={toggle}>{language(locale, "Pilih soal", "Select question")}</Button>}
      <Button theme={theme} variant="ghost" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>{expanded ? t.hideDetails : t.viewDetails}</Button>
    </Row>
    {expanded && <>
      <Copy theme={theme} tone="muted">{[question.sourceQuestionNumber, question.sourceQuestionPart, question.sourcePage ? interpolate(t.pageNumber, { page: question.sourcePage }) : undefined].filter(Boolean).join(" · ")}</Copy>
      {options.map((option, index) => {
        const source = typeof option === "string" ? option : option && typeof option === "object" && "text" in option && typeof option.text === "string" ? option.text : null;
        return source && <Row key={index}><Copy theme={theme}>{String.fromCharCode(65 + index)}{option && typeof option === "object" && "isCorrect" in option && option.isCorrect === true ? " ✓" : ""}</Copy><View style={{ flex: 1, minWidth: 0 }}><Source source={source} presentation={presentation} /></View></Row>;
      })}
      {question.answerMarkdown && <Source source={question.answerMarkdown} kind="markdown" presentation={presentation} />}
      {question.answerProvenance && <Copy theme={theme} tone="muted">{t.answerLabel} · {t.provenance[question.answerProvenance as keyof typeof t.provenance] ?? question.answerProvenance}</Copy>}
      {question.solutionProvenance && <Copy theme={theme} tone="muted">{t.solutionLabel} · {t.provenance[question.solutionProvenance as keyof typeof t.provenance] ?? question.solutionProvenance}</Copy>}
      {action && <Row><Button theme={theme} variant="outline" disabled={busy} onPress={() => review(action)}>{labels[action]}</Button></Row>}
    </>}
  </Section>;
}
