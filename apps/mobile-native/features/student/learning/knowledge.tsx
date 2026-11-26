import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { chooseMasteryFocus } from "../../../../../lib/demo/view-mastery";
import { nativeLinkInks } from "../../../../../packages/design-tokens/native-colors";
import { nativeTypography } from "../../../typography";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { courseHref, type ConceptKind, type LearningData, type StudentMasteryGroup, type StudyPathData, type StudyPathStep } from "../../../../../packages/native-parity/student/learning/contracts";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { StudentScreenProps } from "../contracts";
import { Body, Copy, Message, Progress, Row, Section, english, formatDate, readJson, styles, useLearningColors, type Translate } from "./ui";

type Ready<View extends LearningData["view"]> = Extract<LearningData, { state: "ready"; view: View }>;
const conceptKinds: ConceptKind[] = ["concept_overview", "definition", "formula", "example", "misconception", "exercise", "objective", "summary"];

export function ConceptContent({ data, props, t }: { data: Ready<"concept">; props: StudentScreenProps; t: Translate }) {
  const { concept } = data;
  const conceptHref = (slug: string) => courseHref(props.route.params.id, `/concept/${encodeURIComponent(slug)}`);
  return (
    <>
      {concept.masteryScore != null && <Section>
        <Copy>{t("learning.mastery.score", { score: concept.masteryScore })}</Copy>
        <Progress value={concept.masteryScore} label={t("learning.mastery.loadingTitle")} />
      </Section>}
      {(["prerequisites", "unlocks", "related"] as const).map((kind) => concept[kind].length ? (
        <Section key={kind} title={t(`learning.conceptPage.${kind}`)}>
          {concept[kind].map((item) => <Row key={item.slug} title={item.conceptName} onPress={() => props.navigate(conceptHref(item.slug))} />)}
        </Section>
      ) : null)}
      {conceptKinds.map((kind) => {
        const objects = concept.kosByType[kind];
        return objects?.length ? (
          <Section key={kind} title={t(`learning.conceptPage.types.${kind === "concept_overview" ? "conceptOverview" : kind}`)}>
            {objects.map((item) => <Row key={item.id} title={item.title}>
              {props.renderAssessmentMarkdown?.(item.content, props.route.params.id) ?? <Body source={item.content} />}
            </Row>)}
          </Section>
        ) : null;
      })}
    </>
  );
}

