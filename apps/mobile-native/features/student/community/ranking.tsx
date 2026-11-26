import { useRef, useState, type ComponentRef } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { nativeTypography } from "../../../typography";
import { NavigationIcon } from "../../shared-ui/navigation-icons";
import { RankingRowView } from "./ranking-row";
import { Button } from "../../../components/Button";
import { NavigationTabs, SharedPopover } from "../../shared-ui";
import { PKA_COURSE_ID } from "../../../../../lib/pka-config";
import { formatCourseLeaderboardDuration } from "../../../../../lib/student/course-leaderboard";
import type { AcademicRanking, CourseRanking, LeaderboardPage, RankingRow } from "../../../../../packages/native-parity/student/community/contracts";
import { courseCopy } from "../courses/copy";
import { coursePath } from "../../../../../packages/native-parity/student/courses/contract";
import { studentPathWithQuery } from "../routes";
import { Action, Actions, Choices, Copy, Page, Remote, Row, Rows, communityPath, describeError, styles, useCommunity, useRemote } from "./ui";

function identityPath(publicId: string) { return `/students/${encodeURIComponent(publicId)}`; }

function AcademicRows({ rows }: { rows: RankingRow[] }) {
  const { tr, session, navigate } = useCommunity();
  const number = new Intl.NumberFormat(session.locale);
  if (!rows.length) return <Copy kind="muted">{tr("Belum ada hasil yang diperingkat.", "No ranked results yet.")}</Copy>;
  return <Rows>{rows.map(row => <Row key={row.rank} title={`#${row.rank} ${row.name}${row.isSelf ? tr(" (Anda)", " (You)") : ""}`}
    meta={`${number.format(row.attempts)} ${tr("percobaan", "attempts")}`} aside={number.format(row.average)}
    onPress={row.identity ? () => navigate(identityPath(row.identity!.publicId)) : undefined} />)}</Rows>;
}

function AcademicBoard() {
  const { tr, route, navigate } = useCommunity();
  const state = useRemote<AcademicRanking>(communityPath("academic-ranking", { course: route.query.course }));
  return <Remote state={state}>{data => <>
    {data.courses.length > 0 ? <Choices value={data.courseId ?? ""} options={[
      { value: "", label: tr("Semua kelas", "All classes") }, ...data.courses.map(course => ({ value: course.id, label: course.title })),
    ]} onSelect={course => navigate(course ? `/leaderboard?tab=academic&course=${encodeURIComponent(course)}` : "/leaderboard?tab=academic")} />
      : <Copy kind="muted">{tr("Belum ada kursus yang diikuti.", "You are not enrolled in a course yet.")}</Copy>}
    {data.boards.map(board => <View key={board.course.id} style={styles.block}><Copy kind="heading">{board.course.title}</Copy>
      <AcademicRows rows={board.rows} /></View>)}
  </>}</Remote>;
}

function ParticipationBoard() {
  const { tr, route, session, navigate, replace, colors } = useCommunity();
  const period = route.query.period ?? "all";
  const scope = route.query.scope ?? "global";
  const cursor = route.query.cursor;
  const state = useRemote<LeaderboardPage>(communityPath("participation-ranking", { period, scope, cursor }));
  const format = new Intl.NumberFormat(session.locale);
  const href = (next?: string) => {
    const query = new URLSearchParams({ period, scope });
    if (next) query.set("cursor", next);
    return `/leaderboard?${query}`;
  };
  const validFilters = ["all", "week", "month"].includes(period) && ["global", "following"].includes(scope);
  return <>
    {!validFilters ? <>
      <Copy kind="error">{tr("Filter tidak valid.", "Invalid filter.")}</Copy>
      <Action label={tr("Atur ulang filter", "Reset filters")} onPress={() => replace("/leaderboard")} />
    </> : <Remote state={state}>{data => <>
      <Text style={[rankingStyles.muted, { color: colors.mutedForeground }]}>{tr("Peringkat berdasarkan XP dasar. XP sama mendapat posisi yang sama.", "Ranked by base XP. Equal XP shares a position.")}</Text>
      {data.ownEntry && <Copy>{tr("Posisi Anda", "Your position")}: {data.ownEntry.position} · {format.format(data.ownEntry.baseXpMicro / 1e6)} XP</Copy>}
      {!data.entries.length && <View style={rankingStyles.empty}>
        <NavigationIcon name="trophy" size={24} color={colors.mutedForeground} />
        <Copy kind="heading">{tr("Belum ada peringkat", "No rankings yet")}</Copy>
      </View>}
      <View>{data.entries.map((row, index) => <RankingRowView key={row.publicId} first={index === 0}
        name={row.displayName} identity={row} position={format.format(row.position)} metric={`${format.format(row.baseXpMicro / 1e6)} XP`} />)}</View>
      <Actions>
        {cursor && <Action label={tr("Halaman pertama", "First page")} onPress={() => navigate(href())} />}
        {data.nextCursor && <Action label={tr("Halaman berikutnya", "Next page")} onPress={() => navigate(href(data.nextCursor!))} />}
      </Actions>
    </>}</Remote>}
  </>;
}

