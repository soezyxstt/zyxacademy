import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { StyleSheet, View } from "react-native";
import enTutor from "../../../../../messages/en/tutor.json";
import idTutor from "../../../../../messages/id/tutor.json";
import { formatQuestionSourceCitation } from "../../../../../lib/asesmen/question-provenance";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { StaffQuestionContent } from "../StaffQuestionContent";
import type { TutorLiveAction, TutorLiveData, TutorLiveHost, TutorLiveRoom, TutorLiveSelection } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { createLiveQuizSocketHook, liveOptionDistribution, type LiveQuizState } from "../../../../../packages/native-parity/student/learning/live-socket";
import { Button } from "../../../components/Button";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";
import { SharedDialog } from "../../shared-ui";
import { Picker } from "../courses/ui";
import { tutorLiveSocketUrl } from "./live-client";
import { Empty, Heading, Label, Row, tutorLayout, type TutorTheme } from "./ui";

const useLiveSocket = createLiveQuizSocketHook({ useCallback, useEffect, useRef, useState });
const accessDenied = (error: unknown) => error instanceof TutorDataError && [401, 403].includes(error.status);

type HostProps = { host: TutorLiveHost; courseId: string; theme: TutorTheme };

export function TutorLiveHostPanel({ data, refresh, ...props }: HostProps & { data: TutorLiveData; refresh(): void }) {
  const { suspended } = useProtectedInteraction();
  if (suspended) return null;
  return <HostPanel {...props} data={data} refresh={refresh} />;
}

