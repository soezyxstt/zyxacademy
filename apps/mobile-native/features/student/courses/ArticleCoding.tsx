import { randomUUID } from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import type { CodingProblemPublic, CodingSubmissionRequest } from "../../../../../lib/coding/contracts";
import type { NativeArticleCodingScope } from "../../../../../lib/coding/native-article-contract";
import { articleCodingDraftKey, type sectionCodingParts } from "../../../../../lib/coding/native-article-parts";
import { createRemotePythonRuntime } from "../../../../../lib/coding/remote-runtime";
import { executePython } from "../../../../../lib/coding/runtime";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { useNativeSession } from "../../../auth/session-provider";
import { streamNativeZyra, type NativeZyraRequest } from "../../../network/zyra";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { StudentRequest, StudentServices, StudentSession } from "../contracts";
import { CourseMarkdown } from "../CourseMarkdown";
import { PythonCodeField, PythonOutput } from "../learning/python-editor";
import { loadPlaygroundDraft, savePlaygroundDraft, PlaygroundAccessError, type PlaygroundDraft } from "../learning/playground-draft";
import { articleCodingApi, ArticleCodingError, articleCodingRequest, releaseArticleSubmission, reserveArticleSubmission, restoreArticleSubmission } from "./article-coding";

export type CodingItem = ReturnType<typeof sectionCodingParts>[number];
const row = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8 };
type Api = ReturnType<typeof articleCodingApi>;
type Result = Awaited<ReturnType<Api["submit"]>>;
type History = Awaited<ReturnType<Api["history"]>>;