export function LeaderboardScreen() {
  const { tr, theme, colors, route, navigate } = useCommunity();
  const active = route.query.tab === "academic" ? "academic" : "rank";
  const period = route.query.period ?? "all";
  const scope = route.query.scope ?? "global";
  const filtersActive = period !== "all" || scope !== "global";
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchor = useRef<ComponentRef<typeof Pressable>>(null);
  const filterLabel = tr("Filter", "Filters");
  const closeLabel = tr("Tutup", "Close");

  function select(key: "tab" | "period" | "scope", value: string | undefined) {
    navigate(studentPathWithQuery(route.path, { [key]: value, cursor: undefined }));
  }

  return <Page title={tr("Papan peringkat", "Leaderboard")}>
    <NavigationTabs tabs={[{ id: "rank", label: "Rank" }, { id: "academic", label: tr("Akademik", "Academic") }]}
      activeId={active} onTabPress={tab => select("tab", tab === "rank" ? undefined : "academic")}
      accessibilityLabel={tr("Jenis peringkat", "Leaderboard type")} moreLabel={tr("Lainnya", "More")} closeLabel={closeLabel}
      theme={theme} testID="student-ranking-tab" trailing={active === "rank" ? <Button
        ref={filterAnchor} testID="student-ranking-filter" variant="outline" size="icon-sm" theme={theme}
        renderIcon={(color, size) => <View><NavigationIcon name="sliders" size={size} color={color} />
          {filtersActive && <View style={[rankingStyles.filterDot, { backgroundColor: colors.primary, borderColor: colors.background }]} />}
        </View>}
        accessibilityLabel={filtersActive ? tr("Filter, aktif", "Filters, active") : filterLabel}
        accessibilityState={{ expanded: filterOpen }} onPress={() => setFilterOpen(true)} /> : undefined} />
    {active === "academic" ? <AcademicBoard /> : <>
      <SharedPopover anchorRef={filterAnchor} align="end" open={filterOpen} onDismiss={() => setFilterOpen(false)}
        title={filterLabel} closeLabel={closeLabel} theme={theme}>
        <View style={styles.block}>
          <Copy kind="heading">{tr("Periode", "Period")}</Copy>
          <Choices<string> value={period} options={[
            { value: "all", label: tr("Semua waktu", "All time") }, { value: "week", label: tr("Minggu", "Week") },
            { value: "month", label: tr("Bulan", "Month") },
          ]} onSelect={value => { setFilterOpen(false); select("period", value === "all" ? undefined : value); }} />
          <Copy kind="heading">{tr("Cakupan", "Scope")}</Copy>
          <Choices<string> value={scope} options={[
            { value: "global", label: "Global" }, { value: "following", label: tr("Diikuti", "Following") },
          ]} onSelect={value => { setFilterOpen(false); select("scope", value === "global" ? undefined : value); }} />
        </View>
      </SharedPopover>
      <ParticipationBoard />
    </>}
  </Page>;
}

export function CourseLeaderboardScreen() {
  const { focused } = useCommunity();
  return focused === false ? null : <FocusedCourseLeaderboard />;
}