function Disclosure({ title, value, children, initiallyExpanded = false }: { title: string; value?: string; children: ReactNode; initiallyExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = useLearningColors();
  return <View>
    <Pressable accessibilityRole="button" accessibilityLabel={[title, value].filter(Boolean).join(" ")} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
      style={[styles.row, masteryStyles.row, { borderColor: colors.border }]}>
      <Copy style={masteryStyles.disclosureTitle}>{title}</Copy>
      {value ? <Copy muted style={masteryStyles.meta}>{value}</Copy> : null}
      <View style={expanded && masteryStyles.expanded}><NavigationIcon name="chevron" size={14} color={colors.mutedForeground} /></View>
    </Pressable>
    {expanded ? <View>{children}</View> : null}
  </View>;
}

function Topics({ props, t, topics }: { props: StudentScreenProps; t: Translate; topics: StudentMasteryGroup["concepts"] }) {
  const [page, setPage] = useState(0);
  const colors = useLearningColors();
  const pages = Math.ceil(topics.length / 10);
  return <>
    {topics.slice(10 * page, 10 * (page + 1)).map((topic, index) => {
      const slug = topic.conceptSlug;
      const label = topic.masteryScore === null ? undefined : `${topic.masteryScore}/100${topic.trend ? ` · ${t(`learning.mastery.${topic.trend}`)}` : ""}`;
      return <View key={`${slug ?? topic.conceptName}-${index}`} style={[styles.row, masteryStyles.row, { borderColor: colors.border }]}>
        <View style={masteryStyles.topic}>
          {slug ? <Text accessibilityRole="link" style={[masteryStyles.link, { color: colors.foreground }]} onPress={() => props.navigate(courseHref(props.route.params.id, `/concept/${encodeURIComponent(slug)}`))}>{topic.conceptName}</Text> : <Copy>{topic.conceptName}</Copy>}
          {topic.blockedBy.length > 0 && <Copy muted style={masteryStyles.meta}>{t("learning.mastery.prerequisite", { topic: topic.blockedBy.join(", ") })}</Copy>}
        </View>
        {label && <View accessible accessibilityLabel={label} style={masteryStyles.score}>
          {topic.trend === "stable" && <View style={[masteryStyles.stable, { backgroundColor: colors.mutedForeground }]} />}
          {topic.trend && topic.trend !== "stable" && <View style={topic.trend === "declining" && masteryStyles.declining}>
            <NavigationIcon name="trending-up" size={14} color={topic.trend === "improving" ? nativeLinkInks.success : colors.destructive} />
          </View>}
          <Copy style={masteryStyles.meta}>{topic.masteryScore}/100</Copy>
        </View>}
      </View>;
    })}
    {pages > 1 ? <View style={styles.wrap}>
      <Button variant="ghost" style={styles.action} disabled={page === 0} onPress={() => setPage(page - 1)}>{t("learning.mastery.previous")}</Button>
      <Copy muted>{page + 1}/{pages}</Copy>
      <Button variant="ghost" style={styles.action} disabled={page + 1 === pages} onPress={() => setPage(page + 1)}>{t("learning.mastery.more")}</Button>
    </View> : null}
  </>;
}

export function MasteryContent({ data, props, t }: { data: Ready<"mastery">; props: StudentScreenProps; t: Translate }) {
  const colors = useLearningColors();
  const groups = data.groups.map(({ chapter, concepts }) => ({ chapter, assessed: concepts.filter((item) => item.masteryScore !== null), unassessed: concepts.filter((item) => item.masteryScore === null) }));
  const { review, focus } = chooseMasteryFocus(data.groups);
  const reviewSlug = review?.topic.conceptSlug;
  const action = <Button size="sm" onPress={() => props.navigate(courseHref(props.route.params.id, reviewSlug ? `/concept/${encodeURIComponent(reviewSlug)}` : "/path"))} style={focus ? masteryStyles.action : undefined}>
    {t(reviewSlug ? "learning.mastery.reviewTopic" : "learning.mastery.openPath")}
  </Button>;
  return <>
    {focus ? <View style={masteryStyles.focus}>
      <Copy muted style={masteryStyles.meta}>{t(`learning.mastery.${!focus.reliable ? "early" : review ? "review" : "strong"}`)}</Copy>
      <Copy heading>{focus.topic.conceptName}</Copy>
      <Copy muted style={masteryStyles.meta}>{focus.chapter.title} · {t("learning.mastery.score", { score: focus.score })}</Copy>
      <Copy>{t(`learning.mastery.${!focus.reliable ? "limited" : review ? "reviewReason" : "strongReason"}`)}</Copy>{action}
    </View> : <View style={masteryStyles.empty}>
      <NavigationIcon name="target" size={28} color={colors.mutedForeground} />
      <Copy heading>{t("learning.mastery.emptyTitle")}</Copy>
      <Copy muted style={masteryStyles.description}>{t("learning.mastery.emptyDescription")}</Copy>{action}
    </View>}
    {groups.length > 0 ? <Section title={t("learning.mastery.chapters")}>
      {groups.map(({ chapter, assessed, unassessed }) => <Disclosure key={chapter.id} title={chapter.title}
        value={t("learning.mastery.coverage", { count: assessed.length, total: assessed.length + unassessed.length })}>
        <Topics topics={assessed.length ? assessed : unassessed} props={props} t={t} />
        {assessed.length && unassessed.length ? <Disclosure title={t("learning.mastery.unassessed", { count: unassessed.length })}>
          <Topics topics={unassessed} props={props} t={t} />
        </Disclosure> : null}
      </Disclosure>)}
    </Section> : null}
  </>;
}

const masteryStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  topic: { flex: 1, minWidth: 0, gap: 4 },
  disclosureTitle: { ...nativeTypography.bodySemibold, flex: 1 },
  meta: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
  link: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 21, textDecorationLine: "underline" },
  score: { flexDirection: "row", alignItems: "center", gap: 8 },
  expanded: { transform: [{ rotate: "180deg" }] },
  declining: { transform: [{ scaleY: -1 }] },
  stable: { width: 12, height: 2 },
  focus: { gap: 4 },
  action: { alignSelf: "flex-start", marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 16, gap: 8 },
  description: { textAlign: "center" },
});

