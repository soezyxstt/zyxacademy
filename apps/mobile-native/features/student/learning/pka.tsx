import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { PKA_PATH, courseHref, learningApi, type LearningData, type PkaAnnouncement, type PkaSchedule, type PkaSubject } from "../../../../../packages/native-parity/student/learning/contracts";
import { Button } from "../../../components/Button";
import type { StudentScreenProps } from "../contracts";
import { Body, Copy, Message, Row, Section, english, formatDate, launchWeb, postJson, readJson, styles, type Translate } from "./ui";

type Ready<View extends LearningData["view"]> = Extract<LearningData, { state: "ready"; view: View }>;

const subjects = { matematika: "subjectMathematics", fisika: "subjectPhysics", kimia: "subjectChemistry" };
const pka = "pka.";

function Countdown({ date, t }: { date: string; t: Translate }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  const remaining = Math.max(0, Math.floor((Date.parse(date) - now) / 60_000));
  return <Section title={remaining ? t(pka + "countdownRemaining", {
    days: Math.floor(remaining / 1440), hours: Math.floor(remaining / 60) % 24, minutes: remaining % 60,
  }) : t(pka + "countdownDone")}><Copy muted>{t(pka + "countdownDisclaimer")}</Copy></Section>;
}

function SessionRow({ schedule, props, t }: { schedule: PkaSchedule; props: StudentScreenProps; t: Translate }) {
  const [failed, setFailed] = useState(false);
  return <Row title={schedule.title} detail={formatDate(schedule.sessionAt, props.session.locale)}>
    {schedule.isPast ? <Copy muted>{t(pka + "sessionCompleted")}</Copy> : schedule.meetLink ? <Button
      variant="outline" style={styles.action} onPress={() => setFailed(!launchWeb(props, schedule.meetLink!))}>{t(pka + "joinMeet")}</Button>
      : <Copy muted>{t(pka + "calendarLinkMissing")}</Copy>}
    {failed ? <Message>{t(pka + "meetLinkUnavailable")}</Message> : null}
  </Row>;
}

function Announcement({ announcement, props, t, dismiss }: { announcement: PkaAnnouncement; props: StudentScreenProps; t: Translate; dismiss: () => void }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  async function mark() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setFailed(false);
    try {
      const receipt = await readJson<{ success?: boolean } | null>(props.request, learningApi, postJson({ action: "pka-announcement-read", announcementId: announcement.id }));
      if (receipt?.success !== true) throw new Error("Invalid announcement receipt");
      dismiss();
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return <Row title={announcement.title} detail={formatDate(announcement.createdAt, props.session.locale)} value={announcement.isPinned ? t(pka + "pinned") : undefined}>
    {props.renderAssessmentMarkdown?.(announcement.body, "tutorial-pka") ?? <Body source={announcement.body} />}
    {!announcement.isPinned ? <Button variant="ghost" style={styles.action} isLoading={pending} onPress={() => void mark()}>{t(pka + "markRead")}</Button> : null}
    {failed ? <Message>{t(pka + "markReadFailed")}</Message> : null}
  </Row>;
}

export function PkaHomeContent({ data, props, t }: { data: Ready<"pka-home">; props: StudentScreenProps; t: Translate }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const announcements = data.announcements.filter((item) => !dismissed.has(item.id));
  return <>
    <Countdown date={data.testDate} t={t} />
    {announcements.length ? <Section title={t(pka + "announcements")}>
      {announcements.map((item) => <Announcement key={item.id} announcement={item} props={props} t={t}
        dismiss={() => setDismissed((current) => new Set([...current, item.id]))} />)}
    </Section> : null}
    <Section title={t(pka + "nextSession")}>
      {data.nextSession ? <SessionRow schedule={data.nextSession} props={props} t={t} /> : <Copy muted>{t(pka + "noUpcomingSessions", { count: 6 })}</Copy>}
      <Button variant="outline" style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/jadwal`)}>{t(pka + "allSchedules")}</Button>
    </Section>
    <Section title={t(pka + "examSimulation")}>
      <Copy>{t(pka + "simulationCount", { count: data.simulationCount })}</Copy>
      <Copy muted>{data.completedCount ? t(pka + "completedSummary", { count: data.completedCount, score: data.bestScore }) : t(pka + "notStarted")}</Copy>
      <Button style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/simulasi`)}>{t(pka + (data.completedCount ? "continueSimulation" : "openSimulation"))}</Button>
      <Row title={t(pka + "viewLeaderboard")} onPress={() => props.navigate(`${PKA_PATH}/leaderboard?type=simulation`)} />
      <Row title={t(pka + "reportPageTitle")} onPress={() => props.navigate(`${PKA_PATH}/laporan`)} />
      <Row title={english(props.session.locale) ? "Materials" : "Materi"} onPress={() => props.navigate(`${PKA_PATH}/material`)} />
    </Section>
    <Copy muted>{t(pka + "disclaimer")}</Copy>
  </>;
}

export function PkaScheduleContent({ data, props, t }: { data: Ready<"pka-schedule">; props: StudentScreenProps; t: Translate }) {
  return <Section title={t(pka + "tutorialSessions")}>
    {data.schedules.length ? data.schedules.map((item) => <SessionRow key={item.id} schedule={item} props={props} t={t} />) : <Copy muted>{t(pka + "noSessions")}</Copy>}
  </Section>;
}