function FocusedCourseLeaderboard() {
  const { route, navigate, session, theme, colors, tr } = useCommunity();
  const id = route.params.id;
  const { height } = useWindowDimensions();
  const type = route.query.type === "simulation" ? "simulation" : "quiz";
  const quizLabel = tr("Kuis", "Quiz");
  const simulationLabel = id === PKA_COURSE_ID ? tr("Simulasi", "Simulation") : "Tryout";
  const assessmentLabel = (type === "quiz" ? quizLabel : simulationLabel).toLowerCase();
  const data = useRemote<CourseRanking>(communityPath("course-ranking", { id, type }));
  const { error } = data;
  const accessDenied = error instanceof Error && "status" in error && error.status === 403
    && "code" in error && error.code === "forbidden";
  const base = `/courses/${encodeURIComponent(id)}/leaderboard`;
  const number = new Intl.NumberFormat(session.locale);
  const percent = new Intl.NumberFormat(session.locale, { style: "percent", maximumFractionDigits: 1 });
  return <Page title={data.data ? `${tr("Peringkat kelas", "Course leaderboard")}: ${data.data.course.title}` : tr("Peringkat kelas", "Course leaderboard")}>
    <NavigationTabs tabs={[{ id: "quiz", label: quizLabel }, { id: "simulation", label: simulationLabel }]}
      activeId={type} onTabPress={value => navigate(`${base}?type=${value}`)}
      accessibilityLabel={tr("Jenis peringkat", "Ranking type")} moreLabel={tr("Lainnya", "More")} closeLabel={tr("Tutup", "Close")}
      theme={theme} testID="student-course-ranking-tab" />
    {accessDenied ? <View style={styles.field} accessibilityLiveRegion="polite">
      <Copy kind="error">{describeError(error, tr)}</Copy>
      <Actions><Action label={courseCopy(session.locale).activation} onPress={() => navigate(coursePath(id))} /></Actions>
    </View> : <Remote state={data}>{board => {
      const rank = board.ownRank === null ? "-" : number.format(board.ownRank);
      const total = number.format(board.totalStudents);
      return <>
        <View style={styles.block}>
          <View style={[rankingStyles.sectionTitle, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" accessibilityLabel={tr("Peringkat Anda", "Your rank")} style={[rankingStyles.sectionLabel, { color: colors.mutedForeground }]}>{tr("Peringkat Anda", "Your rank")}</Text>
          </View>
          <Copy kind="muted">{tr(`Berdasarkan rata-rata skor ${assessmentLabel} dan kriteria pemecah seri.`, `Based on average ${assessmentLabel} score and tie-break criteria.`)}</Copy>
          <View style={rankingStyles.ownRank}><NavigationIcon name="trophy" color={colors.secondary} size={16} />
            <Text style={[rankingStyles.rankValue, { color: colors.foreground }]}>{board.ownRank === null
            ? tr(`- dari ${total} (Belum ada skor ${assessmentLabel})`, `- of ${total} (No ${assessmentLabel} scores yet)`)
            : tr(`${rank} dari ${total}`, `${rank} of ${total}`)}</Text>
          </View>
        </View>
        {board.rows.length > 0 ? <View style={styles.block}>
          <View style={[rankingStyles.sectionTitle, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" accessibilityLabel={tr("3 teratas", "Top 3")} style={[rankingStyles.sectionLabel, { color: colors.mutedForeground }]}>{tr("3 teratas", "Top 3")}</Text>
          </View>
          <View>{board.rows.map((row, index) => {
            const attempts = number.format(row.attempts);
            const duration = formatCourseLeaderboardDuration(row.averageDurationSeconds);
            const hard = number.format(row.correctHardCount);
            const medium = number.format(row.attemptedMediumCount);
            const attemptStats = tr(`${attempts} percobaan ${assessmentLabel} · ${duration}`, `${attempts} ${assessmentLabel} ${row.attempts === 1 ? "attempt" : "attempts"} · ${duration}`);
            const questionStats = tr(`${hard} soal sulit benar · ${medium} soal sedang dikerjakan`, `${hard} difficult questions correct · ${medium} medium questions attempted`);
            return <RankingRowView key={row.identity?.publicId ?? `${row.rank}-${index}`} first={index === 0}
              position={number.format(row.rank)} name={row.name} identity={row.identity} own={row.isSelf}
              details={[attemptStats, questionStats]} metric={percent.format(row.average / 100)} />;
          })}</View>
        </View> : <View style={[rankingStyles.empty, { minHeight: height * 0.45 }]}>
          <NavigationIcon name="trophy" size={40} color={`${colors.mutedForeground}66`} />
          <Copy kind="heading">{tr(`Belum ada peringkat ${assessmentLabel}`, `No ${assessmentLabel} rankings yet`)}</Copy>
          <Copy kind="muted">{type === "simulation" ? tr("Selesaikan tryout untuk masuk peringkat.", "Complete a tryout to appear in the rankings.")
            : tr("Selesaikan kuis untuk masuk peringkat.", "Complete a quiz to appear in the rankings.")}</Copy>
        </View>}
      </>;
    }}</Remote>}
  </Page>;
}

const rankingStyles = StyleSheet.create({
  sectionTitle: { paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionLabel: { ...nativeTypography.headingSemibold, fontSize: 12, lineHeight: 18, letterSpacing: 0.6, textTransform: "uppercase" },
  ownRank: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankValue: { ...nativeTypography.bodySemibold, fontSize: 16, lineHeight: 24, flexShrink: 1, fontVariant: ["tabular-nums"] },
  muted: { ...nativeTypography.bodyRegular, fontSize: 12, lineHeight: 18 },
  filterDot: { position: "absolute", top: -3, right: -3, height: 8, width: 8, borderRadius: 4, borderWidth: 1 },
  empty: { justifyContent: "center", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 36 },
});
