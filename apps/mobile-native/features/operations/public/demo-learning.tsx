import { useState } from "react";
import { TextInput, View } from "react-native";
import { demoProgress } from "../../../../../lib/demo/progress-overlay";
import { planLocalStudyDays } from "../../../../../lib/demo/learning-path";
import { chooseMasteryFocus } from "../../../../../lib/demo/view-mastery";
import enLearning from "../../../../../messages/en/learning.json";
import idLearning from "../../../../../messages/id/learning.json";
import enCourse from "../../../../../messages/en/studentCourse.json";
import idCourse from "../../../../../messages/id/studentCourse.json";
import type { PublicDemoContent } from "../../../../../packages/native-parity/operations/public-contract";
import { readNativeDemoProgress, resetNativeDemoProgress } from "./demo-progress-store";
import { Action, Divider, Label, layout, StatePanel, textWith, usePublic } from "./ui";

type Content<View extends PublicDemoContent["kind"]> = Extract<PublicDemoContent, { kind: View }>;

export function DemoProgressView({ data, search }: { data: Content<"progress">; search: string }) {
  const { locale, copy: { demo } } = usePublic();
  const { baseline } = data;
  const { courseId, revision } = baseline;
  const [overlay, setOverlay] = useState(() => readNativeDemoProgress(courseId, revision));
  const progress = demoProgress(baseline, overlay);
  const { progress: labels, mastery } = locale === "id" ? idLearning : enLearning;
  const { statistics } = (locale === "id" ? idCourse : enCourse).course;
  const reviewed = progress.history.reduce((total, day) => total + day.flashcardsReviewed, 0);
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

  return <View style={layout.section} testID="public-demo-progress">
    <Label tone="subheading">{statistics.title}</Label>
    <Label live="polite">{textWith(demo.session.materialProgress, { completed: progress.completedMaterials, total: baseline.course.totalMaterials })}</Label>
    <Label>{`${statistics.studyTime} · ${textWith(statistics.minutes, { count: progress.completedMaterials * 12 })}`}</Label>
    <Label>{`${statistics.reviewedCards} · ${reviewed}`}</Label>
    <Label>{`${statistics.streak} · ${baseline.streakDays}`}</Label>
    <Label>{textWith(demo.session.dueCount, { count: progress.dueCount })}</Label>
    <Divider />
    <Label tone="subheading">{demo.session.dailyActivity}</Label>
    {progress.history.slice(0, 5).map((day) => <View key={day.date} style={layout.item}>
      <Label tone="meta">{formatDate.format(new Date(`${day.date}T00:00:00Z`))}</Label>
      <Label>{textWith(demo.session.dailyCounts, {
        materials: day.materialsCompleted, reviews: day.flashcardsReviewed, quizzes: day.quizzesCompleted,
      })}</Label>
    </View>)}
    {!progress.history.length && <StatePanel kind="empty" title={demo.session.noActivity} />}
    <View style={layout.row}>
      <Action id="public-demo-progress-mastery" href={`/demo/mastery${search}`}>{labels.masteryMap}</Action>
      <Action href={`/demo/path${search}`}>{mastery.openPath}</Action>
      {overlay.events.length > 0 && <Action onPress={() => setOverlay(resetNativeDemoProgress(courseId, revision))}>{demo.session.reset}</Action>}
    </View>
  </View>;
}

