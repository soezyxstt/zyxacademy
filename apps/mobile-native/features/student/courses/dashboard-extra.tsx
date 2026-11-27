import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { nativeColors, nativeLinkInks } from "../../../../../packages/design-tokens/native-colors";
import { coursePath, learningEndpoint, type DashboardExtrasData } from "../../../../../packages/native-parity/student/courses/contract";
import studentCourseEn from "../../../../../messages/en/studentCourse.json";
import studentCourseId from "../../../../../messages/id/studentCourse.json";
import { Button } from "../../../components/Button";
import { Checkbox } from "../../../components/Checkbox";
import { nativeTypography } from "../../../typography";
import { StudentListRow } from "../ListRow";
import type { StudentRequest } from "../contracts";
import { matchStudentRoute } from "../routes";
import type { CourseCopy } from "./copy";
import { countLabel, dashboardMessages, DashboardSectionHeading } from "./dashboard-overview";
import { DashboardLink } from "./dashboard-link";
import { RankArtwork } from "./RankArtwork";
import { NavigationIcon, type NavigationIconName } from "../../shared-ui/navigation-icons";

type Theme = keyof typeof nativeColors;
type PaneProps = { copy: CourseCopy; theme: Theme; locale: string; navigate(path: string): void };
type ExtrasState = { data?: DashboardExtrasData; failed?: boolean };
const extrasPath = learningEndpoint({ view: "dashboard-extras" });

export function useDashboardExtras(request: StudentRequest, enabled: boolean) {
  const [state, setState] = useState<ExtrasState>({});
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      const response = await request(extrasPath, { signal: controller.signal });
      try {
        if (!response.ok) {
          if ([401, 403, 409].includes(response.status)) {
            if (!controller.signal.aborted) setState({});
            return;
          }
          throw new Error("Supplemental dashboard data unavailable");
        }
        const result = await response.json() as Partial<DashboardExtrasData>;
        if (result?.view !== "dashboard-extras") throw new Error("Invalid supplemental dashboard data");
        if (!controller.signal.aborted) setState({ data: result as DashboardExtrasData });
      } finally { response.dispose?.(); }
    })().catch(() => {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, failed: true }));
    });
    return () => controller.abort();
  }, [request, enabled, revision]);
  return { ...(enabled ? state : {}), reload: () => setRevision(value => value + 1) };
}

function Panel({ title, theme, icon, meta, children }: {
  title: string; theme: Theme; icon?: NavigationIconName; meta?: ReactNode; children: ReactNode;
}) {
  return <View style={styles.panel}>
    <DashboardSectionHeading title={title} theme={theme} icon={icon} meta={meta} />
    {children}
  </View>;
}

function Info({ theme, children, alert = false }: { theme: Theme; children: ReactNode; alert?: boolean }) {
  return <Text accessibilityLiveRegion={alert ? "polite" : undefined} accessibilityRole={alert ? "alert" : undefined}
    style={[styles.info, { color: alert ? nativeColors[theme].destructive : nativeColors[theme].mutedForeground }]}>
    {children}
  </Text>;
}

function LinkRow({ theme, navigate, path, title, subtitle }: Pick<PaneProps, "theme" | "navigate"> & { path: string; title: string; subtitle?: string }) {
  const primary = matchStudentRoute(path) ? { onPress: () => navigate(path), role: "link" as const } : undefined;
  return <StudentListRow theme={theme} title={title} subtitle={subtitle} primary={primary} />;
}

