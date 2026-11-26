import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { ActivityIndicator, View } from "react-native";
import { tryoutGradeNotesLimit, type TryoutGradeEditor } from "../../../../../packages/academic/tryout-grade";
import {
  parseGrade,
  readAnswers,
  TutorDataError,
  type TutorAnalytics,
  type TutorConcept,
  type TutorCourse,
  type TutorDashboard as DashboardData,
  type TutorDataSource,
  type TutorGrade,
  type TutorGrading as GradingData,
  type TutorSubmission,
} from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { AcademicScreenProps } from "../contracts";
import { Choices, DashboardEmpty, DashboardRow, DashboardSection, Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout } from "./ui";

type Navigation = Pick<AcademicScreenProps, "theme" | "navigate" | "back">;

function courseRoute(course: TutorCourse) {
  return `/tutor/${encodeURIComponent(course.courseId)}`;
}

const sessionDateFormat = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

export function TutorDashboard({ navigate, theme, data }: Navigation & { data: DashboardData }) {
  const openSchedule = () => navigate("/tutor/schedule");
  const openTickets = () => navigate("/tutor/schedule?tab=tickets");
  const hasPendingTickets = data.counts.pendingTickets > 0;

  return <TutorPage theme={theme} title="Dashboard pengajar" dashboard>
    <View style={tutorLayout.dashboardSections}>
      <DashboardSection theme={theme} icon="sessions" title="Sesi berikutnya"
        count={`${data.counts.sessionsThisWeek} sesi pekan ini`}
        scheduleLink={{ label: "Semua jadwal", onPress: openSchedule }}>
        {data.upcomingSessions.map((session, index) => {
          const date = displayDate(session.sessionDate, "Tanggal belum ditentukan", sessionDateFormat);
          const time = [session.startTime, session.endTime].flatMap((value) => value ? [value.slice(0, 5)] : []).join("-");
          const mode = session.mode === "online" ? "Daring" : session.mode === "offline" ? "Tatap muka" : undefined;
          return <DashboardRow key={session.id} theme={theme} divider={index > 0}
            title={session.courseTitle || session.topic || "Sesi tutorial"}
            subtitle={[session.groupName || "Kelompok", mode].filter(Boolean).join(" · ")}
            date={date} time={time} onPress={openSchedule}
          />;
        })}
        {data.upcomingSessions.length === 0 ? <DashboardEmpty theme={theme} icon="clock" title="Belum ada sesi mendatang" onAddSlot={openSchedule} /> : null}
      </DashboardSection>
      <DashboardSection theme={theme} icon="teaching" title="Pengajaran"
        count={`${data.counts.courses} mata kuliah · ${data.counts.activeGroups} kelompok aktif`}>
        {data.courses.map((course, index) => (
          <DashboardRow key={course.courseId} testID={`tutor-course-${course.courseId}`} theme={theme} title={course.title} divider={index > 0}
            subtitle={`${course.groupCount} kelompok terkait`}
            courseCode={course.code && !course.code.toLowerCase().startsWith("legacy-") ? course.code : undefined}
            course
            onPress={() => navigate(courseRoute(course))}
          />
        ))}
        {data.courses.length === 0 ? <DashboardEmpty theme={theme} icon="teaching" title="Belum ada mata kuliah" description="Penugasan mata kuliah tutor dikelola oleh admin." /> : null}
      </DashboardSection>
      <DashboardSection theme={theme} icon="attention" title="Perlu perhatian"
        count={hasPendingTickets ? `${data.counts.pendingTickets} tiket menunggu` : undefined}
        scheduleLink={hasPendingTickets ? { label: "Semua tiket jadwal", onPress: openTickets } : undefined}>
        {data.pendingTickets.slice(0, 5).map((ticket, index) => <DashboardRow key={ticket.id} theme={theme} divider={index > 0}
          title={ticket.type === "cancellation" ? "Permintaan pembatalan" : "Permintaan penjadwalan ulang"}
          subtitle={ticket.reason} onPress={openTickets}
        />)}
        {data.pendingTickets.length === 0 ? <DashboardEmpty theme={theme} icon="check" title="Tidak ada tiket menunggu" /> : null}
      </DashboardSection>
    </View>
    <View style={tutorLayout.cluster}>
      <Button theme={theme} variant="ghost" style={tutorLayout.sectionLink} onPress={() => navigate("/tutor/discussions")}>Diskusi</Button>
      <Button theme={theme} variant="ghost" style={tutorLayout.sectionLink} onPress={() => navigate("/tutor/docs")}>Dokumentasi</Button>
    </View>
  </TutorPage>;
}

