import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { View } from "react-native";
import type { TutorLiveAction, TutorLiveData, TutorLiveHost, TutorLiveRoom } from "../../../../../packages/academic/tutor-support";
import { TutorDataError } from "../../../../../packages/native-parity/academic/tutor/model";
import { createLiveQuizSocketHook } from "../../../../../packages/native-parity/student/learning/live-socket";
import { Button } from "../../../components/Button";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useStaffChromeVisibility } from "../../../routing/staff-chrome-visibility";
import { SharedDialog } from "../../shared-ui";
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
  const [status, setStatus] = useState<"checking" | "ready" | "opening" | "check-error" | "open-error" | "denied">("checking");
  const [selected, setSelected] = useState<string>();
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
    if (!canInteract() || request.current || status !== "ready" || !selected) return;
    const controller = new AbortController();
    request.current = controller;
    setStatus("opening");
    try {
      const active = await host.create(courseId, selected, randomUUID(), controller.signal);
      if (controller.signal.aborted) return;
      setRoom(active);
      setStatus("ready");
    } catch (error) {
      if (!controller.signal.aborted) setStatus(accessDenied(error) ? "denied" : "open-error");
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
  return <>
    <Heading theme={theme} title="Kuis terbit" count={String(data.templates.length)} />
    {data.templates.map((template) => <Row key={template.id} theme={theme} title={template.title}
      meta={selected === template.id ? "Dipilih" : undefined} onPress={() => { if (canInteract() && status === "ready") setSelected(template.id); }} />)}
    {data.templates.length ? <Button theme={theme} style={tutorLayout.action} onPress={open}
      disabled={!selected} isLoading={status === "opening"}>Buka ruang tunggu</Button> : <Empty theme={theme} title="Belum ada kuis terbit" />}
    <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={status === "opening"} onPress={refresh}>Muat ulang</Button>
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
    <Heading theme={theme} title={phase === "ended" ? "Kuis selesai" : phase === "lobby" ? "Ruang tunggu" : "Sesi berlangsung"}
      count={connected && phase === "lobby" ? `${state.participantCount} peserta` : undefined} />
    {phase !== "ended" ? <Row theme={theme} title="Kode gabung" meta={room.code} /> : null}
    {unavailable ? <Label theme={theme} tone="muted">Sesi tidak lagi aktif.</Label> : null}
    {phase !== "ended" && !connected && !unavailable ? <Label theme={theme} tone="muted">Menghubungkan ke sesi</Label> : null}
    {round && phase !== "ended" && connected ? <View style={tutorLayout.group}>
      <Heading theme={theme} title={`Soal ${round.questionIndex + 1} dari ${room.questionCount}`} count={phase === "question" ? `${state.countdown} dtk` : undefined} />
      <Label theme={theme}>{round.prompt}</Label>
      {round.options.map((option, index) => <Row key={index} theme={theme} title={option}
        meta={phase === "reveal" && index === state.revealCorrectIndex ? "Jawaban benar"
          : phase === "question" && state.answerCounts[index] !== undefined ? String(state.answerCounts[index]) : undefined} />)}
    </View> : null}
    {(connected || phase === "ended") && board.length ? <View>
      <Heading theme={theme} title="Peringkat" />
      {board.map((entry) => <Row key={entry.userId} theme={theme} title={`${entry.rank}. ${entry.name}`} meta={String(entry.score)} />)}
    </View> : null}
    {waiting && checkNeeded ? <Label theme={theme} tone="error">Perubahan sesi belum terkonfirmasi.</Label> : null}
    {phase !== "ended" && (!connected || (waiting && checkNeeded)) ? <Button theme={theme} variant="outline"
      style={tutorLayout.action} disabled={busy} onPress={() => { if (canInteract()) recheck(); }}>{unavailable ? "Kembali ke kuis" : "Periksa koneksi"}</Button> : null}
    {nextAction ? <Button theme={theme} style={tutorLayout.action} disabled={!ready} onPress={() => run(nextAction)}>{commandLabel[nextAction]}</Button> : null}
    {phase !== "ended" ? <Button theme={theme} variant="outline" style={tutorLayout.action} disabled={!ready}
      onPress={() => { if (canInteract() && ready && !request.current) setConfirmEnd(true); }}>{commandLabel.end}</Button>
      : <Button theme={theme} style={tutorLayout.action} onPress={finished}>Kembali ke kuis</Button>}
    <SharedDialog theme={theme} title="Akhiri kuis?" open={confirmEnd && ready} closeLabel="Batal" onDismiss={() => setConfirmEnd(false)}>
      <Button theme={theme} style={tutorLayout.action} testID="tutor-live-confirm-end" onPress={() => run("end")}>{commandLabel.end}</Button>
    </SharedDialog>
  </>;
}