export function ProgressContent({ data, props, t }: { data: Ready<"progress">; props: StudentScreenProps; t: Translate }) {
  const metrics = [
    ["studyTime", data.statistics?.studyTimeMin, "minutes"],
    ["completedDocuments", data.statistics?.completedMaterialsCount, "materials"],
    ["reviewedCards", data.statistics?.cardsReviewedCount, "reviews"],
    ["streak", data.statistics?.currentStreakDays, "days"],
  ] as const;
  const eventTitle = { flashcard_review: "flashcardReviewed", material_completion: "materialCompleted", quiz_completion: "quizAnswered", tryout_completion: "learning" } as const;
  return <>
    <Section title={t("studentCourse.course.statistics.title")}>
      {metrics.map(([label, value, unit]) => <Row key={label} title={t(`studentCourse.course.statistics.${label}`)} value={t(`studentCourse.course.statistics.${unit}`, { count: value ?? 0 })} />)}
    </Section>
    <Section title={t("studentCourse.course.recentActivity.title")}>
      {data.activities.length ? data.activities.map((item) => <Row key={item.id} title={t(`studentCourse.course.recentActivity.${eventTitle[item.type]}`)}
        detail={item.description} value={formatDate(item.timestamp, props.session.locale)} />)
        : <Copy muted>{t("studentCourse.course.recentActivity.empty")}</Copy>}
    </Section>
    <Section title={t("learning.progress.moreAnalysis")}>
      <Row title={t("learning.progress.masteryMap")} onPress={() => props.navigate(courseHref(props.route.params.id, "/mastery"))} />
      <Row title={t("learning.progress.quizResults")} onPress={() => props.navigate(courseHref(props.route.params.id, "/my-results"))} />
    </Section>
  </>;
}

const studyPath = "studentCourse.course.studyPath.";

function stepHref(step: StudyPathStep, courseId: string) {
  if (step.status === "locked") return null;
  if (step.actions.moduleHref?.startsWith("/courses/")) return step.actions.moduleHref;
  if (step.actions.quizTemplateId) return courseHref(courseId, `/quiz/${encodeURIComponent(step.actions.quizTemplateId)}`);
  if (step.actions.flashcardCount) return courseHref(courseId, "/flashcard");
  return null;
}

