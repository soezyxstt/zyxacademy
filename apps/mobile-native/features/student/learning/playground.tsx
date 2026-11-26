import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import type { ExecutionResult } from "../../../../../lib/coding/contracts";
import { useOpenCourseZyra } from "../zyra/context";
import { executePython } from "../../../../../lib/coding/runtime";
import { createRemotePythonRuntime } from "../../../../../lib/coding/remote-runtime";
import { reconcileCodingDraft } from "../../../../../lib/coding/draft-reconciliation";
import { Button } from "../../../components/Button";
import { Input } from "../../../components/Input";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import { useStudentChromeVisibility } from "../../../routing/student-course-chrome-context";
import type { StudentScreenProps } from "../contracts";
import { PlaygroundAccessError, emptyPlayground, loadPlaygroundDraft, playgroundStorageKey, restoreLocalPlayground, savePlaygroundDraft, type PlaygroundDraft } from "./playground-draft";
import { Copy, Message, Section, english, styles } from "./ui";
import { PythonCodeField, PythonOutput } from "./python-editor";

export function PlaygroundContent({ props }: { props: StudentScreenProps }) {
  const { session, route } = props;
  const draftKey = "playground:" + (route.query.handoff || "default");
  if (draftKey.length > 300) return <Message>{english(session.locale) ? "This draft link is invalid." : "Tautan draf ini tidak valid."}</Message>;
  const key = JSON.stringify([session.origin, session.userId, session.sessionId, session.locale, route.params.id, draftKey]);
  return <Playground key={key} props={props} draftKey={draftKey} />;
}