function useDashboardMutation(request: StudentRequest) {
  const busy = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function mutate(id: string, path: string, body?: object) {
    if (busy.current) return false;
    busy.current = true;
    const operation = new AbortController();
    controller.current = operation;
    setPending(id);
    setFailed(false);
    try {
      const response = await request(path, {
        method: "POST",
        signal: operation.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      try {
        if (!response.ok) throw new Error("Dashboard operation unavailable");
        const result = await response.json() as { ok?: boolean; success?: boolean };
        if (result.ok !== true && result.success !== true) throw new Error("Dashboard operation unconfirmed");
        return !operation.signal.aborted;
      } finally { response.dispose?.(); }
    } catch {
      if (!operation.signal.aborted) setFailed(true);
      return false;
    } finally {
      busy.current = false;
      if (!operation.signal.aborted) setPending(null);
      if (controller.current === operation) controller.current = null;
    }
  }
  return { pending, failed, mutate };
}

function Today({ today, request, ...props }: PaneProps & { today: NonNullable<DashboardExtrasData["today"]>; request: StudentRequest }) {
  const { copy, theme, locale } = props;
  const [locallyDone, setLocallyDone] = useState<ReadonlySet<string>>(new Set());
  const mutation = useDashboardMutation(request);
  const doneCount = today.items.filter(({ id, done }) => done || locallyDone.has(id)).length;
  const count = new Intl.NumberFormat(locale);
  if (!today.items.length && !today.streak) return null;
  return <Panel title={copy.studyPlan} theme={theme}>
    {today.streak > 0 ? <Info theme={theme}>{`${count.format(today.streak)} ${copy.streakDays}`}</Info> : null}
    {today.items.length > 0 ? (
      doneCount === today.items.length ? <Info theme={theme}>{copy.planComplete}</Info> : <>
        <Info theme={theme}>{`${doneCount}/${today.items.length} ${copy.completed.toLocaleLowerCase(locale)}`}</Info>
        {today.items.map(item => {
          const done = item.done || locallyDone.has(item.id);
          return <View key={item.id} style={styles.task}>
            <Checkbox theme={theme} checked={done} disabled={done || mutation.pending !== null}
              accessibilityLabel={`${done ? copy.completed : copy.markDone}, ${item.title}`}
              accessibilityState={{ busy: mutation.pending === item.id }}
              onCheckedChange={value => {
                if (value === true) void mutation.mutate(item.id, "/api/student/today/complete", { itemId: item.id })
                  .then(success => { if (success) setLocallyDone(previous => new Set([...previous, item.id])); });
              }} />
            <View style={styles.taskLink}>
              <LinkRow {...props} path={item.href} title={item.title} subtitle={item.count !== undefined ? count.format(item.count) : undefined} />
            </View>
          </View>;
        })}
      </>
    ) : null}
    {mutation.failed ? <Info theme={theme} alert>{copy.actionError}</Info> : null}
  </Panel>;
}

function Intervention({ intervention, request, ...props }: PaneProps & { intervention: NonNullable<DashboardExtrasData["intervention"]>; request: StudentRequest }) {
  const { copy, theme, locale } = props;
  const [hidden, setHidden] = useState(false);
  const mutation = useDashboardMutation(request);
  if (hidden) return null;
  const { id, courseId, concept, reason, materialHref, quizHref, flashcards } = intervention;
  return <Panel title={`${copy.reviewPrompt} ${concept}`} theme={theme}>
    <Info theme={theme}>{reason}</Info>
    <LinkRow {...props} path={materialHref} title={copy.readMaterials} />
    <LinkRow {...props} path={quizHref} title={copy.practice} />
    <LinkRow {...props} path={`${coursePath(courseId)}/flashcard`} title={copy.flashcard}
      subtitle={flashcards === null ? undefined : new Intl.NumberFormat(locale).format(flashcards)} />
    <Button theme={theme} variant="ghost" isLoading={mutation.pending === id} style={styles.action}
      onPress={() => void mutation.mutate(id, `/api/student/interventions/${encodeURIComponent(id)}/dismiss`).then(success => { if (success) setHidden(true); })}>
      {copy.closeIntervention}
    </Button>
    {mutation.failed ? <Info theme={theme} alert>{copy.actionError}</Info> : null}
  </Panel>;
}

export function DashboardTop({ data, request, ...props }: PaneProps & { data?: DashboardExtrasData; request: StudentRequest }) {
  if (!data) return null;
  const { copy, locale, theme, navigate } = props;
  const colors = nativeColors[theme];
  const count = new Intl.NumberFormat(locale);
  const { today, achievements, intervention } = data;
  const xp = achievements ? `${count.format(achievements.xp)} XP` : "";
  const lp = achievements ? `${count.format(achievements.lp)} LP` : "";
  return <>
    {intervention ? <Intervention key={intervention.id} {...props} request={request} intervention={intervention} /> : null}
    {today ? <Today {...props} request={request} today={today} /> : null}
    {achievements ? <DashboardLink theme={theme} label={`${copy.achievements}, ${achievements.rank}, ${xp}, ${lp}`}
      testID="student-dashboard-achievements" onPress={() => navigate("/achievements")}
      style={[styles.achievements, { borderBottomColor: colors.border }]}>
      <RankArtwork rank={achievements.rank} size={56} />
      <View style={styles.achievementLabels}>
        <Text style={[styles.achievementHeading, { color: colors.foreground }]}>{copy.achievements}</Text>
        <View style={styles.achievementValues}>
          <Text style={[styles.achievementRank, { color: colors.foreground }]}>{achievements.rank}</Text>
          <Text style={[styles.achievementValue, styles.separated, { color: colors.mutedForeground, borderLeftColor: colors.border }]}>{xp}</Text>
          <Text style={[styles.achievementValue, styles.separated, { color: colors.mutedForeground, borderLeftColor: colors.border }]}>{lp}</Text>
        </View>
      </View>
      <NavigationIcon name="chevron-right" size={16} color={colors.mutedForeground} />
    </DashboardLink> : null}
  </>;
}

export function DashboardBottom({ state, ...props }: PaneProps & { state: ExtrasState & { reload(): void } }) {
  const { copy, theme, locale } = props;
  const colors = nativeColors[theme];
  const { assessments, mastery, reviews, reflection } = state.data ?? {};
  const count = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const messages = dashboardMessages(locale);
  const masteryMessages = (locale.startsWith("en") ? studentCourseEn : studentCourseId).course.dashboardWeakConcepts;
  const masteryMeasured = mastery?.concepts.some(item => item.measured);
  const reviewCourseId = reviews?.courseId;
  return <>
    {reviews ? <Panel theme={theme} title={messages.spacedRepetition} icon="layers" meta={
      <View style={styles.status}>
        <View style={[styles.dot, { backgroundColor: reviews.due ? nativeLinkInks.warning : nativeLinkInks.success }]} />
        <Text style={[styles.statusText, { color: colors.foreground }]}>{reviews.due ? countLabel(messages.cardsDue, reviews.due, locale) : messages.allCardsDone}</Text>
      </View>
    }>
      {reviewCourseId ? <Button theme={theme} size="sm" wrapLabel style={styles.reviewButton} labelStyle={{ textAlign: "left" }}
        renderIcon={(color, size) => <NavigationIcon name="arrow-right" color={color} size={size} />} iconPosition="end" variant={reviews.due ? "default" : "outline"} accessibilityRole="link"
        onPress={() => props.navigate(`${coursePath(reviewCourseId)}/flashcard`)}>
        {reviews.courseTitle ? (reviews.due ? messages.startFlashcardReviewCourse : messages.openFlashcardCollectionCourse).replace("{courseTitle}", reviews.courseTitle)
          : reviews.due ? messages.startFlashcardReview : messages.openFlashcardCollection}
      </Button> : null}
      {reviews.recent.length > 0 ? <Info theme={theme}>{copy.recentReviews}</Info> : null}
      {reviews.recent.map(item => <StudentListRow key={item.id} theme={theme} title={item.front}
        subtitle={`${item.courseTitle} · ${date.format(new Date(item.reviewedAt))}`}
        metadata={[{ id: "grade", label: locale.startsWith("en") ? "Grade" : "Nilai", value: count.format(item.grade) }]} />)}
    </Panel> : null}
    {assessments ? <Panel theme={theme} title={messages.availableAssessments} icon="clipboard" meta={
      assessments.total > 0 && <Info theme={theme}>{countLabel(messages.examCount, assessments.total, locale)}</Info>
    }>
      {assessments.total === 0 && <View style={styles.inlineEmpty}>
        <NavigationIcon name="circle-check" size={16} color={nativeLinkInks.success} />
        <Text style={[styles.emptyLabel, { color: colors.mutedForeground }]}>{messages.allExamsDone}</Text>
      </View>}
      {assessments.items.map(item => <LinkRow key={item.id} {...props} title={item.title} subtitle={`${item.courseTitle} · ${copy[item.type]}`}
        path={`${coursePath(item.courseId)}/${item.type}/${encodeURIComponent(item.id)}`} />)}
      {assessments.total > assessments.items.length && assessments.items[0] ? <LinkRow {...props} title={copy.moreAssessments}
        path={`${coursePath(assessments.items[0].courseId)}/quiz`} /> : null}
    </Panel> : null}
    {mastery ? <Panel theme={theme} icon="target" title={masteryMessages.title.replace("{courseTitle}", mastery.title)}>
      {masteryMeasured ? mastery.concepts.map(item => <StudentListRow key={item.name} theme={theme} title={item.name}
        subtitle={item.measured ? `${item.score}%` : copy.masteryUnavailable} />) : <View style={styles.masteryEmpty}>
        <NavigationIcon name="target" size={24} color={`${colors.mutedForeground}80`} />
        <Text style={[styles.achievementRank, { color: colors.foreground }]}>{masteryMessages.noData}</Text>
        <Text style={[styles.info, styles.masteryHint, { color: colors.mutedForeground }]}>{masteryMessages.noDataDescription}</Text>
      </View>}
      <DashboardLink label={messages.fullMasteryMap} theme={theme} testID="student-dashboard-mastery"
        onPress={() => props.navigate(`${coursePath(mastery.courseId)}/mastery`)} style={styles.masteryLink}>
        <Text style={[styles.statusText, { color: colors.mutedForeground }]}>{messages.fullMasteryMap}</Text>
        <NavigationIcon name="arrow-up-right" size={14} color={colors.mutedForeground} />
      </DashboardLink>
    </Panel> : null}
    {reflection ? <LinkRow {...props} path="/profile/reflections" title={copy.weeklyReflection}
      subtitle={[
        reflection.weekStart,
        reflection.masteryGrowth > 0 ? `+${count.format(reflection.masteryGrowth)} ${copy.mastery.toLocaleLowerCase(locale)}` : null,
        `${count.format(reflection.modules)} ${copy.materi.toLocaleLowerCase(locale)}`,
        `${count.format(reflection.flashcards)} ${copy.flashcard.toLocaleLowerCase(locale)}`,
        `${count.format(reflection.quizzes)} ${copy.quiz.toLocaleLowerCase(locale)}`,
        reflection.mostImproved,
      ].filter(Boolean).join(" · ")} /> : null}
    {state.failed || state.data?.partial ? <View style={styles.panel}>
      <Info theme={theme} alert>{copy.extraError}</Info>
      <Button theme={theme} variant="outline" style={styles.action} onPress={state.reload}>{copy.retry}</Button>
    </View> : null}
  </>;
}

const styles = StyleSheet.create({
  panel: { gap: 10, marginTop: 14 },
  inlineEmpty: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  emptyLabel: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, flexShrink: 1, includeFontPadding: false },
  status: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  statusText: { ...nativeTypography.bodySemibold, fontSize: 12, lineHeight: 18, flexShrink: 1, includeFontPadding: false },
  dot: { width: 8, height: 8, borderRadius: 4 },
  reviewButton: { height: "auto", minHeight: 32, paddingVertical: 6 },
  info: { fontSize: 12, lineHeight: 18, ...nativeTypography.bodyRegular, includeFontPadding: false },
  achievements: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 76, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  achievementLabels: { flex: 1, minWidth: 0, gap: 4 },
  achievementHeading: { ...nativeTypography.headingBold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  achievementValues: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  separated: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 10 },
  achievementRank: { ...nativeTypography.bodySemibold, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  achievementValue: { ...nativeTypography.bodyRegular, fontSize: 14, lineHeight: 20, includeFontPadding: false },
  masteryEmpty: { alignItems: "center", gap: 4, paddingVertical: 16, paddingHorizontal: 12 },
  masteryHint: { textAlign: "center", maxWidth: 320 },
  masteryLink: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, minHeight: 32 },
  task: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 4 },
  taskLink: { flex: 1, minWidth: 0 },
  action: { alignSelf: "flex-start", minHeight: 44 },
});