const courseActions = [
  ["participants", "Peserta dan kelompok"],
  ["discussions", "Diskusi"],
  ["materials", "Dokumen"],
  ["videos", "Video"],
  ["quizzes", "Kuis"],
  ["quizzes/grading", "Penilaian kuis"],
  ["live", "Kuis langsung"],
  ["tryouts", "Tryout"],
  ["grading", "Penilaian tryout"],
] as const;

export function TutorCourseOverview({ course, theme, back, navigate, source }: Navigation & { course: TutorCourse; source: TutorDataSource }) {
  return <TutorPage theme={theme} title={course.title} subtitle={course.code ?? undefined} onBack={back}>
    <View>
      <Heading theme={theme} title="Kelas" count={`${course.groupCount} kelompok aktif`} />
      {courseActions.map(([path, label]) => (
        <Row key={path} testID={`tutor-course-action-${path.replaceAll("/", "-")}`} theme={theme} title={label} onPress={() => navigate(`${courseRoute(course)}/${path}`)} />
      ))}
    </View>
    {source.analytics ? <CourseAnalytics theme={theme} courseId={course.courseId} analytics={source.analytics} refresh={source.refreshAnalytics} /> : null}
  </TutorPage>;
}

function CourseAnalytics({ theme, courseId, analytics, refresh }: {
  theme: Navigation["theme"];
  courseId: string;
  analytics: NonNullable<TutorDataSource["analytics"]>;
  refresh?: TutorDataSource["refreshAnalytics"];
}) {
  const [data, setData] = useState<TutorAnalytics>();
  const [concept, setConcept] = useState<TutorConcept>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load() {
      try {
        if (revision && refresh) await refresh(courseId, signal);
        const result = await analytics(courseId, signal);
        if (!signal.aborted) setData(result);
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof TutorDataError && [401, 403, 404].includes(error.status)) {
          setData(undefined);
          setError("Akses analitik ditolak.");
        } else {
          setError("Analitik gagal dimuat.");
        }
      } finally {
        if (!signal.aborted) setBusy(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [analytics, courseId, refresh, revision]);

  const other = data?.allConcepts.filter((entry) =>
    !data.weakConcepts.some((priority) => priority.conceptName === entry.conceptName),
  ) ?? [];
  const concepts = [...(data?.weakConcepts ?? []), ...(showOther ? other : [])];
  return <View style={tutorLayout.group}>
    <Heading theme={theme} title="Analitik" />
    <Button theme={theme} variant="outline" isLoading={busy} style={tutorLayout.action} onPress={() => {
      setBusy(true);
      setError("");
      setRevision((current) => current + 1);
    }}>{error ? "Coba lagi" : "Muat ulang analitik"}</Button>
    {error ? <Label theme={theme} tone="error">{error}</Label> : null}
    {!data && busy ? <ActivityIndicator accessibilityLabel="Memuat analitik" /> : null}
    {data ? <>
      <Row theme={theme} title="Peserta terdaftar" meta={String(data.enrolledCount)} />
      <Row theme={theme} title="Aktif pekan ini" meta={String(data.activeCount)} />
      <Heading theme={theme} title="Konsep prioritas" />
      {concepts.length > 0 ? concepts.map((entry) => <Row key={entry.conceptName} theme={theme}
        title={entry.conceptName} subtitle={`${entry.studentCount} siswa`}
        meta={String(entry.avgMastery)} onPress={() => setConcept(entry)}
      />) : <Empty theme={theme} title="Data konsep belum mencukupi" />}
      {other.length > 0 ? <Button theme={theme} variant="ghost" style={tutorLayout.action}
        accessibilityState={{ expanded: showOther }} onPress={() => setShowOther((current) => !current)}
      >{showOther ? "Sembunyikan konsep lain" : `${other.length} konsep lain`}</Button> : null}
      <Heading theme={theme} title="Intervensi aktif" />
      {data.interventionCounts.length ? data.interventionCounts.map((entry) =>
        <Row key={entry.conceptName} theme={theme} title={entry.conceptName} meta={String(entry.count)} />,
      ) : <Empty theme={theme} title="Belum ada intervensi aktif" />}
    </> : null}
    {concept ? <TutorDetail theme={theme} title={concept.conceptName} onBack={() => setConcept(undefined)}>
      <Row theme={theme} title="Rata-rata penguasaan" meta={String(concept.avgMastery)} />
      <Heading theme={theme} title="Distribusi penguasaan" count={`${concept.studentCount} siswa`} />
      <Row theme={theme} title="Rendah" meta={String(concept.bucketLow)} />
      <Row theme={theme} title="Sedang" meta={String(concept.bucketMid)} />
      <Row theme={theme} title="Tinggi" meta={String(concept.bucketHigh)} />
    </TutorDetail> : null}
  </View>;
}

const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const submissionDateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });

function displayDate(value: string | null, fallback: string, format = dateFormat) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? fallback : format.format(date);
}

type GradeTab = "pending" | "graded" | "all";
type GradeDraft = { score: string; notes: string };
const gradingTypes: Record<string, string> = { multiple_choice: "Pilihan ganda", multiple_choices: "Pilihan ganda kompleks", short_answer: "Jawaban singkat", essay: "Esai" };
const gradingStatus = { completed: "Selesai", pending_review: "Menunggu penilaian", graded: "Sudah dinilai", late: "Terlambat" };

export function TutorGrading({ theme, back, data, onSave, editor, reload }: Navigation & {
  data: GradingData;
  onSave?: (submissionId: string, grade: TutorGrade) => Promise<void>;
  editor?: TryoutGradeEditor;
  reload?: (signal: AbortSignal) => Promise<GradingData>;
}) {
  const [tab, setTab] = useState<GradeTab>("pending");
  const [active, setActive] = useState<TutorSubmission | null>(null);
  const [drafts, setDrafts] = useState<Record<string, GradeDraft>>({});
  const [saved, setSaved] = useState<Record<string, TutorGrade>>({});
  const [refreshed, setRefreshed] = useState<GradingData>();
  const [refreshError, setRefreshError] = useState(false);
  const [notice, setNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const [conflictedSubmission, setConflictedSubmission] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [feedbackExpanded, setFeedbackExpanded] = useState(false);
  const savingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const courseId = data.course.courseId;
  const submissions = (refreshed ?? data).submissions.map((submission) => {
    const grade = saved[submission.id];
    return grade ? { ...submission, score: grade.score, teacherNotes: grade.notes, status: "graded" as const } : submission;
  });
  const pending = submissions.filter((submission) => submission.status === "pending_review" || submission.status === "late" || editor?.pending(courseId, submission.id));
  const graded = submissions.filter((submission) => submission.status === "graded");
  const items = { pending, graded, all: submissions }[tab];
  const awaiting = active ? editor?.pending(courseId, active.id) : undefined;
  const stored = active ? editor?.draft(courseId, active.id) : undefined;
  const draft = active ? awaiting ? { score: String(awaiting.score), notes: awaiting.notes }
    : drafts[active.id] ?? stored ?? { score: active.score?.toString() ?? "", notes: active.teacherNotes ?? "" } : null;
  const outdated = Boolean(!awaiting && stored && active?.reviewRevision !== stored.expectedRevision);
  const blocked = Boolean(active && conflictedSubmission === active.id);
  const canSave = Boolean(onSave || (editor && active?.reviewRevision));
  const answers = active ? readAnswers(active) : [];

  function closeReview() {
    if (savingRef.current) return;
    setSaveError("");
    setActive(null);
  }

  function changeDraft(next: GradeDraft) {
    if (!active) return;
    setDrafts((previous) => ({ ...previous, [active.id]: next }));
    if (active.reviewRevision && editor) {
      editor.changeDraft(courseId, active.id, { ...next, expectedRevision: active.reviewRevision });
    }
  }

  function clearDraft(id: string) {
    editor?.changeDraft(courseId, id);
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
  }

  async function refresh(signal: AbortSignal, activeId?: string) {
    if (!reload) return;
    try {
      const result = await reload(signal);
      if (signal.aborted) return;
      setRefreshed(result);
      setSaved({});
      setRefreshError(false);
      if (activeId) {
        clearDraft(activeId);
        setActive(result.submissions.find((submission) => submission.id === activeId) ?? null);
        setConflictedSubmission(undefined);
        setSaveError("");
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof TutorDataError && [401, 403, 404].includes(error.status)) {
        setActive(null);
        setRefreshed({ ...data, submissions: [] });
        setSaved({});
        setNotice("Akses penilaian ditolak.");
        return;
      }
      if (activeId) setSaveError("Nilai terbaru gagal dimuat. Coba lagi.");
      else setRefreshError(true);
    }
  }

  async function refreshQueue(activeId?: string) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await refresh(controller.signal, activeId);
    } finally {
      savingRef.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  async function publish() {
    if (!active || !canSave || !draft || savingRef.current || blocked || outdated) return;
    const score = parseGrade(draft.score);
    if (score === null) {
      setSaveError("Masukkan nilai 0 sampai 100.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    const controller = new AbortController();
    controllerRef.current = controller;
    const { signal } = controller;
    try {
      const grade = { score, notes: draft.notes };
      if (editor && active.reviewRevision) {
        const result = await editor.publish(courseId, active.id, awaiting ?? { ...grade, expectedRevision: active.reviewRevision }, randomUUID(), signal);
        if (signal.aborted) return;
        if (result.status !== "saved") {
          if (result.status === "denied") {
            clearDraft(active.id);
            setActive(null);
            setRefreshed({ ...data, submissions: [] });
            setSaved({});
            setNotice("Akses penilaian ditolak.");
            return;
          }
          if (result.status === "conflict") setConflictedSubmission(active.id);
          setSaveError({
            invalid: "Periksa nilai dan catatan tutor.",
            conflict: "Penilaian telah berubah. Muat nilai terbaru.",
            unknown: "Pengiriman nilai belum terkonfirmasi. Coba kirim lagi.",
          }[result.status]);
          return;
        }
      } else {
        await onSave?.(active.id, grade);
        if (!signal.aborted) setSaved((previous) => ({ ...previous, [active.id]: grade }));
      }
      if (signal.aborted) return;
      clearDraft(active.id);
      setNotice("Nilai berhasil disimpan.");
      setActive(null);
      if (editor) await refresh(signal);
    } catch {
      if (!signal.aborted) setSaveError("Nilai belum tersimpan. Coba simpan lagi.");
    } finally {
      savingRef.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }

  return <>
    <TutorPage theme={theme} title="Penilaian tryout" subtitle={data.course.title} onBack={back}>
      {notice ? <Label theme={theme} tone="strong">{notice}</Label> : null}
      {refreshError ? <View style={tutorLayout.group}>
        <Label theme={theme} tone="error">Antrean gagal diperbarui.</Label>
        <Button theme={theme} variant="outline" style={tutorLayout.action} isLoading={saving} onPress={() => refreshQueue()}>Muat ulang antrean</Button>
      </View> : null}
      <Choices theme={theme} label="Filter penilaian tryout" value={tab} change={setTab} tabBar
        options={[["pending", `Perlu dinilai (${pending.length})`], ["graded", `Sudah dinilai (${graded.length})`], ["all", "Semua"]]} />
      {items.length === 0
        ? <Empty theme={theme} title={tab === "pending" && submissions.length ? "Semua pengumpulan sudah dinilai" : tab === "graded" ? "Belum ada nilai" : "Belum ada pengumpulan"} />
        : <View>{items.map((submission) => (
          <Row key={submission.id} testID={`tutor-submission-${submission.id}`} theme={theme} title={submission.examTitle}
            subtitle={`${submission.studentName ?? "Siswa"} · ${displayDate(submission.submittedAt, "Tanggal belum tercatat", submissionDateFormat)}`}
            meta={submission.score == null ? undefined : `${submission.score}%`}
            onPress={() => {
              if (savingRef.current) return;
              setFeedbackExpanded(false);
              setNotice("");
              setActive(submission);
            }}
          >
            <Label theme={theme} tone="muted">{editor?.pending(courseId, submission.id) ? "Pengiriman belum dikonfirmasi" : gradingStatus[submission.status]}</Label>
          </Row>
        ))}</View>}
    </TutorPage>
    {active && draft ? <TutorDetail
      theme={theme} title={active.examTitle} subtitle={active.studentName ?? "Siswa"} onBack={closeReview}
      footer={canSave ? <>
        {saveError ? <Label theme={theme} tone="error">{saveError}</Label> : null}
        {outdated || (blocked && !saveError) ? <Label theme={theme} tone="error">Penilaian telah berubah. Muat nilai terbaru.</Label> : null}
        {feedbackExpanded ? <Input theme={theme} accessibilityLabel="Catatan tutor" placeholder="Catatan tutor"
          multiline maxLength={tryoutGradeNotesLimit} value={draft.notes} editable={!saving && !awaiting && !blocked && !outdated}
          onChangeText={(notes) => changeDraft({ ...draft, notes })} /> : null}
        <View style={tutorLayout.cluster}>
          <Input theme={theme} accessibilityLabel="Nilai akhir" placeholder="0-100" inputMode="numeric" style={{ width: 76, minHeight: 44 }}
            value={draft.score} editable={!saving && !awaiting && !blocked && !outdated} onChangeText={(score) => changeDraft({ ...draft, score })} />
          <Button theme={theme} variant="outline" style={tutorLayout.action}
            accessibilityState={{ expanded: feedbackExpanded }} onPress={() => setFeedbackExpanded((value) => !value)}>Catatan tutor</Button>
          {blocked || outdated
            ? <Button theme={theme} style={tutorLayout.action} isLoading={saving} onPress={() => refreshQueue(active.id)}>Muat nilai terbaru</Button>
            : <Button theme={theme} style={tutorLayout.action} isLoading={saving} onPress={publish}>
              {awaiting ? "Coba kirim lagi" : "Simpan dan terbitkan"}
            </Button>}
        </View>
      </> : undefined}
    >
      {answers.map((answer, index) => <Row key={answer.id} theme={theme}
        title={`${index + 1}. ${gradingTypes[answer.type] ?? "Soal"}`}
      >
        <Label theme={theme}>{answer.prompt}</Label>
        {answer.options.map((option, optionIndex) => (
          <Label key={optionIndex} theme={theme} tone={option.chosen || option.correct ? "strong" : "body"}>
            {`${String.fromCharCode(65 + optionIndex)}. ${option.label}${option.chosen ? " · Dipilih" : ""}${option.correct ? " · Kunci" : ""}`}
          </Label>
        ))}
        {answer.options.length === 0 ? <Label theme={theme} tone="muted">{answer.text || answer.fileName || "Tidak dijawab"}</Label> : null}
        {answer.accepted.length ? <Label theme={theme} tone="muted">Kunci {answer.accepted.join(", ")}</Label> : null}
      </Row>)}
      {answers.length === 0 ? <Empty theme={theme} title="Jawaban tidak tersedia" /> : null}
      {!canSave && active.teacherNotes ? <Row theme={theme} title="Catatan tutor" subtitle={active.teacherNotes} /> : null}
    </TutorDetail> : null}
  </>;
}
