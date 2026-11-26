import { View } from "react-native";
import type { AcademicRanking, CourseRanking, LeaderboardPage, RankingRow } from "../../../../../packages/native-parity/student/community/contracts";
import { Action, Actions, Choices, Copy, Page, Remote, Row, Rows, communityPath, styles, useCommunity, useRemote } from "./ui";

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
  const { tr, route, session, navigate, replace } = useCommunity();
  const period = route.query.period ?? "all";
  const scope = route.query.scope ?? "global";
  const cursor = route.query.cursor;
  const state = useRemote<LeaderboardPage>(communityPath("participation-ranking", { period, scope, cursor }));
  const format = new Intl.NumberFormat(session.locale, { maximumFractionDigits: 1 });
  const href = (nextPeriod: string, nextScope: string, next?: string) => {
    const query = new URLSearchParams({ period: nextPeriod, scope: nextScope });
    if (next) query.set("cursor", next);
    return `/leaderboard?${query}`;
  };
  const validFilters = ["all", "week", "month"].includes(period) && ["global", "following"].includes(scope);
  return <>
    <Choices<string> value={period} options={[
      { value: "all", label: tr("Sepanjang waktu", "All time") }, { value: "week", label: tr("Minggu ini", "This week") },
      { value: "month", label: tr("Bulan ini", "This month") },
    ]} onSelect={value => navigate(href(value, scope))} />
    <Choices<string> value={scope} options={[
      { value: "global", label: tr("Global", "Global") }, { value: "following", label: tr("Mengikuti", "Following") },
    ]} onSelect={value => navigate(href(period, value))} />
    {!validFilters ? <>
      <Copy kind="error">{tr("Filter tidak valid.", "Invalid filter.")}</Copy>
      <Action label={tr("Atur ulang filter", "Reset filters")} onPress={() => replace("/leaderboard")} />
    </> : <Remote state={state}>{data => <>
      {data.ownEntry && <Row title={tr("Peringkat Anda", "Your ranking")} aside={`#${data.ownEntry.position}`}
        meta={`${format.format(data.ownEntry.baseXpMicro / 1e6)} XP`} />}
      {!data.entries.length && <Copy kind="muted">{tr("Belum ada siswa dalam peringkat ini.", "No students in this ranking yet.")}</Copy>}
      <Rows>{data.entries.map(row => <Row key={row.publicId} title={`#${row.position} ${row.displayName}`}
        meta={row.rankKey} aside={`${format.format(row.baseXpMicro / 1e6)} XP`} onPress={() => navigate(identityPath(row.publicId))} />)}</Rows>
      <Actions>
        {cursor && <Action label={tr("Halaman pertama", "First page")} onPress={() => navigate(href(period, scope))} />}
        {data.nextCursor && <Action label={tr("Berikutnya", "Next")} onPress={() => navigate(href(period, scope, data.nextCursor!))} />}
      </Actions>
    </>}</Remote>}
  </>;
}

export function LeaderboardScreen() {
  const { tr, route, navigate } = useCommunity();
  const active = route.query.tab === "academic" ? "academic" : "rank";
  return <Page title={tr("Papan peringkat", "Leaderboard")}>
    <Choices value={active} options={[{ value: "rank", label: tr("Partisipasi", "Participation") }, { value: "academic", label: tr("Akademik", "Academic") }]}
      onSelect={tab => navigate(tab === "academic" ? "/leaderboard?tab=academic" : "/leaderboard")} />
    {active === "academic" ? <AcademicBoard /> : <ParticipationBoard />}
  </Page>;
}

export function CourseLeaderboardScreen() {
  const { route, navigate, tr } = useCommunity();
  const id = route.params.id;
  const type = route.query.type === "simulation" ? "simulation" : "quiz";
  const data = useRemote<CourseRanking>(communityPath("course-ranking", { id, type }));
  const base = `/courses/${encodeURIComponent(id)}/leaderboard`;
  return <Page title={data.data ? `${tr("Papan peringkat", "Leaderboard")} · ${data.data.course.title}` : tr("Papan peringkat kursus", "Course leaderboard")}>
    <Choices value={type} options={[{ value: "quiz", label: tr("Kuis", "Quiz") },
      { value: "simulation", label: id === "tutorial-pka" ? tr("Simulasi", "Simulation") : "Tryout" }]}
      onSelect={value => navigate(`${base}?type=${value}`)} />
    <Remote state={data}>{board => <AcademicRows rows={board.rows} />}</Remote>
  </Page>;
}
