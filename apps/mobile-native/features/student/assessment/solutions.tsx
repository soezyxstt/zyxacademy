import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import type { SolutionPart as ArticlePart, SolutionItem as SolutionCollectionItem, SolutionProvenance } from "../../../../../packages/native-parity/student/assessment/solution-contract";
import type { AssessmentPage } from "../../../../../packages/native-parity/student/assessment/contract";
import { SolutionVisualPreview } from "../../solutions/SolutionVisualPreview";
import { partText } from "../../solutions/semantic";
import { Input } from "../../../components/Input";
import { assessmentCoursePath, assessmentRequest, AssessmentRequestError, jsonBody } from "./client";
import { Body, Button, ButtonRow, fill, Frame, Heading, Markdown, Message, Row, Section, styles, useAssessment, useAssessmentCopy } from "./ui";

function Parts({ parts, item }: { parts: ArticlePart[]; item: SolutionCollectionItem }) {
  const { renderAssessmentParts, route, session, devicePreferences } = useAssessment();
  const locale = /^en(?:-|$)/i.test(session.locale) ? "en" : "id";
  const theme = devicePreferences?.theme === "system" ? undefined : devicePreferences?.theme;
  if (renderAssessmentParts) return <>{renderAssessmentParts(parts, route.params.id, item.visuals)}</>;
  return <>{parts.map((part) => {
    if (part.kind === "visual_ref") {
      const visual = item.visuals.find(({ id }) => id === part.visualId);
      return <SolutionVisualPreview key={part.id} value={visual} origin={session.origin} locale={locale} theme={theme} />;
    }
    if (part.kind === "worked_example") return <Section key={part.id}>
      <Heading level={3}>{part.title}</Heading>
      <Markdown value={part.problemMarkdown} />
      {part.steps.map((step, index) => <Section key={index}>
        <Markdown value={step.operationMarkdown} />
        <Parts parts={step.parts} item={item} />
        <Markdown value={step.reasonMarkdown} />
        {step.conditionsMarkdown ? <Markdown value={step.conditionsMarkdown} /> : null}
      </Section>)}
      <Markdown value={part.verificationMarkdown} />
    </Section>;
    return <Markdown key={part.id} value={partText(part)} />;
  })}</>;
}

function Sources({ title, source }: { title: string; source: SolutionProvenance }) {
  return <Section><Heading level={3}>{title}</Heading><Markdown value={source.attribution} />
    {source.sources.map((item, index) => <Section key={index}><Body>{item.title} · {item.locator}</Body>
      {item.url?.startsWith("https://") ? <Button variant="outline" size="sm" onPress={() => { void Linking.openURL(item.url!).catch(() => {}); }}>{item.title}</Button> : null}
    </Section>)}
  </Section>;
}

function SolutionItem({ item, index, total, complete, canComplete, onComplete }: {
  item: SolutionCollectionItem; index: number; total: number; complete: boolean; canComplete: boolean; onComplete: () => void;
}) {
  const { messages, tx } = useAssessmentCopy();
  const t = messages.solutionCollection;
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState(false);
  const [sources, setSources] = useState(false);
  const stepLabel = { choice: t.explanationSteps, calculation: t.calculationSteps, conceptual: t.explanationFlow, code_trace: t.codeTrace, code_construction: t.codeConstruction }[item.template];
  return <Section border>
    <Body tone="muted" style={styles.caption}>{fill(t.itemProgress, { current: index + 1, total })}</Body>
    <Heading>{item.title}</Heading>
    <Parts item={item} parts={item.prompt} />
    {item.options.map((option, i) => <Section key={option.id} border>
      <Body tone="muted">{String.fromCharCode(65 + i)}</Body><Parts item={item} parts={option.parts} />
    </Section>)}
    <ButtonRow>
      {!revealed && item.hintMarkdown ? <Button size="sm" variant="outline" accessibilityState={{ expanded: hint }} onPress={() => setHint(!hint)}>{hint ? t.hideHint : t.showHint}</Button> : null}
      <Button size="sm" testID="student-assessment-reveal" accessibilityState={{ expanded: revealed }} onPress={() => { setRevealed(!revealed); setHint(false); }}>{revealed ? t.hideSolution : t.showSolution}</Button>
    </ButtonRow>
    {!revealed && hint && item.hintMarkdown ? <Section border><Heading level={3}>{t.hint}</Heading><Markdown value={item.hintMarkdown} /></Section> : null}
    {revealed ? <>
      <Section border>
        <Heading level={3}>{t.answer}</Heading>
        {item.answer.optionIds.length ? <Body tone="primary">{item.answer.optionIds.map((optionId) => String.fromCharCode(65 + item.options.findIndex(({ id }) => id === optionId))).join(", ")}</Body> : null}
        <Parts item={item} parts={item.answer.parts} />
      </Section>
      <Section border><Heading level={3}>{item.template === "conceptual" ? t.approach : t.strategy}</Heading><Parts item={item} parts={item.strategy} /></Section>
      <Section border><Heading level={3}>{stepLabel}</Heading>
        {item.steps.map((step, i) => <Section key={step.id}><Markdown value={`${i + 1}. ${step.operationMarkdown}`} /><Markdown value={step.reasonMarkdown} />
          {step.conditionsMarkdown ? <Markdown value={step.conditionsMarkdown} /> : null}{step.parts ? <Parts item={item} parts={step.parts} /> : null}</Section>)}
      </Section>
      <Section border><Heading level={3}>{t.verification}</Heading><Parts item={item} parts={item.verification} /></Section>
      {item.misconceptions?.length ? <Section border><Heading level={3}>{t.misconceptions}</Heading>{item.misconceptions.map((entry) => <Section key={entry.id}>
        <Body tone="muted">{t.misconception}</Body><Markdown value={entry.misconceptionMarkdown} /><Body tone="muted">{t.correction}</Body><Markdown value={entry.correctionMarkdown} />
      </Section>)}</Section> : null}
    </> : null}
    <Button size="sm" variant="ghost" accessibilityState={{ expanded: sources }} onPress={() => setSources(!sources)}>{t.sources}</Button>
    {sources ? <><Sources title={t.question} source={item.provenance.problem} /><Sources title={t.solution} source={item.provenance.solution} /></> : null}
    {revealed && canComplete ? <Button size="sm" variant="outline" disabled={complete} testID="student-assessment-solution-mark" onPress={onComplete}>
      {complete ? tx("Selesai dibaca", "Read") : tx("Tandai selesai dibaca", "Mark as read")}
    </Button> : null}
  </Section>;
}