function HostPanel({ host, courseId, data, theme, refresh }: HostProps & { data: TutorLiveData; refresh(): void }) {
  const { canInteract } = useProtectedInteraction();
  const [room, setRoom] = useState<TutorLiveRoom | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "opening" | "check-error" | "open-error" | "source-missing" | "denied">("checking");
  const [selected, setSelected] = useState<TutorLiveSelection>();
  const problems = data.codingProblems ?? [];
  const selectedCoding = selected && "codingProblem" in selected ? selected.codingProblem : undefined;
  const selectedProblem = selectedCoding && problems.find(problem => problem.problemId === selectedCoding.problemId && problem.version === selectedCoding.version);
  const selectedTemplate = selected && "templateId" in selected ? data.templates.find(template => template.id === selected.templateId) : undefined;
  const hasSelection = Boolean(selectedProblem || selectedTemplate);
  const problemKey = (problem: { problemId: string; version: number }) => JSON.stringify([problem.problemId, problem.version]);
  const request = useRef<AbortController | null>(null);
  useStaffChromeVisibility({ hideBottom: Boolean(room) });

  const check = useCallback(async (sessionId?: string) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRoom(null);
    setStatus("checking");
    try {
      let active = await host.resume(courseId, sessionId, controller.signal);
      if (!active && sessionId && !controller.signal.aborted) active = await host.resume(courseId, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setRoom(active);
      setStatus("ready");
    } catch (error) {
      if (!controller.signal.aborted) setStatus(accessDenied(error) ? "denied" : "check-error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [courseId, host]);

  useEffect(() => {
    void check();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [check]);

  async function open() {
    if (!canInteract() || request.current || status !== "ready" || !selected || !hasSelection) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus("opening");
    try {
      const active = await host.create(courseId, selected, randomUUID(), controller.signal);
      if (controller.signal.aborted) return;
      setRoom(active);
      setStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (accessDenied(error)) setStatus("denied");
      else if (selectedCoding && error instanceof TutorDataError && [404, 409].includes(error.status)) {
        setSelected(undefined);
        setStatus("source-missing");
      } else setStatus("open-error");
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  if (status === "denied") return <Empty theme={theme} title="Akses kuis langsung ditolak" />;
  if (room) return <HostRoom key={room.id} {...{ host, courseId, theme, room }}
    recheck={() => check(room.id)} lostAccess={() => { setRoom(null); setStatus("denied"); }}
    finished={() => check()} />;
  if (status === "checking") return <Label theme={theme} tone="muted">Memeriksa sesi</Label>;
  if (status === "check-error" || status === "open-error") return <>
    <Label theme={theme} tone="error">{status === "open-error" ? "Status ruang tunggu belum terkonfirmasi." : "Status sesi gagal dimuat."}</Label>
    <Button theme={theme} variant="outline" style={tutorLayout.action} onPress={() => { if (canInteract()) void check(); }}>Periksa sesi</Button>
  </>;
  const ready = status === "ready" || status === "source-missing";
  return <>
    {status === "source-missing" ? <Label theme={theme} tone="error">Versi soal Python tidak tersedia. Muat ulang daftar atau pilih soal lain.</Label> : null}
    {data.templates.length ? <>
      <Heading theme={theme} title="Kuis terbit" count={String(data.templates.length)} />
      {data.templates.map((template) => <Row key={template.id} theme={theme} title={template.title}
        meta={selectedTemplate?.id === template.id ? "Dipilih" : undefined} onPress={() => {
          if (!canInteract() || !ready) return;
          setStatus("ready");
          setSelected({ templateId: template.id });
        }} />)}
    </> : null}
    {problems.length ? <Picker label="Soal Python terbit" testID="tutor-live-coding-picker" disabled={!ready}
      selected={selectedProblem ? problemKey(selectedProblem) : ""}
      options={problems.map(problem => ({ id: problemKey(problem), label: `${problem.title} · Versi ${problem.version}` }))}
      onSelect={key => {
        if (!canInteract() || !ready) return;
        const problem = problems.find(item => problemKey(item) === key);
        if (!problem) return;
        setStatus("ready");
        setSelected({ codingProblem: { problemId: problem.problemId, version: problem.version } });
      }} /> : null}
    {selectedProblem ? <Label theme={theme} tone="muted">5 menit, tanpa batas percobaan. Petunjuk tersedia dan skor terbaik dipakai.</Label> : null}
    {data.templates.length || problems.length ? <Button theme={theme} style={tutorLayout.action} testID="tutor-live-open-room" onPress={open}
      disabled={!hasSelection || !ready} isLoading={status === "opening"}>Buka ruang tunggu</Button> : <Empty theme={theme} title="Belum ada kuis atau soal Python terbit" />}
    <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={status === "opening"} onPress={() => {
      if (canInteract() && !request.current) refresh();
    }}>Muat ulang</Button>
  </>;
}

const commandLabel: Record<TutorLiveAction, string> = {
  start: "Mulai kuis",
  reveal: "Tampilkan jawaban",
  next: "Soal berikutnya",
  end: "Akhiri kuis",
};

function HostRoom({ host, courseId, theme, room, recheck, lostAccess, finished }: HostProps & {
  room: TutorLiveRoom;
  recheck(): void;
  lostAccess(): void;
  finished(): void;
}) {
  const { canInteract } = useProtectedInteraction();
  const [pending, setPending] = useState<{ phase: string; index: number | undefined } | null>(null);
  const [checkNeeded, setCheckNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const request = useRef<AbortController | null>(null);
  const reconnect = useRef<AbortController | null>(null);

  const refreshUrl = useCallback(async () => {
    if (!canInteract()) return null;
    const controller = new AbortController();
    reconnect.current = controller;
    try {
      const active = await host.resume(courseId, room.id, controller.signal);
      if (controller.signal.aborted) return null;
      if (!active) setUnavailable(true);
      return active ? tutorLiveSocketUrl(active) : null;
    } catch (error) {
      if (controller.signal.aborted) return null;
      if (accessDenied(error)) { lostAccess(); return null; }
      throw error;
    } finally {
      reconnect.current = null;
    }
  }, [canInteract, courseId, host, lostAccess, room.id]);

  const { state, synchronized } = useLiveSocket(tutorLiveSocketUrl(room), refreshUrl, false);
  const phase = state.sessionState;
  const round = state.currentQuestion;
  const coding = room.kind === "coding" || Boolean(round?.coding);
  const label = (action: TutorLiveAction) => {
    if (coding && action === "start") return "Mulai sesi Python";
    if (coding && action === "reveal") return "Tampilkan hasil";
    if (coding && action === "end") return "Akhiri sesi";
    return commandLabel[action];
  };
  const waiting = pending?.phase === phase && pending.index === round?.questionIndex;
  const connected = synchronized && state.connectionStatus === "connected";
  const ready = connected && !waiting && !busy;
  const nextAction = phase === "lobby" ? "start" : phase === "question" && round ? "reveal"
    : phase === "reveal" && round && round.questionIndex + 1 < room.questionCount ? "next" : undefined;

  useEffect(() => () => {
    request.current?.abort();
    reconnect.current?.abort();
  }, []);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setCheckNeeded(true), 8_000);
    return () => clearTimeout(timer);
  }, [pending, waiting]);

  async function run(action: TutorLiveAction) {
    if (!canInteract() || !ready || request.current || (action !== nextAction && action !== "end") || phase === "ended") return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setConfirmEnd(false);
    setCheckNeeded(false);
    setPending({ phase, index: round?.questionIndex });
    try {
      await host.control(courseId, room.id, action, randomUUID(), controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (accessDenied(error)) lostAccess();
      else setCheckNeeded(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const board = phase === "ended" ? state.finalBoard : state.top10;
  return <>
    <Heading theme={theme} title={phase === "ended" ? coding ? "Sesi Python selesai" : "Kuis selesai" : phase === "lobby" ? coding ? "Ruang tunggu Python" : "Ruang tunggu" : "Sesi berlangsung"}
      count={connected && phase === "lobby" ? `${state.participantCount} peserta` : undefined} />
    {phase !== "ended" ? <Row theme={theme} title="Kode gabung" meta={room.code} /> : null}
    {unavailable ? <Label theme={theme} tone="muted">Sesi tidak lagi aktif.</Label> : null}
    {phase !== "ended" && !connected && !unavailable ? <Label theme={theme} tone="muted">Menghubungkan ke sesi</Label> : null}
    {round && phase !== "ended" && connected ? <HostRound theme={theme} locale={host.locale ?? "id"} round={round}
      questionCount={room.questionCount} coding={coding} state={state} /> : null}
    {(connected || phase === "ended") && board.length ? <View>
      <Heading theme={theme} title="Peringkat" />
      {board.map((entry) => <Row key={entry.userId} theme={theme} title={`${entry.rank}. ${entry.name}`} meta={String(entry.score)} />)}
    </View> : null}
    {waiting && checkNeeded ? <Label theme={theme} tone="error">Perubahan sesi belum terkonfirmasi.</Label> : null}
    {phase !== "ended" && (!connected || (waiting && checkNeeded)) ? <Button theme={theme} variant="outline"
      style={tutorLayout.action} disabled={busy} onPress={() => { if (canInteract()) recheck(); }}>{unavailable ? "Kembali ke kuis" : "Periksa koneksi"}</Button> : null}
    {nextAction ? <Button theme={theme} style={tutorLayout.action} disabled={!ready} onPress={() => run(nextAction)}>{label(nextAction)}</Button> : null}
    {phase !== "ended" ? <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={!ready}
      onPress={() => { if (canInteract() && ready && !request.current) setConfirmEnd(true); }}>{label("end")}</Button>
      : <Button theme={theme} style={tutorLayout.action} onPress={finished}>Kembali ke kuis</Button>}
    <SharedDialog theme={theme} title={`${label("end")}?`} open={confirmEnd && ready} closeLabel="Batal" onDismiss={() => setConfirmEnd(false)}>
      <Button theme={theme} style={tutorLayout.action} testID="tutor-live-confirm-end" onPress={() => run("end")}>{label("end")}</Button>
    </SharedDialog>
  </>;
}

function HostRound({ theme, locale, round, questionCount, coding, state }: {
  theme: TutorTheme;
  locale: "id" | "en";
  round: NonNullable<LiveQuizState["currentQuestion"]>;
  questionCount: number;
  coding: boolean;
  state: LiveQuizState;
}) {
  const colors = nativeColors[theme];
  const copy = (locale === "en" ? enTutor : idTutor).live;
  const active = state.sessionState === "question";
  const citation = formatQuestionSourceCitation(round.origin, round.sourceEventName, locale);
  const total = round.total || questionCount;
  const distribution = liveOptionDistribution(state.answerCounts, state.totalAnswered, round.options.length);
  const answered = copy.answeredProgress.replace("{answered}", String(state.totalAnswered)).replace("{total}", String(state.totalParticipants));
  return <View style={tutorLayout.group}>
    <Heading theme={theme} title={copy.questionProgress.replace("{current}", String(round.questionIndex + 1)).replace("{total}", String(total))}
      count={active ? `${state.countdown} ${locale === "en" ? "sec" : "dtk"}` : undefined} />
    {active ? <View testID="tutor-live-answered"><Label theme={theme} tone="muted">{coding
      ? locale === "en" ? `${state.totalAnswered} of ${state.totalParticipants} submitted`
        : `${state.totalAnswered} dari ${state.totalParticipants} peserta mengumpulkan`
      : answered}</Label></View> : null}
    <StaffQuestionContent role="tutor" theme={theme} locale={locale} source={round.prompt} />
    {round.options.map((option, index) => <View key={index} style={[styles.option, { borderColor: colors.border }]} testID={`tutor-live-option-${index}`}>
      <View style={styles.optionLine}>
        <Label theme={theme} tone="muted">{String.fromCharCode(65 + index)}.</Label>
        <View style={{ flex: 1 }}>
          <StaffQuestionContent role="tutor" theme={theme} locale={locale} source={option} />
        </View>
        {active ? <Label theme={theme} tone="muted">{`${distribution[index].count} (${distribution[index].percent}%)`}</Label>
          : index === state.revealCorrectIndex ? <Label theme={theme} tone="strong">{locale === "en" ? "Correct answer" : "Jawaban benar"}</Label> : null}
      </View>
      {active ? <View style={[styles.bar, { backgroundColor: colors.muted }]} accessible={false}>
        <View style={[styles.bar, { backgroundColor: colors.primary, width: `${distribution[index].percent}%` }]} />
      </View> : null}
    </View>)}
    {citation ? <View testID="tutor-live-source"><Label theme={theme} tone="muted">{citation}</Label></View> : null}
  </View>;
}

const styles = StyleSheet.create({
  option: { paddingVertical: 8, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  optionLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bar: { height: 4, overflow: "hidden", borderRadius: 4 },
});
