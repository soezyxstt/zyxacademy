import { useRef, useState } from "react";
import { Keyboard, View } from "react-native";
import { Button } from "../../../components/Button";
import type { CognitiveLevel, Difficulty, IdeaRole, QuestionAuthoringInput, QuestionIdeaLink, QuestionType } from "../../../../../lib/question-authoring-contract";
import {
  chapterOptions, evaluationAction, ideaOptions,
  type ActiveQuestion, type Chapter, type Course, type EvaluationRequest, type Idea, type MarkdownImportInput,
} from "../../../../../packages/native-parity/operations/evaluation-contract";
import {
  hasValidIdeaWeights, ideaWeightTotal, isValidIdeaWeight, parseIdeaWeightInput, rebalanceIdeaLinks,
} from "../../../../../packages/native-parity/operations/evaluation-idea-links";
import { Choice, choices, Copy, Failure, Field, Heading, httpStatus, interpolate, language, Load, Row, Section, strings, useRead, type Presentation } from "./ui";

export type EditAction = { kind: "create" | "import" } | { kind: "edit"; question: ActiveQuestion };
type SaveStatus = "generated" | "published";
const defaults = ["", "", "", ""];
const csv = (value: string) => value.split(",").map((part) => part.trim()).filter(Boolean);
const array = <T,>(value: T[]): T[] => Array.isArray(value) ? value : [];
const questionTypes = ["multiple_choice", "multiple_choices", "short_answer", "essay"] as const;
const levels = ["remember", "understand", "apply", "analyze", "evaluate", "create"] as const;