export function StudyPathContent({ props, t }: { props: StudentScreenProps; t: Translate }) {
  const [value, setValue] = useState<StudyPathData>();
  const [days, setDays] = useState("");
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const current = useRef<AbortController | null>(null);
  const { request, route, session } = props;
  const courseId = route.params.id;
  const locale = session.locale;
  const load = useMemo(() => async (targetDays?: number) => {
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setPending(true);
    setFailed(false);
    const search = new URLSearchParams({ courseId });
    if (targetDays !== undefined) search.set("days", String(targetDays));
    try {
      const result = await readJson<StudyPathData>(request, `/api/student/study-path?${search}`, {
        signal: controller.signal, headers: { "x-student-id": session.userId },
      });
      if (!controller.signal.aborted) setValue(result);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }, [courseId, request, session.userId]);
  useEffect(() => { void load(); return () => current.current?.abort(); }, [load]);

  if (!value) {
    return failed ? <Message action={t(studyPath + "retry")} onAction={() => void load()}>{t(studyPath + "connectionError")}</Message>
      : <ActivityIndicator accessibilityLabel={english(locale) ? "Loading study path" : "Memuat alur belajar"} />;
  }
  if (!value.steps.length) return <Copy muted>{t(studyPath + "empty")}</Copy>;
  const groups = new Map<string, StudyPathStep[]>();
  for (const step of value.steps) {
    const group = groups.get(step.chapterId);
    if (group) group.push(step);
    else groups.set(step.chapterId, [step]);
  }
  const next = value.steps.find((step) => step.status === "in_progress") ?? value.steps.find((step) => step.status === "available");
  const stepRow = (step: StudyPathStep) => {
    const href = stepHref(step, courseId);
    return <Row key={step.stepId} title={step.conceptName} value={t(studyPath + "minutesShort", { count: step.estimatedMinutes })}
      detail={step.status === "locked" ? [t(studyPath + "prerequisites"), step.prerequisites.slice(0, 2).join(", ")].join(" ") : undefined}
      onPress={href ? () => props.navigate(href) : undefined} />;
  };
  return <>
    <Section title={t(studyPath + "targetDuration")}>
      <View style={styles.wrap}>
        <Input value={days} onChangeText={(text) => { setDays(text); setInvalid(false); }} keyboardType="number-pad" accessibilityLabel={t(studyPath + "targetDuration")}
          testID="student-study-path-duration"
          placeholder="7" maxLength={2} style={{ width: 65, minHeight: 44 }} />
        <Copy>{t(studyPath + "days")}</Copy>
        <Button variant="outline" style={styles.action} isLoading={pending} disabled={!days} onPress={() => {
          const count = Number(days);
          if (!Number.isInteger(count) || count < 1 || count > 60) return setInvalid(true);
          void load(count);
        }}>{t(studyPath + "createPlan")}</Button>
      </View>
      {invalid ? <Message>{english(locale) ? "Enter a duration from 1 to 60 days." : "Masukkan durasi 1 sampai 60 hari."}</Message> : null}
      {failed ? <Message>{t(studyPath + "connectionError")}</Message> : null}
      {value.dayPlan ? <Button variant="ghost" style={styles.action} onPress={() => { current.current?.abort(); setPending(false); setValue({ ...value, dayPlan: null }); }}>{t(studyPath + "viewRoadmap")}</Button> : null}
    </Section>
    {value.dayPlan ? value.dayPlan.map((day) => <Disclosure key={day.day} title={t(studyPath + "day", { count: day.day })}
      value={t(studyPath + "minutes", { count: day.totalMinutes })} initiallyExpanded={day.day === 1}>
      {day.steps.map(stepRow)}
    </Disclosure>) : <>
      {next ? <Section title={t(studyPath + "continueLearning")}>
        <Copy heading>{next.conceptName}</Copy>
        <Copy muted>{t(studyPath + "estimatedTime", { reason: next.priorityReason, count: next.estimatedMinutes })}</Copy>
        {stepHref(next, courseId) ? <Button style={styles.action} onPress={() => props.navigate(stepHref(next, courseId)!)}>{t(studyPath + "start")}</Button> : null}
      </Section> : <Copy>{t(studyPath + "allMastered")}</Copy>}
      {[...groups].sort((a, b) => a[1][0].chapterOrder - b[1][0].chapterOrder).map(([id, steps], index) => <Disclosure
        key={id} title={`${english(locale) ? "Chapter" : "Bab"} ${steps[0].chapterOrder} · ${steps[0].chapterTitle}`}
        value={`${steps.filter((step) => step.status === "mastered").length}/${steps.length}`}
        initiallyExpanded={id === next?.chapterId || (index === 0 && !next)}>{steps.map(stepRow)}</Disclosure>)}
    </>}
  </>;
}
