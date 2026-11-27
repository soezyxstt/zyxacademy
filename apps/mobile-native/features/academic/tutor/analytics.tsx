import { randomUUID } from "expo-crypto";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import enTutor from "../../../../../messages/en/tutor.json";
import idTutor from "../../../../../messages/id/tutor.json";
import { TutorDataError, type TutorAnalytics, type TutorDataSource } from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import { Empty, Heading, Label, Row, TutorDetail, tutorLayout, type TutorTheme } from "./ui";

const watchlistPageSize = 10;

export function CourseAnalytics({ theme, courseId, analytics, refresh, locale, navigate }: {
  theme: TutorTheme;
  courseId: string;
  analytics: NonNullable<TutorDataSource["analytics"]>;
  refresh?: TutorDataSource["refreshAnalytics"];
  locale: "en" | "id";
  navigate(path: string): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const { analytics: copy, routeTitles: routes } = locale === "en" ? enTutor : idTutor;
  const date = new Intl.DateTimeFormat(locale === "en" ? "en" : "id", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });
  const [data, setData] = useState<TutorAnalytics>();
  const [conceptName, setConceptName] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [request, setRequest] = useState<{ requestId?: string }>({});
  const [showOther, setShowOther] = useState(false);
  const [watchlistLimit, setWatchlistLimit] = useState(watchlistPageSize);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      let refreshFailed = false;
      try {
        if (request.requestId && refresh) {
          try {
            await refresh(courseId, request.requestId, signal);
          } catch (error) {
            if (signal.aborted || error instanceof TutorDataError && [401, 403, 404].includes(error.status)) throw error;
            refreshFailed = true;
          }
        }
        if (signal.aborted) return;
        const result = await analytics(courseId, signal);
        if (!signal.aborted) {
          setData(result);
          setError(refreshFailed);
        }
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof TutorDataError && [401, 403, 404].includes(error.status)) {
          setData(undefined);
          setConceptName(undefined);
        }
        setError(true);
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [analytics, courseId, refresh, request]);

  function reload() {
    if (busy || !canInteract()) return;
    setBusy(true);
    setError(false);
    setRequest({ requestId: !error && refresh ? randomUUID() : undefined });
  }

  const other = data?.allConcepts.filter(entry =>
    !data.weakConcepts.some(priority => priority.conceptName === entry.conceptName)) ?? [];
  const concepts = [...(data?.weakConcepts ?? []), ...(showOther ? other : [])];
  const concept = data?.allConcepts.find(entry => entry.conceptName === conceptName);
  const watchlist = data?.watchlist ?? [];
  const misconceptions = data?.topMisconceptions ?? [];
  const trends = concept ? data?.conceptTrends?.[concept.conceptName] ?? [] : [];
  const missed = concept ? data?.mostMissed?.[concept.conceptName] ?? [] : [];
  const localTime = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? date.format(new Date(value)) : undefined;
  const updated = localTime(data?.updatedAt);
  const moreConcepts = locale === "en" ? `${other.length} more ${other.length === 1 ? "concept" : "concepts"}`
    : copy.moreConcepts.replace("{count, number}", String(other.length));
  const markdownSession = { session: { origin: "", locale } };

  return <View style={tutorLayout.group}>
    <Heading theme={theme} title={routes.analytics} />
    <Button theme={theme} variant="outline" isLoading={busy} style={tutorLayout.action} onPress={reload} testID="tutor-analytics-refresh">
      {error ? (locale === "en" ? "Load analytics again" : "Muat lagi analitik") : copy.refresh}
    </Button>
    {error ? <Label theme={theme} tone="error">{copy.refreshFailed}</Label> : null}
    {!data && busy ? <ActivityIndicator /> : null}
    {data ? <>
      <Label theme={theme} tone="muted">{updated ? copy.updated.replace("{relative}", updated) : copy.notCalculated}</Label>
      <Row theme={theme} title={routes.enrolled} meta={String(data.enrolledCount)} />
      <Row theme={theme} title={routes.activeThisWeek} meta={String(data.activeCount)} />
      {(data.quizParticipationPct ?? 0) > 0 && <Row theme={theme} title={routes.quizParticipation} meta={`${data.quizParticipationPct}%`} />}
      <Heading theme={theme} title={copy.priorityConcepts} />
      {concepts.length > 0 ? concepts.map(entry => <Row key={entry.conceptName} theme={theme}
        title={entry.conceptName} subtitle={copy.students.replace("{count}", String(entry.studentCount))}
        meta={String(entry.avgMastery)} onPress={() => setConceptName(entry.conceptName)}
      />) : <Empty theme={theme} title={copy.insufficientConceptData} />}
      {other.length > 0 ? <Button theme={theme} variant="ghost" style={tutorLayout.action}
        accessibilityState={{ expanded: showOther }} onPress={() => setShowOther(current => !current)}
      >{showOther ? (locale === "en" ? "Hide other concepts" : "Sembunyikan konsep lain") : moreConcepts}</Button> : null}
      <Heading theme={theme} title={copy.needsAttention} />
      {watchlist.length ? watchlist.slice(0, watchlistLimit).map(student => {
        const shown = student.decliningConcepts.slice(0, 3);
        const remaining = student.decliningConcepts.length - shown.length;
        const detail = shown.length ? shown.join(", ") + (remaining ? ` ${copy.otherConcepts.replace("{count}", String(remaining))}` : "")
          : copy.activeInterventionCount.replace("{count}", String(student.activeInterventionCount));
        return <Row key={student.studentId} theme={theme} title={student.name} subtitle={detail} meta={localTime(student.lastActiveAt) ?? copy.never} />;
      }) : <Empty theme={theme} title={data.updatedAt ? copy.noWatchlist : copy.watchlistNotCalculated} />}
      {watchlist.length > watchlistLimit ? <Button theme={theme} variant="ghost" style={tutorLayout.action}
        onPress={() => setWatchlistLimit(count => count + watchlistPageSize)}>
        {locale === "en" ? "Show more students" : "Tampilkan siswa lainnya"}
      </Button> : null}
      <Heading theme={theme} title={copy.activeInterventions} />
      {data.interventionCounts.length ? data.interventionCounts.map(entry =>
        <Row key={entry.conceptName} theme={theme} title={entry.conceptName} meta={String(entry.count)} />
      ) : <Empty theme={theme} title={copy.noInterventions} />}
      <Heading theme={theme} title={copy.commonMisconceptions} />
      {misconceptions.length ? misconceptions.slice(0, 10).map(item => <Row key={item.misconceptionKoId} theme={theme}
        title={item.label} subtitle={`${item.conceptName} · ${copy.attempts.replace("{count}", String(item.sampleSize))}`}
        meta={`${item.pctSelected}%`} />
      ) : <Empty theme={theme} title={data.updatedAt ? copy.noMisconceptions : copy.notCalculated} />}
    </> : null}
    {concept ? <TutorDetail theme={theme} title={concept.conceptName} onBack={() => setConceptName(undefined)}>
      <Row theme={theme} title={copy.averageMastery} meta={String(concept.avgMastery)} />
      <Heading theme={theme} title={copy.masteryDistribution} count={copy.students.replace("{count}", String(concept.studentCount))} />
      <Row theme={theme} title={copy.lowLabel} meta={String(concept.bucketLow)} />
      <Row theme={theme} title={copy.midLabel} meta={String(concept.bucketMid)} />
      <Row theme={theme} title={copy.highLabel} meta={String(concept.bucketHigh)} />
      <Heading theme={theme} title={copy.trendFourWeeks} />
      {trends.length >= 2 ? trends.map(entry => <Row key={entry.week} theme={theme} title={entry.week} meta={String(entry.avgMastery)} />)
        : <Label theme={theme} tone="muted">{copy.trendInsufficient}</Label>}
      {missed.length ? <>
        <Heading theme={theme} title={copy.mostMissed} />
        {missed.map(question => <View key={question.id} style={tutorLayout.group}>
          <CourseMarkdown source={question.prompt} services={markdownSession} theme={theme} allowLinks={false} renderPreviewImage={() => null} />
          <Label theme={theme}>{Math.round(question.correctRate * 100)}% · {copy.attempts.replace("{count}", String(question.attemptCount))}</Label>
        </View>)}
      </> : null}
      <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => {
        if (!canInteract()) return;
        setConceptName(undefined);
        navigate(`/tutor/${encodeURIComponent(courseId)}/quizzes/new?${new URLSearchParams({ tags: concept.conceptName })}`);
      }}>{copy.makeRemediationQuiz}</Button>
    </TutorDetail> : null}
  </View>;
}