export function QuestionEditor({ action, courses, request, presentation, importMarkdown, onClose, onSaved }: {
  action: EditAction;
  courses: Course[];
  request: EvaluationRequest;
  presentation: Presentation;
  importMarkdown?: () => Promise<string | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const question = action.kind === "edit" ? action.question : undefined;
  const importing = action.kind === "import";
  const { theme, locale } = presentation;
  const t = strings(locale).questionBank;
  const [courseId, setCourseId] = useState(question?.courseId ?? courses[0]?.id ?? "");
  const [chapterId, setChapterId] = useState(question?.chapterId ?? "");
  const [ideaLinks, setIdeaLinks] = useState<QuestionIdeaLink[]>(question?.ideaLinks ?? []);
  const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
  const [ideasOpen, setIdeasOpen] = useState(ideaLinks.length > 0);
  const [prompt, setPrompt] = useState(question?.prompt ?? "");
  const [markdown, setMarkdown] = useState("");
  const [type, setType] = useState<QuestionType>(question?.questionType ?? "multiple_choice");
  const [difficulty, setDifficulty] = useState<Difficulty>(question?.difficulty ?? "medium");
  const [level, setLevel] = useState<CognitiveLevel>(question?.cognitiveLevel ?? "understand");
  const [reasoning, setReasoning] = useState(question?.reasoningPattern ?? "manual_authoring");
  const [options, setOptions] = useState(question?.options?.length ? array(question.options) : defaults);
  const [correct, setCorrect] = useState(question ? array(question.correctIndices) : [0]);
  const [answers, setAnswers] = useState(array(question?.acceptableAnswers ?? []).join(", "));
  const [explanation, setExplanation] = useState(question?.explanation ?? "");
  const [tags, setTags] = useState(array(question?.tags ?? []).join(", "));
  const [validation, setValidation] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);

  const chapters = useRead<Chapter[]>(request, courseId ? chapterOptions(courseId) : undefined);
  const ideas = useRead<Idea[]>(request, courseId && ideasOpen ? ideaOptions(courseId, chapterId) : undefined);
  const ideaWeightsReady = hasValidIdeaWeights(ideaLinks) && ideaLinks.every((link) => isValidIdeaWeight(link.weight));
  const isChoice = type === "multiple_choice" || type === "multiple_choices";

  async function save(reviewStatus: SaveStatus) {
    if (busy.current || uncertain) return;
    setValidation(undefined);
    setError(undefined);
    if (!courseId) return setValidation(t.chooseCourseFirst);
    if (!ideaWeightsReady) return setValidation(t.ideaWeightMustTotal);
    const scope = { courseId, chapterId: chapterId || null, ideaLinks, reviewStatus };
    let body: MarkdownImportInput | QuestionAuthoringInput;
    if (importing) {
      if (!markdown.trim()) return setValidation(t.markdownRequired);
      body = { ...scope, rawMarkdown: markdown };
    } else {
      if (!prompt.trim()) return setValidation(t.promptRequired);
      if (isChoice && (options.length < 2 || options.some((item) => !item.trim()))) return setValidation(t.allOptionsRequired);
      if (isChoice && !correct.length) return setValidation(t.selectCorrectOption);
      if (type === "multiple_choice" && correct.length !== 1) return setValidation(t.singleChoiceOneAnswer);
      if (type === "short_answer" && csv(answers).length === 0) return setValidation(t.acceptedAnswerRequired);
      body = {
        ...scope, prompt, explanation, difficulty, questionType: type, cognitiveLevel: level,
        reasoningPattern: reasoning.trim() || "manual_authoring", tags: csv(tags),
        acceptableAnswers: type === "short_answer" ? csv(answers) : [],
        options: isChoice ? options : [], correctIndices: isChoice ? correct : [],
      };
    }
    busy.current = true;
    setSubmitting(true);
    Keyboard.dismiss();
    const endpoint = importing ? evaluationAction("import-questions") : question ? evaluationAction("question", question.id) : evaluationAction("questions");
    try {
      await request(endpoint, { method: question ? "PUT" : "POST", body });
      onSaved(importing
        ? t.importSucceeded
        : question
          ? reviewStatus === "published" ? t.updatedPublished : t.draftChangesSaved
          : reviewStatus === "published" ? t.manualPublished : t.manualDraftSaved);
    } catch (failure) {
      const status = httpStatus(failure);
      if (status === undefined || status >= 500) setUncertain(true);
      setError(failure);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }

  // Native input events can arrive before React commits the disabled controls.
  function edit<Args extends unknown[]>(change: (...args: Args) => void) {
    return (...args: Args) => {
      if (!busy.current) change(...args);
    };
  }

  const dismissWeightError = () => {
    setValidation((message) => message === t.ideaWeightMustTotal ? undefined : message);
  };
  const clearIdeaLinks = () => {
    setIdeaLinks([]);
    setWeightDrafts({});
    dismissWeightError();
  };
  const toggleIdea = (id: string) => {
    setIdeaLinks((current) => rebalanceIdeaLinks(current, id, !current.some((link) => link.ideaId === id)));
    setWeightDrafts({});
    dismissWeightError();
  };
  const updateLink = (id: string, change: Partial<QuestionIdeaLink>) => setIdeaLinks((current) =>
    current.map((link) => link.ideaId === id ? { ...link, ...change } : link));
  const roles: { value: IdeaRole; label: string }[] = [
    { value: "primary", label: t.rolePrimary }, { value: "supporting", label: t.roleSupporting }, { value: "required", label: t.roleRequired },
  ];
  const typeLabels = [t.optionChoiceOne, t.complexChoice, t.shortAnswerType, t.essayType];
  const levelLabels = [t.cognitiveRemember, t.cognitiveUnderstand, t.cognitiveApply, t.cognitiveAnalyze, t.cognitiveEvaluate, t.cognitiveCreate];

  return <>
    <Heading theme={theme}>{importing ? t.importMarkdownTitle : question ? t.editQuestionAnswerKey : t.manualQuestionTitle}</Heading>
    <Choice theme={theme} disabled={submitting} label={t.courseLabel} options={choices(courses)} value={courseId} onChange={edit((next: string) => {
      if (next !== courseId) { setCourseId(next); setChapterId(""); clearIdeaLinks(); }
    })} />
    {courseId && <Load resource={chapters} presentation={presentation}>{(rows) =>
      <Choice theme={theme} disabled={submitting} label={t.chapterLabel} options={[{ value: "", label: t.allChaptersLabel }, ...rows.map((row) => ({ value: row.id, label: `${row.code} · ${row.title}` }))]} value={chapterId} onChange={edit((next: string) => {
        if (next !== chapterId) { setChapterId(next); clearIdeaLinks(); }
      })} />}</Load>}
    {courseId && <Section theme={theme}>
      <Row>
        <Copy theme={theme} tone="strong">{t.ideaConnection}</Copy>
        <Copy theme={theme} tone="muted">{t.optional}</Copy>
        <Button theme={theme} variant="outline" disabled={submitting} accessibilityState={{ expanded: ideasOpen }} onPress={edit(() => setIdeasOpen(!ideasOpen))}>{ideasOpen ? t.close : t.manageIdeas}</Button>
      </Row>
      <Copy theme={theme} tone="muted">{ideaLinks.length ? interpolate(t.ideaConnectedCount, { count: ideaLinks.length }) : t.ideaCanBeUnlinked}</Copy>
      {ideasOpen && ideaLinks.length > 0 && <View accessibilityLiveRegion="polite">
        <Copy theme={theme} tone={ideaWeightsReady ? "strong" : "error"}>
          {t.totalWeight} {Math.round(ideaWeightTotal(ideaLinks) * 100)}%. {ideaWeightsReady ? t.readyToSave : t.weightMustBe100}
        </Copy>
      </View>}
      {ideasOpen && <Load resource={ideas} presentation={presentation}>{(rows) => rows.length === 0 ? <Copy theme={theme} tone="muted">{t.noPublishedIdeas}</Copy> : rows.map((idea) => {
        const link = ideaLinks.find((item) => item.ideaId === idea.id);
        return <Section key={idea.id} theme={theme}>
          <Button theme={theme} variant={link ? "default" : "outline"} disabled={submitting} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(link) }} onPress={edit(() => toggleIdea(idea.id))}>{idea.code}</Button>
          <Copy theme={theme}>{idea.statement}</Copy>
          {link && <>
            <Field theme={theme} disabled={submitting} label={t.weightLabel} testID={`evaluation-idea-weight-${idea.id}`} accessibilityLabel={`${t.weightLabel} ${idea.code}`} keyboardType="decimal-pad" value={weightDrafts[idea.id] ?? String(link.weight)} onChangeText={edit((value: string) => {
              setWeightDrafts((draft) => ({ ...draft, [idea.id]: value }));
              updateLink(idea.id, { weight: parseIdeaWeightInput(value) });
              dismissWeightError();
            })} />
            <Choice theme={theme} disabled={submitting} label={t.roleLabel} accessibilityLabel={`${t.roleLabel} ${idea.code}`} value={link.role} options={roles} onChange={edit((role: IdeaRole) => updateLink(idea.id, { role }))} />
          </>}
        </Section>;
      })}</Load>}
    </Section>}
    {importing ? <>
      {importMarkdown && <Row><Button theme={theme} variant="outline" disabled={submitting} onPress={edit(() => {
        void importMarkdown().then(edit((source: string | null) => { if (source !== null) setMarkdown(source); }), edit(() => setValidation(t.connectionError)));
      })}>{t.markdownFile}</Button></Row>}
      <Field theme={theme} disabled={submitting} label={t.markdownContent} value={markdown} onChangeText={edit(setMarkdown)} placeholder={t.markdownImportPlaceholder} multiline autoCapitalize="none" />
      <Copy theme={theme} tone="muted">{t.markdownFormatHelp}</Copy>
    </> : <>
      <Choice theme={theme} disabled={submitting} label={t.typeLabel} value={type} options={questionTypes.map((value, index) => ({ value, label: typeLabels[index] }))} onChange={edit((value: QuestionType) => {
        setType(value);
        if (value === "multiple_choice" && correct.length > 1) setCorrect(correct.slice(0, 1));
      })} />
      <Choice theme={theme} disabled={submitting} label={t.difficultyLabel} value={difficulty} options={["easy", "medium", "hard"].map((value) => ({ value: value as Difficulty, label: t[value as Difficulty] }))} onChange={edit(setDifficulty)} />
      <Choice theme={theme} disabled={submitting} label={t.cognitiveLevelLabel} value={level} options={levels.map((value, index) => ({ value, label: levelLabels[index] }))} onChange={edit(setLevel)} />
      <Field theme={theme} disabled={submitting} label={t.reasoningPatternLabel} value={reasoning} onChangeText={edit(setReasoning)} />
      <Field theme={theme} disabled={submitting} label={t.questionPrompt} value={prompt} onChangeText={edit(setPrompt)} multiline />
      {isChoice && <Section theme={theme}>
        <Copy theme={theme} tone="strong">{t.optionsAndAnswerKeyLabel}</Copy>
        {options.map((option, index) => <Section key={index} theme={theme}>
          <Field theme={theme} disabled={submitting} label={interpolate(t.optionNumber, { number: String.fromCharCode(65 + index) })} value={option} onChangeText={edit((text: string) => setOptions((current) => current.map((item, itemIndex) => itemIndex === index ? text : item)))} />
          <Button theme={theme} variant={correct.includes(index) ? "default" : "outline"} disabled={submitting} accessibilityRole={type === "multiple_choice" ? "radio" : "checkbox"} accessibilityState={{ checked: correct.includes(index) }} onPress={edit(() => setCorrect((current) => type === "multiple_choice" ? [index] : current.includes(index) ? current.filter((item) => item !== index) : [...current, index]))}>{language(locale, "Kunci jawaban", "Correct answer")}</Button>
        </Section>)}
      </Section>}
      {type === "short_answer" && <Field theme={theme} disabled={submitting} label={t.acceptedAnswersLabel} value={answers} onChangeText={edit(setAnswers)} placeholder={t.acceptedAnswersPlaceholder} />}
      <Field theme={theme} disabled={submitting} label={t.solutionRubricLabel} value={explanation} onChangeText={edit(setExplanation)} multiline />
      <Field theme={theme} disabled={submitting} label={t.tagsLabel} value={tags} onChangeText={edit(setTags)} placeholder={t.tagsPlaceholder} />
    </>}
    {validation && <Copy theme={theme} tone="error">{validation}</Copy>}
    {error !== undefined && <Failure error={error} presentation={presentation} />}
    {uncertain && <Copy theme={theme} tone="error">{language(locale, "Status penyimpanan belum diketahui. Periksa Bank Soal sebelum mengirim ulang.", "Save status is unknown. Review the question bank before submitting again.")}</Copy>}
    <Row>
      <Button theme={theme} variant="outline" disabled={submitting} onPress={edit(onClose)}>{t.cancel}</Button>
      <Button testID="evaluation-question-save-draft" theme={theme} variant="outline" isLoading={submitting} disabled={uncertain} onPress={() => void save("generated")}>{t.saveDraft}</Button>
      <Button theme={theme} isLoading={submitting} disabled={uncertain} onPress={() => void save("published")}>{t.savePublish}</Button>
    </Row>
  </>;
}