export function ArticleCoding({ item, courseId, articleId, version, scope, request, session, drafts, theme, close, closeLabel }: {
  item: CodingItem; courseId: string; articleId: string; version: number; scope: NativeArticleCodingScope;
  request: StudentRequest; session: StudentSession; drafts?: StudentServices["drafts"]; theme: keyof typeof nativeColors; close(): void; closeLabel?: string;
}) {
  const { canInteract } = useProtectedInteraction();
  const { transport, revalidating } = useNativeSession();
  const canAsk = transport && !revalidating && transport.scope.accountId === session.userId && transport.scope.sessionId === session.sessionId && transport.scope.origin === session.origin;
  const { part } = item;
  const scoped = useMemo(() => articleCodingRequest(request, session, scope),
    [request, session.sessionId, session.role, session.userId, scope.materialId, scope.revision, scope.sectionId, scope.partId, scope.revealGrant]);
  const owner = useMemo(() => ({ courseId, userId: session.userId, draftKey: articleCodingDraftKey(articleId, version, part, item.namespace) }),
    [courseId, session.userId, articleId, version, part, item.namespace]);
  const api = useMemo(() => articleCodingApi(scoped, courseId, articleId, version, part.id), [scoped, courseId, articleId, version, part.id]);
  const pendingKey = "coding:article:pending:" + JSON.stringify([courseId, articleId, version, part.id, scope.revision]);
  const [draft, setDraft] = useState<PlaygroundDraft>();
  const [problem, setProblem] = useState<CodingProblemPublic>();
  const [conflict, setConflict] = useState(false);
  const [operation, setOperation] = useState<"run" | "save" | "submit" | "history" | "help">();
  const [history, setHistory] = useState<History>();
  const [help, setHelp] = useState("");
  const [helpTurn, setHelpTurn] = useState<NativeZyraRequest>();
  const [output, setOutput] = useState("");
  const [line, setLine] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result>();
  const [pending, setPending] = useState<CodingSubmissionRequest>();
  const [notice, setNotice] = useState("");
  const [attempt, reload] = useState(0);
  const active = useRef<AbortController | null>(null);
  const sendInput = useRef<((input: string) => void) | null>(null);
  const id = !session.locale.startsWith("en");
  const colors = nativeColors[theme];

  useEffect(() => {
    const load = new AbortController();
    void Promise.all([loadPlaygroundDraft(scoped, owner, load.signal),
      part.kind === "coding_exercise" ? api.problem(part.problem, load.signal) : undefined,
      drafts?.get(pendingKey)]).then(([stored, published, raw]) => {
      if (load.signal.aborted || !canInteract()) return;
      const submission = restoreArticleSubmission(raw, published);
      setPending(submission);
      setDraft(submission ? { code: submission.code, stdin: submission.stdin, revision: stored.revision } : stored.revision ? stored : { ...stored, code: part.kind === "code_example" ? part.code : published?.starterCode ?? "" });
      setProblem(published);
    }, error => {
      if (load.signal.aborted || !canInteract()) return;
      if (scope.revealGrant && error instanceof PlaygroundAccessError) {
        setNotice(id ? "Kembali ke cek pemahaman, lalu buka pembahasan lagi." : "Go back to the check and reveal the explanation again.");
      } else {
        setNotice(id ? "Ruang kerja belum dapat dibuka." : "The workspace is unavailable.");
      }
    });
    return () => { load.abort(); active.current?.abort(); active.current = null; sendInput.current = null; };
  }, [api, attempt, canInteract, drafts, id, owner, part, pendingKey, scope.revealGrant, scoped]);

  async function act(action: NonNullable<typeof operation>) {
    if (!draft || active.current || !canInteract()) return;
    const controller = new AbortController();
    active.current = controller;
    const current = () => active.current === controller && !controller.signal.aborted && canInteract();
    setOperation(action);
    setNotice("");
    try {
      if (action === "run") {
        setOutput("");
        const runtime = createRemotePythonRuntime(courseId, phase => { if (current()) setRunning(phase === "running"); }, {
          prefillInput: true,
          input: send => { if (current()) sendInput.current = send; },
          output: text => { if (current()) setOutput(previous => previous + text); },
        }, scoped);
        const executed = await executePython(runtime, { code: draft.code, stdin: draft.stdin,
          limits: problem?.limits ?? { timeoutMs: 5000, maxOutputChars: 8000 }, signal: controller.signal });
        if (current()) {
          setOutput([executed.stdout, executed.stderr].filter(Boolean).join("\n"));
          if (executed.status === "unavailable") setNotice(id ? "Python belum tersedia." : "Python is unavailable.");
          else if (executed.status === "completed" && !executed.stdout && !executed.stderr) setNotice(id ? "Selesai tanpa keluaran." : "Finished without output.");
        }
      } else if (action === "save") {
        const saved = await savePlaygroundDraft(scoped, owner, draft, controller.signal);
        if (!current()) return;
        if (saved.conflict) setConflict(true);
        else {
          setDraft({ ...draft, revision: saved.revision });
          setNotice(id ? "Draf tersimpan." : "Draft saved.");
        }
      } else if (action === "help" && problem && canAsk && transport) {
        const turn: NativeZyraRequest = helpTurn ?? { courseId, requestId: randomUUID(), persistHistory: true,
          pathname: `/courses/${encodeURIComponent(courseId)}/material/${encodeURIComponent(articleId)}`,
          responseLanguage: id ? "id" : "en",
          question: id ? "Tinjau kode untuk latihan ini." : "Review my code for this exercise.",
          codingContext: { kind: "exercise", problem: { problemId: problem.problemId, version: problem.version },
            code: draft.code, stdin: draft.stdin, intent: "review", surface: { kind: "article", articleId, articleVersion: version, partId: part.id } } };
        setHelpTurn(turn);
        let text = "";
        for await (const event of streamNativeZyra(transport, turn, controller.signal, scope)) {
          if (!current()) return;
          if (event.type === "data-error") throw new Error("Coding help unavailable.");
          if (event.type === "text-delta" && typeof event.textDelta === "string") text = (text + event.textDelta).slice(0, 8000);
          if (event.type === "chunk" && typeof event.text === "string") text = (text + event.text).slice(0, 8000);
          if (event.type === "text-replace" && typeof event.text === "string") text = event.text.slice(0, 8000);
        }
        if (current()) { setHelp(text); setHelpTurn(undefined); }
      } else if (action === "history" && problem) {
        const attempts = await api.history(problem, controller.signal);
        if (current()) setHistory(attempts);
      } else if (action === "submit" && problem && drafts) {
        const proposed = pending ?? { problem: { problemId: problem.problemId, version: problem.version }, code: draft.code, stdin: draft.stdin, requestId: randomUUID() };
        const submission = await reserveArticleSubmission(drafts, pendingKey, proposed);
        if (!current()) return;
        setPending(submission);
        setDraft({ ...draft, code: submission.code, stdin: submission.stdin });
        setResult(undefined);
        const response = await api.submit(problem, submission, controller.signal);
        if (!current()) return;
        if (!response.feedback) setNotice(id ? "Hasil belum tersedia. Periksa lagi." : "The result is pending. Check again.");
        else { await releaseArticleSubmission(drafts, pendingKey, submission); if (current()) { setPending(undefined); setResult(response); setHistory(undefined); } }
      }
    } catch (error) {
      if (current()) {
        if (action === "submit" && error instanceof ArticleCodingError && [400, 401, 403, 404].includes(error.status)) {
          setNotice(id ? "Akses atau versi latihan berubah. Buka kembali bacaan." : "Exercise access or version changed. Reopen the reading.");
          return;
        }
        setNotice(action === "submit" ? id ? "Hasil belum terkonfirmasi. Periksa lagi." : "The result could not be confirmed. Check again."
          : id ? "Tindakan belum dapat diselesaikan." : "Could not complete the action.");
      }
    } finally {
      if (active.current === controller) { active.current = null; sendInput.current = null; setRunning(false); setOperation(undefined); }
    }
  }

  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 12, gap: 10 }} testID="student-article-coding">
    <View style={row}>
      <Button theme={theme} variant="outline" disabled={Boolean(operation)} onPress={close}>{closeLabel ?? (id ? "Kembali ke bacaan" : "Back to reading")}</Button>
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{notice}</Text> : null}
    {!draft ? notice ? <Button theme={theme} onPress={() => { setNotice(""); reload(value => value + 1); }}>{id ? "Coba lagi" : "Try again"}</Button>
      : <ActivityIndicator accessibilityLabel={id ? "Memuat ruang kerja" : "Loading workspace"} /> : <>
      {problem && <><Text accessibilityRole="header" style={{ color: colors.foreground, fontWeight: "600", fontSize: 16 }}>{problem.title}</Text>
        <CourseMarkdown source={problem.prompt} services={{ session }} theme={theme} allowLinks={false} />
        {problem.publicTests.map(test => <Text selectable key={test.id} style={{ color: colors.foreground }}>
          {id ? "Masukan" : "Input"} {test.stdin || JSON.stringify("")} · {id ? "Keluaran" : "Output"} {test.expectedStdout || JSON.stringify("")}
        </Text>)}</>}
      <PythonCodeField label={id ? "Kode Python" : "Python code"} code={draft.code} editable={!operation && !pending}
        onChange={code => setDraft(value => value && { ...value, code })} />
      <Input accessibilityLabel={id ? "Masukan awal" : "Initial input"} placeholder={id ? "Masukan awal" : "Initial input"} value={draft.stdin}
        editable={!operation && !pending} multiline autoCapitalize="none" maxLength={8000} onChangeText={stdin => setDraft(value => value && { ...value, stdin })} />
      {conflict && <Text accessibilityRole="alert" style={{ color: colors.foreground }}>{id
        ? "Draf berubah di perangkat lain. Salin kode sebelum memuat ulang." : "The draft changed on another device. Copy your code before reloading."}</Text>}
      <View style={row}>
        <Button theme={theme} disabled={operation !== "run" && (Boolean(operation) || !draft.code.trim() || Boolean(pending))}
          onPress={() => operation === "run" ? active.current?.abort() : void act("run")}>
          {operation === "run" ? id ? "Hentikan" : "Stop" : id ? "Jalankan" : "Run"}</Button>
        <Button theme={theme} variant="outline" disabled={Boolean(operation) || Boolean(pending) || conflict} onPress={() => void act("save")}>
          {id ? "Simpan draf" : "Save draft"}</Button>
        {problem && drafts?.update && <Button theme={theme} variant="outline" disabled={Boolean(operation) || !draft.code.trim()} onPress={() => void act("submit")}>
          {pending ? id ? "Periksa hasil" : "Check result" : id ? "Kirim jawaban" : "Submit answer"}</Button>}
        {problem && <Button theme={theme} variant="outline" disabled={Boolean(operation)}
          onPress={() => history ? setHistory(undefined) : void act("history")}>
          {history ? id ? "Sembunyikan riwayat" : "Hide history" : id ? "Riwayat percobaan" : "Attempt history"}</Button>}
        {problem && canAsk && <Button theme={theme} variant="ghost" disabled={Boolean(operation) || !draft.code.trim()}
          onPress={() => void act("help")}>{helpTurn ? id ? "Periksa bantuan Zyra" : "Check Zyra help" : id ? "Tanya Zyra" : "Ask Zyra"}</Button>}
      </View>
      {help ? <CourseMarkdown source={help} services={{ session }} theme={theme} allowLinks={false} /> : null}
      {running && <View style={row}>
        <Input accessibilityLabel={id ? "Masukan terminal" : "Terminal input"} value={line} onChangeText={setLine}
          autoCapitalize="none" maxLength={8000} style={{ flex: 1 }} />
        <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) { sendInput.current?.(line); setLine(""); } }}>
          {id ? "Kirim masukan" : "Send input"}</Button>
      </View>}
      {output ? <PythonOutput content={output} /> : null}
      {history && <View style={{ gap: 6 }}>
        {history.length === 0 && <Text style={{ color: colors.foreground }}>{id ? "Belum ada percobaan." : "No attempts yet."}</Text>}
        {history.map(attempt => <View key={attempt.id} style={{ gap: 4, borderTopWidth: 1, borderColor: colors.border, paddingVertical: 6 }}>
          <Text style={{ color: colors.foreground }}>
            {id ? "Percobaan" : "Attempt"} {attempt.ordinal} · {attempt.feedback && attempt.feedback.verdict !== "ungradable"
              ? `${attempt.feedback.passed}/${attempt.feedback.total}`
              : attempt.status === "pending" ? id ? "Sedang diperiksa" : "Pending" : id ? "Belum dinilai" : "Ungraded"}
          </Text>
          <Button theme={theme} variant="ghost" disabled={Boolean(operation) || Boolean(pending)} onPress={() => {
            if (canInteract()) { setDraft({ ...draft, code: attempt.code }); setOutput(""); }
          }}>{id ? "Buka kode" : "Load code"}</Button>
        </View>)}
      </View>}
      {result?.feedback && <View style={{ gap: 6 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>
          {result.feedback.verdict === "ungradable" ? id ? "Kode belum dapat dinilai." : "The code could not be graded."
            : id ? `${result.feedback.passed}/${result.feedback.total} uji lulus` : `${result.feedback.passed}/${result.feedback.total} tests passed`}
        </Text>
        {result.feedback.publicCases.map(test => <Text key={test.testId} style={{ color: colors.foreground }}>
          {test.testId} · {test.passed ? id ? "Lulus" : "Passed" : id ? "Gagal" : "Failed"}</Text>)}
      </View>}
    </>}
  </ScrollView>;
}