export function DemoPathView({ data, search }: { data: Content<"path">; search: string }) {
  const { colors, locale } = usePublic();
  const labels = (locale === "id" ? idCourse : enCourse).course.studyPath;
  const [duration, setDuration] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<number | null>(1);
  const count = Number(duration);
  const valid = /^\d+$/.test(duration) && count >= 1 && count <= 60;
  const plan = days === null ? null : planLocalStudyDays(data.steps, days);
  if (!data.steps.length) return <StatePanel kind="empty" title={labels.empty} />;

  const stepRows = (steps: Content<"path">["steps"]) => steps.map((step) =>
    <Action key={step.stepId} href={`/demo/documents${search}`}>
      {`${step.conceptName} · ${textWith(labels.minutesShort, { count: step.estimatedMinutes })}`}
    </Action>
  );

  return <View style={layout.section} testID="public-demo-path">
    <Label>{`${labels.targetDuration} (1-60 ${labels.days})`}</Label>
    <View style={layout.row}>
      <TextInput
        testID="public-demo-path-days"
        accessibilityLabel={`${labels.targetDuration} (1-60 ${labels.days})`}
        keyboardType="number-pad"
        maxLength={2}
        placeholder="7"
        placeholderTextColor={colors.mutedForeground}
        style={{ minWidth: 60, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, borderColor: colors.input, color: colors.foreground }}
        value={duration}
        onChangeText={setDuration}
      />
      <Action id="public-demo-path-create-plan" disabled={!valid} onPress={() => { setDays(count); setOpenDay(1); }}>{labels.createPlan}</Action>
      {plan && <Action id="public-demo-path-roadmap" variant="link" onPress={() => setDays(null)}>{labels.viewRoadmap}</Action>}
    </View>
    {plan ? plan.map((day) => <View key={day.day} style={layout.item}>
      <Action id={`public-demo-path-day-${day.day}`} selected={openDay === day.day} onPress={() => setOpenDay(openDay === day.day ? null : day.day)}>
        {`${textWith(labels.day, { count: day.day })} · ${textWith(labels.minutes, { count: day.totalMinutes })}`}
      </Action>
      {openDay === day.day && stepRows(day.steps)}
    </View>) : <>
      <Label tone="subheading">{data.steps[0].chapterTitle}</Label>
      {stepRows(data.steps)}
    </>}
  </View>;
}

export function DemoMasteryView({ data, search }: { data: Content<"mastery">; search: string }) {
  const { locale } = usePublic();
  const { mastery: labels } = locale === "id" ? idLearning : enLearning;
  const { focus, review } = chooseMasteryFocus(data.groups);
  const [open, setOpen] = useState<string | null>(focus?.chapter.id ?? null);
  if (!focus) return <View style={layout.section}>
    <StatePanel kind="empty" title={labels.emptyTitle} description={labels.emptyDescription} />
    <Action href={`/demo/path${search}`}>{labels.openPath}</Action>
  </View>;

  return <View style={layout.section} testID="public-demo-mastery">
    <Label tone="subheading">{review ? labels.review : labels.strong}</Label>
    <Label>{focus.topic.conceptName}</Label>
    <Label tone="meta">{textWith(labels.score, { score: focus.score })}</Label>
    <Action id="public-demo-mastery-path" href={`/demo/path${search}`} variant="default">{labels.openPath}</Action>
    <Divider />
    <Label tone="subheading">{labels.chapters}</Label>
    {data.groups.map(({ chapter, concepts }) => <View key={chapter.id} style={layout.item}>
      <Action selected={open === chapter.id} onPress={() => setOpen(open === chapter.id ? null : chapter.id)}>{chapter.title}</Action>
      {open === chapter.id && concepts.map((concept) => <View key={concept.conceptName} style={layout.item}>
        <Label>{concept.conceptName}</Label>
        <Label tone="meta">{`${textWith(labels.score, { score: concept.masteryScore })} · ${labels[concept.trend]}`}</Label>
      </View>)}
    </View>)}
  </View>;
}

export function DemoTryoutListView({ data, search }: { data: Content<"tryout-list">; search: string }) {
  const { locale, colors } = usePublic();
  const { exam } = data;
  const { quizList, tryoutList } = locale === "id" ? idLearning : enLearning;
  const details = locale === "id"
    ? `${exam.questionCount} soal · ${exam.timeLimitMinutes} menit · Maks. ${exam.maximumAttempts} percobaan`
    : `${exam.questionCount} questions · ${exam.timeLimitMinutes} min · Up to ${exam.maximumAttempts} attempts`;
  return <View style={[layout.panel, { borderColor: colors.border }]} testID="public-demo-tryout-list">
    <Label tone="subheading">{exam.title}</Label>
    <Label tone="meta">{quizList.free}</Label>
    <Label>{details}</Label>
    <Action id="public-demo-tryout-start" href={`/demo/tryout${search}`} variant="default">{tryoutList.start}</Action>
  </View>;
}