export function SolutionReader({ data, reload }: { data: Extract<AssessmentPage, { kind: "solutions" }>; reload: () => void }) {
  const { route, request, replace, navigate } = useAssessment();
  const { messages, tx } = useAssessmentCopy();
  const course = assessmentCoursePath(route);
  const t = messages.solutionCollection;
  const [list, setList] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [complete, setComplete] = useState<string[]>([]);
  const [result, setResult] = useState<"idle" | "busy" | "done" | "retry" | "changed">("idle");
  const writing = useRef(false);
  const base = `${course}/solutions/${encodeURIComponent(data.id)}`;
  const requested = data.collection.items.findIndex(({ id }) => id === route.query.item);
  const index = Math.max(0, requested);
  const active = data.collection.items[index];
  const query = search.trim().toLowerCase();
  const items = data.collection.items.map((item, index) => ({ item, index })).filter(({ item, index }) => !query || `${index + 1} ${item.title} ${item.prompt.map(partText).join(" ")}`.toLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(items.length / 20));
  function select(index: number) {
    const item = data.collection.items[index];
    if (!item) return;
    setList(false);
    replace(`${base}?item=${encodeURIComponent(item.id)}`);
  }
  async function finish() {
    if (writing.current || result === "done") return;
    writing.current = true;
    setResult("busy");
    try {
      const saved = await assessmentRequest<{ success: boolean }>(request, base, jsonBody({ version: data.version, itemIds: complete }));
      if (!saved.success) throw new Error("Invalid completion receipt");
      setResult("done");
    } catch (error) {
      setResult(error instanceof AssessmentRequestError && error.status === 409 ? "changed" : "retry");
    } finally { writing.current = false; }
  }
  return <Frame title={data.collection.title} subtitle={data.collection.chapter.title} onBack={() => navigate(`${course}/material?tab=bank_soal`)}>
    {!active ? <Message title={t.noItems} detail={t.emptyCollection} /> : <>
      <Button variant="outline" size="sm" accessibilityState={{ expanded: list }} onPress={() => setList(!list)}>{t.itemList}</Button>
      {list ? <Section border>
        <Input accessibilityLabel={t.search} placeholder={t.search} value={search} onChangeText={(value) => { setSearch(value); setPage(0); }} />
        {items.length ? items.slice(page * 20, page * 20 + 20).map(({ item, index }) => <Row key={item.id} title={`${index + 1}. ${item.title}`}
          description={complete.includes(item.id) ? t.reviewComplete : undefined} onPress={() => select(index)} />) : <Body tone="muted">{t.noMatches}</Body>}
        {pageCount > 1 ? <ButtonRow><Button size="sm" variant="outline" disabled={page === 0} onPress={() => setPage(page - 1)}>{t.previousPage}</Button>
          <Body>{fill(t.pageProgress, { current: page + 1, total: pageCount })}</Body><Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onPress={() => setPage(page + 1)}>{t.nextPage}</Button></ButtonRow> : null}
      </Section> : null}
      {route.query.item && requested < 0 ? <Body tone="muted">{t.invalidItem}</Body> : null}
      <SolutionItem key={active.id} item={active} index={index} total={data.collection.items.length} canComplete={data.canComplete}
        complete={complete.includes(active.id)} onComplete={() => setComplete((current) => current.includes(active.id) ? current : [...current, active.id])} />
      <ButtonRow>
        <Button size="sm" variant="outline" disabled={index === 0} onPress={() => select(index - 1)}>{t.previous}</Button>
        <Button size="sm" variant="outline" disabled={index + 1 >= data.collection.items.length} onPress={() => select(index + 1)}>{t.next}</Button>
      </ButtonRow>
      {data.canComplete && complete.length === data.collection.items.length && result !== "changed" ? <Button testID="student-assessment-solution-complete" disabled={result === "done"}
        isLoading={result === "busy"} onPress={() => void finish()}>{result === "done" ? tx("Pembahasan selesai", "Collection completed") : tx("Selesaikan pembahasan", "Complete collection")}</Button> : null}
      {result === "retry" ? <View accessibilityLiveRegion="assertive"><Body tone="error">{tx("Belum dapat menyimpan. Coba lagi.", "Could not save. Try again.")}</Body></View> : null}
      {result === "changed" ? <Message title={tx("Pembahasan sudah diperbarui", "The collection was updated")} action={tx("Muat ulang", "Reload")} onPress={reload} /> : null}
    </>}
  </Frame>;
}
