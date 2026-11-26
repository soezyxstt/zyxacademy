import { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { ActivityIndicator, View } from "react-native";
import { tryoutGradeNotesLimit, type TryoutGradeEditor } from "../../../../../packages/academic/tryout-grade";
import {
  filterGroups,
  filterParticipants,
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
  type TutorParticipant,
  type TutorParticipants as ParticipantsData,
  type TutorSubmission,
} from "../../../../../packages/native-parity/academic/tutor/model";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { AcademicScreenProps } from "../contracts";
import { Choices, Empty, Heading, Label, Row, TutorDetail, TutorPage, tutorLayout } from "./ui";

type Navigation = Pick<AcademicScreenProps, "theme" | "navigate" | "back">;

function courseRoute(course: TutorCourse) {
  return `/tutor/${encodeURIComponent(course.courseId)}`;
}

const sessionDateFormat = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

export function TutorDashboard({ navigate, theme, data }: Navigation & { data: DashboardData }) {
  return <TutorPage theme={theme} title="Dashboard pengajar" sectionGap={28}>
    <View>
      <Heading theme={theme} title="Sesi berikutnya" count={`${data.counts.sessionsThisWeek} sesi pekan ini`} inline />
      <Button theme={theme} variant="ghost" style={tutorLayout.sectionLink} accessibilityLabel="Semua jadwal" onPress={() => navigate("/tutor/schedule")}>Semua jadwal ↗</Button>
      {data.upcomingSessions.map((session) => {
        const sessionDate = new Date(session.sessionDate ?? "");
        const date = Number.isNaN(sessionDate.valueOf()) ? "Tanggal belum ditentukan" : sessionDateFormat.format(sessionDate);
        const time = [session.startTime, session.endTime].flatMap((value) => value ? [value.slice(0, 5)] : []).join("-");
        const mode = session.mode === "online" ? "Daring" : session.mode === "offline" ? "Tatap muka" : undefined;
        return <Row key={session.id} theme={theme}
          title={session.courseTitle ?? session.topic ?? "Sesi tutorial"}
          subtitle={[session.groupName ?? "Kelompok", mode].filter(Boolean).join(" · ")}
          meta={[date, time].filter(Boolean).join("\n")}
          onPress={() => navigate("/tutor/schedule")}
        />;
      })}
      {data.upcomingSessions.length === 0 ? <Empty theme={theme} title="Belum ada sesi mendatang" /> : null}
    </View>
    <View>
      <Heading theme={theme} title="Pengajaran" count={`${data.counts.courses} mata kuliah · ${data.counts.activeGroups} kelompok aktif`} inline />
      {data.courses.map((course) => (
        <Row key={course.courseId} testID={`tutor-course-${course.courseId}`} theme={theme} title={course.title}
          subtitle={`${course.groupCount} kelompok terkait`}
          titleMeta={course.code && !course.code.toLowerCase().startsWith("legacy-") ? course.code : undefined}
          indicator="↗"
          onPress={() => navigate(courseRoute(course))}
        />
      ))}
      {data.courses.length === 0 ? <Empty theme={theme} title="Belum ada mata kuliah" description="Penugasan mata kuliah tutor dikelola oleh admin." /> : null}
    </View>
    <View>
      <Heading theme={theme} title="Perlu perhatian" count={`${data.counts.pendingTickets} tiket menunggu`} inline />
      <Button theme={theme} variant="ghost" style={tutorLayout.sectionLink} accessibilityLabel="Semua tiket jadwal" onPress={() => navigate("/tutor/schedule?tab=tickets")}>Semua jadwal ↗</Button>
      {data.pendingTickets.map((ticket) => <Row key={ticket.id} theme={theme}
        title={ticket.type === "cancellation" ? "Permintaan pembatalan" : "Permintaan penjadwalan ulang"}
        subtitle={ticket.reason} onPress={() => navigate("/tutor/schedule?tab=tickets")}
      />)}
      {data.pendingTickets.length === 0 ? <Empty theme={theme} title="Tidak ada tiket menunggu" /> : null}
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

const enrollmentFilters = [
  ["all", "Semua akses"],
  ["direct", "Langsung"],
  ["group", "Kelompok"],
  ["both", "Langsung dan kelompok"],
] as const;

const accessNames = { direct: "Langsung", group: "Kelompok", both: "Langsung dan kelompok" };
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const submissionDateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jakarta" });

function displayDate(value: string | null, fallback: string, format = dateFormat) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? fallback : format.format(date);
}

export function TutorParticipants({ theme, back, data, query }: Navigation & { data: ParticipantsData; query: AcademicScreenProps["query"] }) {
  const [tab, setTab] = useState<"people" | "groups">(query.tab === "groups" ? "groups" : "people");
  const [access, setAccess] = useState<(typeof enrollmentFilters)[number][0]>("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<TutorParticipant | null>(null);
  const participants = filterParticipants(data.participants, search, access);
  const groups = filterGroups(data.groups, search);
  return <><TutorPage theme={theme} title="Peserta dan kelompok" subtitle={data.course.title} onBack={back}>
    <Choices theme={theme} label="Peserta dan kelompok" value={tab} change={setTab} tabBar
      options={[["people", `Peserta (${data.participants.length})`], ["groups", `Kelompok belajar (${data.groups.length})`]]}
    />
    <Input theme={theme} accessibilityLabel="Cari peserta atau kelompok" placeholder="Cari peserta atau kelompok"
      value={search} onChangeText={setSearch} style={tutorLayout.input} />
    {tab === "people" ? <>
      <Choices theme={theme} label="Filter jenis akses" options={enrollmentFilters} value={access} change={setAccess} />
      {participants.length === 0
        ? <Empty theme={theme} title={data.participants.length ? "Peserta tidak ditemukan" : "Belum ada peserta aktif"}
          description={data.participants.length ? "Ubah kata kunci atau filter akses." : undefined} />
        : <View>{participants.map((participant) => (
          <Row key={participant.userId} testID={`tutor-participant-${participant.userId}`}
            theme={theme} title={participant.name} subtitle={participant.email} onPress={() => setActive(participant)}>
            <Label theme={theme} tone="muted">{accessNames[participant.enrollmentType]}</Label>
            {participant.groups.map((group) =>
              <Label key={group.id} theme={theme} tone="muted">{group.name}{group.role === "leader" ? " (Ketua)" : ""}</Label>,
            )}
            <View style={[tutorLayout.cluster, { alignItems: "flex-start" }]}>
              <View style={tutorLayout.participantMeta}>
                <Label theme={theme} tone="muted">Terdaftar sejak</Label>
                <Label theme={theme} tone="muted">{displayDate(participant.enrolledAt, "Belum tercatat")}</Label>
              </View>
              <View style={tutorLayout.participantMeta}>
                <Label theme={theme} tone="muted">Masa berlaku</Label>
                <Label theme={theme} tone="muted">{displayDate(participant.expiresAt, "Aktif semester ini")}</Label>
              </View>
            </View>
          </Row>
        ))}</View>}
    </> : (
      groups.length === 0
        ? <Empty theme={theme} title={data.groups.length ? "Kelompok tidak ditemukan" : "Belum ada kelompok aktif"} />
        : <View>{groups.map((group) => (
          <Row key={group.id} theme={theme} title={group.name} subtitle={group.packageName} meta={`${group.membersCount} anggota`}>
            <Label theme={theme} tone="muted">{group.usedQuotaSessions}/{group.totalQuotaSessions} sesi digunakan</Label>
            {group.members.map((member) => <Label key={member.userId} theme={theme}>
              {member.name}{member.role === "leader" ? " (Ketua)" : ""}
            </Label>)}
          </Row>
        ))}</View>
    )}
  </TutorPage>
  {active ? <TutorDetail theme={theme} title={active.name} subtitle={active.email} onBack={() => setActive(null)}>
    <Row theme={theme} title="Jenis akses" subtitle={accessNames[active.enrollmentType]} />
    <Row theme={theme} title="Terdaftar sejak" subtitle={displayDate(active.enrolledAt, "Belum tercatat")} />
    <Row theme={theme} title="Masa berlaku" subtitle={displayDate(active.expiresAt, "Aktif semester ini")} />
    <Heading theme={theme} title="Kelompok" count={String(active.groups.length)} />
    {active.groups.map((group) => <Row key={group.id} theme={theme} title={group.name} subtitle={group.role === "leader" ? "Ketua" : "Anggota"} />)}
    {active.groups.length === 0 ? <Empty theme={theme} title="Belum bergabung dalam kelompok" /> : null}
  </TutorDetail> : null}
  </>;
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