function Playground({ props, draftKey }: { props: StudentScreenProps; draftKey: string }) {
  const { request, route, session, drafts } = props;
  const owner = useMemo(() => ({ courseId: route.params.id, userId: session.userId, draftKey }), [route.params.id, session.userId, draftKey]);
  const localKey = playgroundStorageKey(owner.courseId, draftKey);
  const en = english(session.locale);
  const openZyra = useOpenCourseZyra();
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const { suspended, canInteract } = useProtectedInteraction();
  const focused = props.focused !== false && !suspended;
  useStudentChromeVisibility({ hideBottom: true });
  const [draft, setDraft] = useState<PlaygroundDraft>(emptyPlayground);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, reload] = useState(0);
  const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [line, setLine] = useState("");
  const executedInput = useRef("");
  const input = useRef<((value: string) => void) | null>(null);
  const execution = useRef<AbortController | null>(null);
  const screen = useRef<AbortController | null>(null);
  const write = useRef(false);

  useEffect(() => {
    const lifetime = new AbortController();
    screen.current = lifetime;
    setLoaded(false); setAccessDenied(false); setSaving(false); setPhase("idle"); setLine(""); setOutput(""); setLastResult(null); setNotice("");
    write.current = false;
    if (focused) {
      void Promise.all([
        loadPlaygroundDraft(request, owner, lifetime.signal),
        drafts?.get(localKey).then(restoreLocalPlayground).catch(() => null) ?? null,
      ]).then(([remote, local]) => {
        if (lifetime.signal.aborted) return;
        const resolved = reconcileCodingDraft(local, remote);
        const changed = Boolean(local && (local.code !== remote.code || local.stdin !== remote.stdin));
        setDraft(changed && local ? local : remote);
        setConflictRevision(resolved.conflict ? remote.revision : null); setDirty(changed); setLoaded(true);
      }).catch((error: unknown) => {
        if (lifetime.signal.aborted) return;
        if (error instanceof PlaygroundAccessError) setAccessDenied(true);
        else setNotice(en ? "Could not load the playground." : "Playground belum dapat dimuat.");
      });
    }
    return () => { lifetime.abort(); execution.current?.abort(); execution.current = null; input.current = null; };
  }, [focused, request, owner, drafts, localKey, revision, en]);

  function edit(patch: Partial<Pick<PlaygroundDraft, "code" | "stdin">>) {
    if (!loaded || write.current || !canInteract()) return;
    const next = { ...draft, ...patch };
    setDraft(next); setLastResult(null); setDirty(true); setNotice("");
    executedInput.current = "";
    const lifetime = screen.current;
    void drafts?.set(localKey, JSON.stringify(next)).catch(() => {
      if (lifetime && !lifetime.signal.aborted) setNotice(en ? "Save this draft to keep your changes." : "Simpan draf ini agar perubahan tersimpan.");
    });
  }

  async function save() {
    const lifetime = screen.current;
    if (!loaded || !dirty || write.current || !lifetime || lifetime.signal.aborted || !canInteract()) return;
    write.current = true; setSaving(true); setNotice("");
    try {
      const result = await savePlaygroundDraft(request, owner, { ...draft, revision: conflictRevision ?? draft.revision }, lifetime.signal);
      if (lifetime.signal.aborted) return;
      let savedRevision: number;
      if (result.conflict) {
        const latest = await loadPlaygroundDraft(request, owner, lifetime.signal);
        if (lifetime.signal.aborted) return;
        if (latest.code !== draft.code || latest.stdin !== draft.stdin) {
          setConflictRevision(latest.revision);
          return;
        }
        savedRevision = latest.revision;
      } else savedRevision = result.revision;
      setDraft({ ...draft, revision: savedRevision }); setConflictRevision(null); setDirty(false);
      void drafts?.remove(localKey).catch(() => {});
    } catch (error) {
      if (lifetime.signal.aborted) return;
      if (error instanceof PlaygroundAccessError) { setAccessDenied(true); execution.current?.abort(); }
      else setNotice(en ? "Save could not be confirmed. Retry to check your draft." : "Penyimpanan belum terkonfirmasi. Coba lagi untuk memeriksa draf.");
    } finally {
      if (!lifetime.signal.aborted) { write.current = false; setSaving(false); }
    }
  }

  async function run() {
    if (execution.current || !loaded || !draft.code.trim() || !canInteract()) return;
    const controller = new AbortController();
    execution.current = controller;
    setOutput(""); setLastResult(null); setNotice(""); setPhase("loading"); setLine("");
    executedInput.current = draft.stdin;
    const active = () => execution.current === controller && !controller.signal.aborted && canInteract();
    const runtime = createRemotePythonRuntime(owner.courseId, next => { if (active()) setPhase(next); }, {
      prefillInput: true,
      output: chunk => { if (active()) setOutput(previous => previous + chunk); },
      input: send => { if (active()) input.current = send; },
    }, request);
    try {
      const result = await executePython(runtime, { code: draft.code, stdin: draft.stdin, limits: { timeoutMs: 5000, maxOutputChars: 8000 }, signal: controller.signal });
      if (!active()) return;
      setLastResult(result);
      setOutput([result.stdout, result.status === "unavailable" ? "" : result.stderr].filter(Boolean).join("\n"));
      if (result.status === "unavailable") setNotice(en ? "Python is unavailable. Try again." : "Python belum tersedia. Coba lagi.");
      else if (result.status === "completed" && !result.stdout && !result.stderr) setNotice(en ? "Finished without output." : "Selesai tanpa keluaran.");
      else if (result.truncated) setNotice(en ? "Output limit reached." : "Keluaran mencapai batas.");
    } catch {
      if (active()) setNotice(en ? "Could not run this code." : "Kode belum dapat dijalankan.");
    } finally {
      if (execution.current === controller) { execution.current = null; input.current = null; setPhase("idle"); }
    }
  }

  if (accessDenied) return <Message>{en ? "Playground access is unavailable for this account." : "Akses Playground tidak tersedia untuk akun ini."}</Message>;
  if (!loaded) return notice ? <Message action={en ? "Retry" : "Coba lagi"} onAction={() => reload(n => n + 1)}>{notice}</Message>
    : <ActivityIndicator accessibilityLabel={en ? "Loading playground" : "Memuat Playground"} />;
  const running = phase !== "idle";
  return <Section>
    <Copy>{en ? "Python code" : "Kode Python"}</Copy>
    <PythonCodeField label={en ? "Python code" : "Kode Python"} code={draft.code}
      editable={!saving && !running} onChange={code => edit({ code })} />
    <Copy>{en ? "Program input" : "Masukan program"}</Copy>
    <Input accessibilityLabel={en ? "Program input" : "Masukan program"}
      testID="student-python-program-input" value={draft.stdin} maxLength={8000} multiline
      autoCapitalize="none" autoCorrect={false} spellCheck={false} editable={!saving && !running}
      onChangeText={stdin => edit({ stdin })} style={local.programInput} />
    {conflictRevision !== null && <Copy>{en ? "Another device saved a different draft. Saving your copy will replace it." : "Perangkat lain menyimpan draf berbeda. Menyimpan salinan ini akan menggantikannya."}</Copy>}
    <View style={styles.wrap}>
      <Button disabled={!running && !draft.code.trim()} onPress={running ? () => execution.current?.abort() : run}>
        {running ? (en ? "Stop" : "Hentikan") : (en ? "Run" : "Jalankan")}</Button>
      <Button variant="outline" disabled={!dirty || saving} onPress={save}>{conflictRevision !== null ? (en ? "Save my copy" : "Simpan salinan saya") : (en ? "Save draft" : "Simpan draf")}</Button>
      {openZyra && <Button variant="ghost" disabled={running || !draft.code.trim()} onPress={() => {
        if (canInteract()) openZyra({ kind: "playground", code: draft.code, stdin: lastResult ? executedInput.current : draft.stdin, execution: lastResult,
          intent: lastResult?.status === "runtime_error" || lastResult?.status === "syntax_error" ? "explain_error" : "review" });
      }}>{en ? "Ask Zyra" : "Tanya Zyra"}</Button>}
    </View>
    {phase === "running" && <View style={styles.wrap}>
      <Input accessibilityLabel="stdin" autoCapitalize="none" value={line} maxLength={8000} onChangeText={setLine} style={local.stdin} />
      <Button variant="outline" onPress={() => {
        if (!execution.current || !canInteract() || !input.current) return;
        input.current(line);
        const prefix = executedInput.current;
        executedInput.current = (prefix + (prefix && !prefix.endsWith("\n") ? "\n" : "") + line + "\n").slice(0, 8000);
        setLine("");
      }}>{en ? "Send input" : "Kirim masukan"}</Button>
    </View>}
    {output ? <PythonOutput content={output} /> : null}
    {notice ? <Copy>{notice}</Copy> : null}
  </Section>;
}

const local = StyleSheet.create({
  stdin: { flex: 1, minWidth: 100 },
  programInput: { minHeight: 60, fontFamily: "monospace", textAlignVertical: "top" },
});
