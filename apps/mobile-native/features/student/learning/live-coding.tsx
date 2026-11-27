import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { executePython } from "../../../../../lib/coding/runtime";
import { createRemotePythonRuntime } from "../../../../../lib/coding/remote-runtime";
import { useNativeSession } from "../../../auth/session-provider";
import { streamNativeZyra } from "../../../network/zyra";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import type { StudentScreenProps } from "../contracts";
import { CourseMarkdown } from "../CourseMarkdown";
import { PythonCodeField, PythonOutput } from "./python-editor";
import {
  codingLocator, liveCodingHelp, liveCodingKey, LiveCodingError, loadLiveCodingHistory, loadLiveProblem, restoreLiveEditor,
  persistLiveEditor, submitLiveCoding, type CodingHistory, type LiveCodingProblem, type LiveCodingScope, type LiveEditor,
} from "./live-coding-contract";
import { Copy, Message, Section, english, styles } from "./ui";

type Work = "run" | "submit" | "history" | "help";

export function NativeLiveCoding({ props, scope, deadline, open }: {
  props: StudentScreenProps; scope: LiveCodingScope; deadline: number; open: boolean;
}) {
  const { request, session, drafts } = props;
  const { transport, getSnapshot, revalidating } = useNativeSession();
  const en = english(session.locale);
  const word = (id: string, english: string) => en ? english : id;
  const [snapshot, setSnapshot] = useState<LiveCodingProblem>();
  const [attempt, reload] = useState(0);
  const [editor, showEditor] = useState<LiveEditor>({ code: "", stdin: "" });
  const draft = useRef(editor);
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<CodingHistory>([]);
  const [work, setWork] = useState<Work>();
  const [output, setOutput] = useState("");
  const [help, setHelp] = useState("");
  const [line, setLine] = useState("");
  const [waiting, setWaiting] = useState(false);
  const input = useRef<((value: string) => void) | null>(null);
  const action = useRef<{ kind: Work; controller: AbortController } | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const key = liveCodingKey(scope);
  const live = useRef({ open, deadline, focused: props.focused !== false });
  live.current = { open, deadline, focused: props.focused !== false };

  const verified = () => {
    const current = getSnapshot();
    return transport && current.transport === transport && transport.isCurrent() && current.state.status === "signed-in" &&
      !current.revalidating && current.state.expiresAt > Date.now() && transport.scope.accountId === session.userId &&
      transport.scope.sessionId === session.sessionId && transport.scope.origin === session.origin && live.current.focused;
  };
  const active = () => !!verified() && live.current.open && Date.now() < live.current.deadline &&
    Boolean(snapshot && Date.now() < snapshot.policy.deadlineMs);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setSnapshot(undefined); setHistory([]); setHelp(""); setOutput(""); setNotice(""); setWork(undefined);
    if (open && props.focused !== false && !revalidating) {
      void Promise.all([loadLiveProblem(request, scope, controller.signal),
        drafts?.get(key).catch(() => null) ?? null]).then(([data, local]) => {
        if (controller.signal.aborted || !verified()) return;
        draft.current = restoreLiveEditor(local, scope) ?? { code: data.problem.starterCode, stdin: "" };
        showEditor(draft.current);
        setSnapshot(data);
        void loadLiveCodingHistory(request, scope, data.problem, controller.signal).then(rows => {
          if (!controller.signal.aborted && verified() && !action.current) setHistory(rows);
        }).catch(() => {});
      }).catch((error: unknown) => {
        if (!controller.signal.aborted && verified()) setNotice(readIssue(error, en));
      });
    }
    return () => { controller.abort(); action.current?.controller.abort(); action.current = null; input.current = null; };
    // The room, question and locator are part of the key. Countdown renders
    // never replace the in-flight HTTP submission.
  }, [key, request, drafts, transport, props.focused, revalidating, attempt]);

  useEffect(() => {
    if (open) return;
    if (action.current?.kind === "run" || action.current?.kind === "help") action.current.controller.abort();
    setHelp("");
  }, [open]);

  function remember(next: LiveEditor) {
    draft.current = next;
    showEditor(next);
  }

  function edit(patch: Partial<Pick<LiveEditor, "code" | "stdin">>) {
    if (!active() || action.current || draft.current.pending) return;
    const previous = draft.current;
    const next = { ...previous, ...patch };
    remember(next);
    setOutput(""); setHelp(""); setNotice("");
    const screen = lifetime.current;
    if (drafts?.update) void persistLiveEditor(drafts, scope, previous, next).then(result => {
      if (screen && !screen.signal.aborted && verified() && !result.changed && result.current) remember(result.current);
    }).catch(() => {
      if (screen && !screen.signal.aborted && verified()) setNotice(word("Draf lokal belum tersimpan.", "The local draft has not been saved."));
    });
  }

  function reportIssue(error: unknown) {
    if (error instanceof LiveCodingError && [401, 403, 404].includes(error.status)) {
      setSnapshot(undefined); setOutput(""); setHelp(""); setHistory([]);
    }
    setNotice(readIssue(error, en));
  }

  async function perform(kind: Work, operation: (controller: AbortController, current: () => boolean) => Promise<void>) {
    if (!active() || action.current) return;
    const controller = new AbortController();
    action.current = { kind, controller };
    setWork(kind); setNotice("");
    const current = () => action.current?.controller === controller && !controller.signal.aborted && !!verified();
    try { await operation(controller, current); }
    catch (error) { if (current()) reportIssue(error); }
    finally {
      if (action.current?.controller === controller) {
        action.current = null; input.current = null; setWaiting(false); setWork(undefined);
      }
    }
  }

  function run() {
    if (!snapshot) return;
    const { code, stdin } = draft.current;
    void perform("run", async (controller, current) => {
      setOutput(""); setLine("");
      let timer: ReturnType<typeof setTimeout> | undefined;
      let timedOut = false;
      const runtime = createRemotePythonRuntime(scope.courseId, phase => {
        if (phase === "running") timer = setTimeout(() => { timedOut = true; controller.abort(); }, snapshot.problem.limits.timeoutMs);
      }, { prefillInput: true, output: chunk => { if (current()) setOutput(text => text + chunk); },
        input: send => { if (current()) { input.current = send; setWaiting(true); } } }, request);
      try {
        const result = await executePython(runtime, { code, stdin, limits: snapshot.problem.limits, signal: controller.signal });
        if (timedOut && action.current?.controller === controller && verified()) setNotice(word("Batas waktu latihan tercapai.", "Practice time limit reached."));
        if (!current()) return;
        setOutput([result.stdout, result.stderr].filter(Boolean).join("\n"));
        if (result.status === "unavailable") setNotice(word("Python belum tersedia. Coba lagi.", "Python is unavailable. Try again."));
        else if (result.status === "completed" && !result.stdout && !result.stderr) setNotice(word("Selesai tanpa keluaran.", "Finished without output."));
        else if (result.truncated) setNotice(word("Keluaran dipotong.", "Output was truncated."));
      } finally { if (timer) clearTimeout(timer); }
    });
  }

  function submit() {
    if (!snapshot || !drafts?.update) return;
    void perform("submit", async (controller, current) => {
      const previous = draft.current;
      const pending = previous.pending ?? { code: previous.code, stdin: previous.stdin, problem: codingLocator(scope.config), requestId: randomUUID() };
      const saved = { ...previous, pending };
      try {
        const reservation = await persistLiveEditor(drafts, scope, previous, saved);
        if (!reservation.changed) {
          if (current() && reservation.current) remember(reservation.current);
          return;
        }
      } catch {
        if (current()) setNotice(word("Draf harus tersimpan sebelum pengiriman.", "Your draft must be saved before submitting."));
        return;
      }
      if (!current()) return;
      remember(saved);
      if (!active()) return;
      try {
        const result = await submitLiveCoding(request, scope, snapshot.problem, pending, controller.signal);
        if (!current()) return;
        const receipt: CodingHistory[number] = { id: result.attemptId, ordinal: result.ordinal, code: pending.code,
          feedback: result.feedback, status: result.feedback?.verdict === "ungradable" ? "failed" : result.feedback ? "completed" : "pending" };
        setHistory(rows => [receipt, ...rows.filter(row => row.id !== result.attemptId)].slice(0, 20));
        if (!result.feedback || result.feedback.verdict === "ungradable") {
          setNotice(word("Coba periksa lagi dengan ID percobaan yang sama.", "Check again with the same attempt ID."));
          return;
        }
        const edited = { code: pending.code, stdin: pending.stdin };
        const completed = await persistLiveEditor(drafts, scope, saved, edited);
        if (current()) {
          if (completed.changed) remember(edited);
          else if (completed.current) remember(completed.current);
        }
      } catch (error) {
        if (!current()) return;
        if (error instanceof LiveCodingError) reportIssue(error);
        else setNotice(word("Pengiriman belum terkonfirmasi. Coba lagi dengan percobaan yang sama.", "Submission is unconfirmed. Retry the same attempt."));
      }
    });
  }

  function refreshHistory() {
    if (!snapshot) return;
    void perform("history", async (controller, current) => {
      const rows = await loadLiveCodingHistory(request, scope, snapshot.problem, controller.signal);
      if (current()) setHistory(rows);
    });
  }

  function ask() {
    if (!transport || !snapshot) return;
    const context = liveCodingHelp(scope, snapshot.policy, draft.current);
    if (!context) return;
    void perform("help", async (controller, current) => {
      setHelp("");
      let text = "";
      for await (const event of streamNativeZyra(transport, { courseId: scope.courseId, requestId: randomUUID(), persistHistory: true,
        pathname: props.route.path, responseLanguage: en ? "en" : "id", codingContext: context,
        question: context.intent === "hint" ? word("Beri satu petunjuk untuk kode ini.", "Give one hint for this code.")
          : word("Tinjau kode ini.", "Review this code."),
      }, controller.signal)) {
        if (!current() || !active()) return;
        if (event.type === "data-error") throw new Error("Coding help unavailable.");
        if (event.type === "text-delta" && typeof event.textDelta === "string") text = (text + event.textDelta).slice(0, 8000);
        if (event.type === "chunk" && typeof event.text === "string") text = (text + event.text).slice(0, 8000);
        if (event.type === "text-replace" && typeof event.text === "string") text = event.text.slice(0, 8000);
      }
      if (current() && active()) setHelp(text);
    });
  }

  if (!verified()) return null;
  if (!snapshot) return !open ? null : notice
    ? <Message action={word("Coba lagi", "Try again")} onAction={() => reload(value => value + 1)}>{notice}</Message>
    : <ActivityIndicator accessibilityLabel={word("Memuat soal Python", "Loading Python exercise")} />;
  const { problem, policy } = snapshot;
  const enabled = active();
  const editable = enabled && !work && !editor.pending;
  const verdict = {
    correct: word("Benar", "Correct"), partial: word("Sebagian benar", "Partially correct"), incorrect: word("Belum benar", "Incorrect"),
    ungradable: word("Pemeriksaan gagal", "Could not grade"),
  };
  return <Section title={problem.title}>
    <CourseMarkdown source={problem.prompt} services={props} allowLinks={false} />
    {policy.maxAttempts !== null && <Copy muted>{word("Batas percobaan", "Attempt limit")} {policy.maxAttempts}</Copy>}
    {problem.publicTests.map((test, index) => <View key={test.id} style={styles.section}>
      <Copy heading>{word("Contoh", "Example")} {index + 1}</Copy>
      <Copy muted>{word("Masukan", "Input")}</Copy><PythonOutput content={test.stdin || "–"} />
      <Copy muted>{word("Keluaran", "Output")}</Copy><PythonOutput content={test.expectedStdout || "–"} />
      <Button variant="outline" disabled={!editable} onPress={() => edit({ stdin: test.stdin })}>{word("Gunakan masukan", "Use input")}</Button>
    </View>)}
    <PythonCodeField label={word("Kode Python", "Python code")} code={editor.code} editable={editable} onChange={code => edit({ code })} />
    <Input accessibilityLabel={word("Masukan latihan", "Practice input")} value={editor.stdin} multiline maxLength={8000}
      editable={editable} autoCapitalize="none" onChangeText={stdin => edit({ stdin })} />
    <View style={styles.wrap}>
      <Button variant="outline" disabled={work !== "run" && (!enabled || !!work || !editor.code.trim())}
        onPress={() => work === "run" ? action.current?.controller.abort() : run()}>
        {work === "run" ? word("Hentikan", "Stop") : word("Jalankan latihan", "Run practice")}
      </Button>
      <Button disabled={!enabled || !drafts?.update || !!work || !editor.code.trim()} isLoading={work === "submit"} onPress={submit}>
        {editor.pending ? word("Coba kirim ulang", "Retry submission") : word("Kirim jawaban", "Submit answer")}
      </Button>
      {liveCodingHelp(scope, policy, editor) && <Button variant="ghost" disabled={!enabled || !!work || !editor.code.trim()}
        isLoading={work === "help"} onPress={ask}>{word("Tanya Zyra", "Ask Zyra")}</Button>}
    </View>
    {waiting && <View style={styles.wrap}>
      <Input accessibilityLabel={word("Masukan terminal", "Terminal input")} value={line} maxLength={8000} onChangeText={setLine} />
      <Button variant="outline" onPress={() => { if (active() && input.current) { input.current(line); setLine(""); } }}>{word("Kirim masukan", "Send input")}</Button>
    </View>}
    {output ? <PythonOutput content={output} /> : null}
    {help && enabled ? <CourseMarkdown source={help} services={props} allowLinks={false} /> : null}
    {notice && <Copy>{notice}</Copy>}
    {editor.pending && !work && !notice && <Copy muted>{word("Ada percobaan yang belum terkonfirmasi.", "A submission is still unconfirmed.")}</Copy>}
    {!enabled && <Copy muted>{word("Waktu pengumpulan berakhir.", "The submission window has closed.")}</Copy>}
    <Button variant="ghost" disabled={!enabled || !!work} isLoading={work === "history"} onPress={refreshHistory}>
      {word("Muat ulang riwayat", "Refresh history")}
    </Button>
    {history.map(row => <View key={row.id} style={styles.section}>
      <Copy>{word("Percobaan", "Attempt")} {row.ordinal} · {row.feedback ? verdict[row.feedback.verdict] : word("Sedang diperiksa", "Grading in progress")}</Copy>
      {row.feedback && <Copy muted>{row.feedback.passed}/{row.feedback.total} {word("kasus lulus", "tests passed")}</Copy>}
      {row.feedback?.publicCases.filter(test => !test.passed).map(test => <PythonOutput key={test.testId}
        content={test.execution.stderr || test.execution.stdout || word("Tidak ada keluaran", "No output")} />)}
      <Button variant="outline" disabled={!editable} onPress={() => edit({ code: row.code })}>{word("Gunakan kode", "Use code")}</Button>
    </View>)}
  </Section>;
}

function readIssue(error: unknown, en: boolean) {
  const code = error instanceof LiveCodingError ? error.code : undefined;
  if (code === "CODING_DEADLINE_PASSED") return en ? "The submission window has closed." : "Waktu pengumpulan berakhir.";
  if (code === "CODING_ATTEMPT_LIMIT") return en ? "The attempt limit has been reached." : "Batas percobaan tercapai.";
  if (error instanceof LiveCodingError && [401, 403, 404].includes(error.status)) {
    return en ? "The exercise is unavailable for this session." : "Latihan tidak tersedia untuk sesi ini.";
  }
  return en ? "Request could not be confirmed. Try again." : "Permintaan belum terkonfirmasi. Coba lagi.";
}
