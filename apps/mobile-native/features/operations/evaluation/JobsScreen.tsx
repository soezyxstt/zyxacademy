import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button } from "../../../components/Button";
import { evaluationAction, evaluationRead, type EvaluationRequest, type GenerationJob, type GenerationJobs } from "../../../../../packages/native-parity/operations/evaluation-contract";
import { Choice, choices, Copy, Failure, Heading, httpStatus, interpolate, language, Load, Row, Section, strings, useRead, type Presentation } from "./ui";

const isInFlight = (job: GenerationJob) => job.status === "pending" || job.status === "processing";
const emptyForm = { courseId: "", chapterId: "", koId: "all" };
type CreatedJob = { jobId: string; targetCount: number };

export function JobsScreen({ request, presentation }: { request: EvaluationRequest; presentation: Presentation }) {
  const initial = useRead<GenerationJobs>(request, evaluationRead("/admin/jobs"));
  return <>
    <Heading theme={presentation.theme}>{strings(presentation.locale).routes.generationJobs}</Heading>
    <Load resource={initial} presentation={presentation}>{(snapshot) => <JobQueue snapshot={snapshot} request={request} presentation={presentation} />}</Load>
  </>;
}

function JobQueue({ snapshot, request, presentation }: { snapshot: GenerationJobs; request: EvaluationRequest; presentation: Presentation }) {
  const { theme, locale } = presentation;
  const t = strings(locale).jobs;
  const [jobs, setJobs] = useState(snapshot.jobs);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [submissionError, setSubmissionError] = useState<unknown>();
  const [refreshError, setRefreshError] = useState<unknown>();
  const [createdId, setCreatedId] = useState<string>();
  const refreshes = useRef(new Map<string, AbortController>());
  const busy = useRef(false);
  const mounted = useRef(true);
  const activeKey = JSON.stringify(jobs.filter(isInFlight).map((job) => job.id));

  useEffect(() => {
    const pending = refreshes.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.forEach((controller) => controller.abort());
      pending.clear();
    };
  }, []);

  function refreshJob(id: string) {
    const outstanding = refreshes.current;
    if (outstanding.has(id)) return;
    const controller = new AbortController();
    outstanding.set(id, controller);
    return request<GenerationJob>(evaluationAction("generation-job", id), { signal: controller.signal }).then(
      (updated) => {
        if (controller.signal.aborted) return;
        setJobs((rows) => rows.map((row) => row.id === id ? updated : row));
      },
      (error: unknown) => { if (!controller.signal.aborted) setRefreshError(error); },
    ).finally(() => outstanding.delete(id));
  }

  useEffect(() => {
    const ids: string[] = JSON.parse(activeKey);
    if (!ids.length) return;
    const interval = setInterval(() => ids.forEach((id) => { void refreshJob(id); }), 3000);
    return () => clearInterval(interval);
    // The parent remounts the queue when its authenticated request changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, request]);

  async function create() {
    if (!form.courseId || !form.chapterId || busy.current || uncertain) return;
    busy.current = true;
    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const result = await request<CreatedJob>(evaluationAction("generation-jobs"), { method: "POST", body: form });
      if (!mounted.current) return;
      const timestamp = new Date().toISOString();
      setJobs((rows) => [{
        id: result.jobId,
        courseId: form.courseId,
        tutorId: "",
        status: "pending",
        promptParameters: { chapterId: form.chapterId, koId: form.koId },
        targetCount: result.targetCount,
        generatedCount: 0,
        tokenUsage: 0,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }, ...rows.filter((job) => job.id !== result.jobId)]);
      setCreatedId(result.jobId);
      setShowForm(false);
    } catch (error) {
      if (!mounted.current) return;
      const status = httpStatus(error);
      setUncertain(status === undefined || status >= 500);
      setSubmissionError(error);
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  async function refreshList() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    setRefreshError(undefined);
    try {
      const latest = await request<GenerationJobs>(evaluationRead("/admin/jobs"));
      if (mounted.current) setJobs(latest.jobs);
    } catch (error) {
      if (mounted.current) setRefreshError(error);
    } finally {
      busy.current = false;
      if (mounted.current) setSubmitting(false);
    }
  }

  const chapters = snapshot.chapters.filter((chapter) => chapter.courseId === form.courseId);
  const knowledgeObjects = snapshot.knowledgeObjects.filter((item) => item.courseId === form.courseId && item.chapterId === form.chapterId);
  return <>
    <Row>
      <Copy theme={theme} tone="muted">{jobs.length} {t.latest}</Copy>
      <Button theme={theme} variant={showForm ? "outline" : "default"} accessibilityState={{ expanded: showForm }} onPress={() => setShowForm(!showForm)}>{showForm ? t.close : t.createJob}</Button>
    </Row>
    {showForm && <Section theme={theme}>
      <Choice theme={theme} label={t.course} value={form.courseId} options={choices(snapshot.courses)} onChange={(courseId) => setForm({ ...emptyForm, courseId })} />
      <Choice theme={theme} label={t.chapter} value={form.chapterId} options={choices(chapters)} onChange={(chapterId) => setForm({ ...form, chapterId, koId: "all" })} />
      <Choice theme={theme} label={t.knowledgeObject} value={form.koId} options={[{ value: "all", label: t.allKnowledgeObjects }, ...knowledgeObjects.map((ko) => ({ value: ko.id, label: `[${ko.conceptName}] ${ko.title}` }))]} onChange={(koId) => setForm({ ...form, koId })} />
      {form.chapterId && <Copy theme={theme} tone="muted">{form.koId === "all" ? interpolate(t.knowledgeObjectCount, { count: knowledgeObjects.length }) : t.oneKnowledgeObject}</Copy>}
      {submissionError !== undefined && <Failure error={submissionError} presentation={presentation} />}
      {uncertain && <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
        <Copy theme={theme}>{language(locale, "Status pengiriman belum diketahui. Periksa daftar job sebelum membuat job baru.", "Delivery status is unknown. Check the job list before starting another job.")}</Copy>
        <Row>
          <Button theme={theme} variant="outline" isLoading={submitting} onPress={() => void refreshList()}>{t.refreshStatus}</Button>
          <Button theme={theme} variant="outline" disabled={submitting} onPress={() => { setUncertain(false); setSubmissionError(undefined); }}>{language(locale, "Siapkan job baru", "Prepare another job")}</Button>
        </Row>
      </View>}
      <Row>
        <Button theme={theme} isLoading={submitting} disabled={!form.courseId || !form.chapterId || knowledgeObjects.length === 0 || uncertain} onPress={() => void create()}>{t.run}</Button>
        <Button theme={theme} variant="outline" disabled={submitting} onPress={() => setShowForm(false)}>{t.cancel}</Button>
      </Row>
    </Section>}
    {createdId && <View accessibilityLiveRegion="polite"><Copy theme={theme}>{interpolate(t.jobCreatedWithId, { id: createdId })}</Copy></View>}
    {refreshError !== undefined && <Failure error={refreshError} presentation={presentation} retry={() => { setRefreshError(undefined); void refreshList(); }} />}
    {jobs.length === 0 && <Copy theme={theme} tone="muted">{t.empty}</Copy>}
    {jobs.map((job) => {
      const params = job.promptParameters && typeof job.promptParameters === "object" ? job.promptParameters as Record<string, unknown> : {};
      const chapter = snapshot.chapters.find((item) => item.id === params.chapterId);
      const ko = snapshot.knowledgeObjects.find((item) => item.id === params.koId);
      const koName = ko?.title ?? (typeof params.koId === "string" && params.koId !== "all" ? params.koId : t.allKnowledgeObjects);
      const date = new Date(job.createdAt);
      const dateTime = Number.isNaN(date.getTime()) ? job.createdAt : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
      const progress = interpolate(t.questionsGenerated, { generated: job.generatedCount, target: job.targetCount });
      return <Section key={job.id} theme={theme}>
        <Copy theme={theme} tone="strong">{chapter ? interpolate(t.chapterNumber, { number: chapter.orderIndex, title: chapter.title }) : String(params.chapterId ?? "")}</Copy>
        <Copy theme={theme}>{koName} · {snapshot.courseMap[job.courseId] ?? job.courseId}</Copy>
        <Copy theme={theme} tone="muted">{t[job.status]} · {progress} · {dateTime}</Copy>
        {Array.isArray(params.logs) && params.logs.length > 0 && <>
          <Copy theme={theme} tone="strong">{t.progressDetails}</Copy>
          {params.logs.filter((log): log is string => typeof log === "string").map((log, index) => <Copy key={index} theme={theme} tone="muted">{log}</Copy>)}
        </>}
        {job.errorMessage && <Copy theme={theme} tone="error">{t.errorDetails} {job.errorMessage}</Copy>}
        {isInFlight(job) && <Row><Button theme={theme} variant="ghost" onPress={() => { setRefreshError(undefined); void refreshJob(job.id); }}>{t.refreshStatus}</Button></Row>}
      </Section>;
    })}
  </>;
}