const reportStatuses = { not_attempted: "statusNotAttempted", at_risk: "statusAtRisk", borderline: "statusBorderline", solid: "statusSolid" } as const;
const reportDetails = { not_attempted: null, at_risk: "reportAtRisk", borderline: "reportBorderline", solid: "reportSolid" } as const;

export function PkaReportContent({ data, t }: { data: Ready<"pka-report">; t: Translate }) {
  return <Section>
    {data.results.map((item) => {
      const subject = t(pka + subjects[item.subject]);
      const detail = reportDetails[item.status];
      return <Row key={item.subject} title={subject} value={item.bestScore == null ? undefined : t(pka + "bestScore", { score: item.bestScore })}
        detail={t(pka + (item.status === "not_attempted" && item.attempted ? "reportIncomplete" : reportStatuses[item.status]), { subject })}>
        {detail ? <Copy muted>{t(pka + detail, { subject, stage: item.passedAtStage ?? 1 })}</Copy> : null}
      </Row>;
    })}
    <Copy muted>{t(pka + "disclaimer")}</Copy>
  </Section>;
}

export function PkaSimulationContent({ data, props, t }: { data: Ready<"pka-simulation">; props: StudentScreenProps; t: Translate }) {
  return <Section>
    {data.templates.length ? data.templates.map((template) => {
      const attempts = data.attempts.filter((item) => item.templateId === template.id);
      const current = attempts.find((item) => item.status === "in_progress");
      const completed = attempts.filter((item) => item.status === "completed");
      const best = completed.reduce((max, item) => Math.max(max, item.score ?? 0), 0);
      const base = template.stage ? `${PKA_PATH}/simulasi/${template.stage.subject}/${template.stage.number}` : `${PKA_PATH}/quiz/${encodeURIComponent(template.id)}`;
      const href = `${base}${current ? `?attemptId=${encodeURIComponent(current.id)}` : ""}`;
      return <Row key={template.id} title={template.title} detail={template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} ${t(pka + "minutes")}` : t(pka + "noTimeLimit")}
        value={completed.length ? t(pka + "bestScore", { score: best }) : undefined}>
        <Button variant="outline" style={styles.action} disabled={!data.hasFullContentAccess} onPress={() => props.navigate(href)}>
          {t(pka + (!data.hasFullContentAccess ? "locked" : current ? "continueSimulation" : "openSimulation"))}
        </Button>
      </Row>;
    }) : <Copy muted>{t(pka + "noPublishedSimulation")}</Copy>}
  </Section>;
}

export function PkaStageContent({ data, props, t }: { data: Ready<"pka-stage">; props: StudentScreenProps; t: Translate }) {
  const { stage, template, attempt } = data;
  const stagePath = `${PKA_PATH}/simulasi/${encodeURIComponent(props.route.params.subject)}/${stage.stage}`;
  const courseId = "tutorial-pka";
  const quizPath = courseHref(courseId, `/quiz/${encodeURIComponent(template.id)}`);
  if (stage.status === "locked") return <Section title={t(pka + "stageLocked", { stage: stage.stage })}>
    <Copy muted>{t(pka + "completePrevious")}</Copy>
    <Button variant="outline" style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/simulasi`)}>{t(pka + "backToSimulation")}</Button>
  </Section>;
  if (attempt?.status === "completed") {
    const passed = (attempt.score ?? 0) >= stage.passScoreThreshold;
    return <Section title={t(pka + "scoreLabel", { score: attempt.score ?? 0 })}>
      <Copy>{passed ? t(pka + "passedStage") : t(pka + "failedStageThreshold", { threshold: stage.passScoreThreshold })}</Copy>
      <Button variant="outline" style={styles.action} onPress={() => props.navigate(`${quizPath}/summary/${encodeURIComponent(attempt.id)}`)}>{t(pka + "attemptReview")}</Button>
      {!passed && stage.stage < 3 ? <Button style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/simulasi/${encodeURIComponent(props.route.params.subject)}/${stage.stage + 1}`)}>
        {t(pka + "stage", { stage: stage.stage + 1 })}</Button> : null}
      <Button variant="ghost" style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/laporan`)}>{t(pka + "reportPageTitle")}</Button>
    </Section>;
  }
  if (stage.status === "skipped") return <Section title={t(pka + "skipped")}>
    <Button variant="outline" style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/laporan`)}>{t(pka + "reportPageTitle")}</Button>
  </Section>;
  const search = new URLSearchParams({ pkaStage: stagePath });
  if (attempt?.status === "in_progress") search.set("attemptId", attempt.id);
  return <Section>
    <Copy muted>{t(pka + "stageInstructions", { threshold: stage.passScoreThreshold,
      duration: template.timeLimitSeconds ? `${Math.round(template.timeLimitSeconds / 60)} ${t(pka + "minutes")}` : t(pka + "noTimeLimit") })}</Copy>
    <View style={styles.wrap}>
      <Button style={styles.action} onPress={() => props.navigate(`${quizPath}?${search}`)}>{t(pka + (attempt?.status === "in_progress" ? "continueSimulation" : "startSimulation"))}</Button>
      <Button variant="outline" style={styles.action} onPress={() => props.navigate(`${PKA_PATH}/simulasi`)}>{t(pka + "backToSimulation")}</Button>
    </View>
  </Section>;
}

export function pkaStageTitle(subject: string, stage: number, t: Translate) {
  return t(pka + "stageTitle", { subject: t(pka + (subjects[subject as PkaSubject] ?? "pka")), stage });
}
