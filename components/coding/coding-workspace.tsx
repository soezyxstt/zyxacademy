"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, RotateCcw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { useSession } from "@/lib/auth-client";
import { PythonEditor } from "./python-editor";
import { CodingHelp } from "./coding-help";
import { useCodingDraft } from "./use-coding-draft";
import { createBrowserPythonRuntime, preloadPythonAssets } from "@/lib/coding/browser-runtime";
import { executePython } from "@/lib/coding/runtime";
import { type CodingProblemPublic, type ExecutionResult } from "@/lib/coding/contracts";
import type { publicCodingFeedback } from "@/lib/coding/evaluation";
import type { z } from "zod";
import type { codingSurfaceSchema } from "@/lib/coding/http-contracts";

type Feedback = ReturnType<typeof publicCodingFeedback>;
const verdictLabels = { correct: "Semua kasus uji lolos", partial: "Sebagian kasus uji belum lolos", incorrect: "Jawaban belum sesuai", ungradable: "Pemeriksaan belum tersedia. Coba Submit lagi." };
const statusLabels: Record<ExecutionResult["status"], string> = { completed: "Eksekusi selesai", syntax_error: "Periksa penulisan kode", runtime_error: "Terjadi error saat menjalankan kode", timeout: "Eksekusi melewati batas waktu", stopped: "Eksekusi dihentikan", unavailable: "Python belum tersedia. Coba lagi." };

export function CodingWorkspace({ courseId, draftKey, initialCode = "", initialStdin = "", problem, surface, allowHelp = true, learnerId, playgroundLink = false, disabled = false, interactive = false }: {
  courseId: string; draftKey: string; initialCode?: string; initialStdin?: string; problem?: CodingProblemPublic;
  surface?: z.infer<typeof codingSurfaceSchema>; allowHelp?: boolean; learnerId?: string;
  playgroundLink?: boolean; disabled?: boolean; interactive?: boolean;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const owner = learnerId ?? session?.user?.id;
  const draft = useCodingDraft({ courseId, draftKey, learnerId: owner, initialCode: problem?.starterCode ?? initialCode, initialStdin });
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [executedInput, setExecutedInput] = useState<string | null>(null);
  const [execution, setExecution] = useState<ExecutionResult | null>(null), [executedCode, setExecutedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false), [feedback, setFeedback] = useState<Feedback | null>(null), [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [attemptId, setAttemptId] = useState<string | undefined>(), [ordinal, setOrdinal] = useState(0), [error, setError] = useState("");
  const [history, setHistory] = useState<Array<{ id: string; ordinal: number; code: string; feedback: Feedback | null }>>([]);
  const active = useRef<AbortController | null>(null), submitAbort = useRef<AbortController | null>(null);
  const pending = useRef<{ code: string; stdin: string; id: string } | null>(null);
  const inputId = useId();
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalHistory, setTerminalHistory] = useState<string[]>([]);
  const [waitingInput, setWaitingInput] = useState(false);
  const sendInput = useRef<((value: string) => void) | null>(null);
  useEffect(() => {
    if (!interactive) return;
    return preloadPythonAssets();
  }, [interactive]);
  const surfaceKey = surface ? JSON.stringify(surface) : "";
  useEffect(() => () => { active.current?.abort(); submitAbort.current?.abort(); }, []);
  useEffect(() => {
    if (!problem || !owner) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      try {
        const response = await fetch(`/api/coding/submissions?${new URLSearchParams({ courseId, problemId: problem!.problemId, version: String(problem!.version), ...(surfaceKey ? { surface: surfaceKey } : {}) })}`, { signal: abort.signal });
        if (!response.ok) return;
        const body = await response.json();
        setHistory(body.attempts);
        if (body.attempts.some((attempt: { status?: string }) => attempt.status === "pending")) timer = setTimeout(refresh, 2000);
      } catch { /* History does not block execution. */ }
    }
    void refresh();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [courseId, problem, owner, surfaceKey]);
  async function run() {
    if (phase !== "idle" || submitting) return;
    const controller = new AbortController(); active.current = controller;
    const code = draft.code; setExecutedCode(code); setExecutedInput(draft.stdin); setExecution(null); setError("");
    setTerminalOutput(""); setTerminalInput(""); setTerminalHistory([]); setWaitingInput(false);
    try { setExecution(await executePython(createBrowserPythonRuntime(setPhase, interactive ? {
      output: (text) => setTerminalOutput((value) => (value + text).slice(0, 8000)),
      input: (send) => { sendInput.current = send; setWaitingInput(true); },
    } : undefined), { code, stdin: draft.stdin, limits: problem?.limits ?? { timeoutMs: 5000, maxOutputChars: 8000 }, signal: controller.signal })); }
    finally { sendInput.current = null; setWaitingInput(false); setPhase("idle"); }
  }
  async function submit() {
    if (!problem || !surface || submitting || disabled) return;
    const controller = new AbortController(); submitAbort.current = controller;
    setSubmitting(true); setError("");
    const code = draft.code, stdin = draft.stdin;
    if (!pending.current || pending.current.code !== code || pending.current.stdin !== stdin) pending.current = { code, stdin, id: crypto.randomUUID() };
    setSubmittedCode(code);
    try {
      const response = await fetch("/api/coding/submissions", { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, surface, submission: { requestId: pending.current.id, problem: { problemId: problem.problemId, version: problem.version }, code, stdin } }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Percobaan belum dapat diperiksa.");
      if (response.status === 202) { setError("Percobaan masih diperiksa. Tekan Submit lagi untuk melihat hasilnya."); return; }
      setFeedback(body.feedback); setAttemptId(body.attemptId); setOrdinal(body.ordinal);
      setHistory((items) => [{ id: body.attemptId, ordinal: body.ordinal, code, feedback: body.feedback }, ...items.filter((item) => item.id !== body.attemptId)].slice(0, 20));
      if (body.feedback?.verdict !== "ungradable") pending.current = null;
    } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Percobaan belum dapat diperiksa."); }
    finally { if (!controller.signal.aborted) setSubmitting(false); }
  }
  function handoff() {
    const key = crypto.randomUUID();
    try {
      sessionStorage.setItem(`zyx-python-handoff:${key}`, JSON.stringify({ courseId, code: draft.code, stdin: draft.stdin, backHref: location.pathname + location.search }));
      router.push(`/courses/${encodeURIComponent(courseId)}/playground?handoff=${key}`);
    } catch { setError("Kode belum dapat dibuka di Playground. Salin kode terlebih dahulu."); }
  }
  const help = problem && surface ? { kind: "exercise" as const, problem: { problemId: problem.problemId, version: problem.version }, code: draft.code, stdin: draft.stdin, intent: "hint" as const, surface, ...(attemptId ? { attemptId } : {}), ...(executedCode === draft.code && executedInput === draft.stdin && execution ? { execution } : {}) } : { kind: "playground" as const, code: draft.code, stdin: interactive ? terminalHistory.join("\n") : draft.stdin, execution: executedCode === draft.code && (interactive || executedInput === draft.stdin) ? execution : null, intent: "review" as const };
  if (interactive) return <section className="min-w-0 space-y-3" aria-label="Playground Python">
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-body-sm font-semibold">main.py</h2>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "idle" ? <Button size="sm" className="min-w-[92px]" onClick={run} disabled={draft.code.length > 64000}><Play className="size-4" />Jalankan</Button> : <Button size="sm" className="min-w-[92px]" variant="outline" onClick={() => active.current?.abort()}><Square className="size-4" />Stop</Button>}
            <TooltipProvider><Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="outline" aria-label="Reset" disabled={phase !== "idle"} onClick={() => { draft.setCode(initialCode); draft.setStdin(""); }}><RotateCcw className="size-4" /></Button></TooltipTrigger><TooltipContent>Reset</TooltipContent></Tooltip>
            {playgroundLink ? <Tooltip><TooltipTrigger asChild><Button size="icon-sm" variant="ghost" aria-label="Playground" onClick={handoff}><ExternalLink className="size-4" /></Button></TooltipTrigger><TooltipContent>Playground</TooltipContent></Tooltip> : null}</TooltipProvider>
          </div>
        </div>
        <PythonEditor value={draft.code} onChange={draft.setCode} />
        {draft.conflicted ? <Button size="sm" variant="outline" onClick={draft.keepLocal}>Ganti draft tersimpan</Button> : null}
        {draft.saved ? <span role="status" className="text-body-xs text-muted-foreground">{draft.saved}</span> : null}
      </div>
      <div className="min-w-0 space-y-2">
        <div className="flex min-h-9 items-center"><h2 className="font-heading text-body-sm font-semibold">Terminal</h2></div>
        <div className="min-h-[220px] rounded-lg border border-border bg-muted p-3 font-mono text-body-sm">
          <pre aria-live="polite" className="max-h-80 overflow-auto whitespace-pre-wrap break-words">{terminalOutput}</pre>
          {waitingInput ? <form onSubmit={(event) => { event.preventDefault(); const value = terminalInput; sendInput.current?.(value); sendInput.current = null; setWaitingInput(false); setTerminalOutput((output) => (output + value + "\n").slice(0, 8000)); setTerminalHistory((history) => [...history, value]); setTerminalInput(""); }}><Input autoFocus aria-label="Input terminal" value={terminalInput} maxLength={Math.max(0, 8000 - terminalHistory.join("\n").length - (terminalHistory.length ? 1 : 0))} onChange={(event) => setTerminalInput(event.target.value)} className="mt-2 font-mono" /></form> : null}
          {phase === "loading" ? <p role="status" className="text-body-xs text-muted-foreground">Menyiapkan Python...</p> : null}
          {execution ? <p role="status" className="mt-2 text-body-xs text-muted-foreground">{statusLabels[execution.status]}{execution.stderr && !terminalOutput.includes(execution.stderr) && execution.stderr.replace(/[.!]+$/, "") !== statusLabels[execution.status] ? `: ${execution.stderr}` : ""}</p> : null}
        </div>
      </div>
    </div>
    {allowHelp ? <CodingHelp courseId={courseId} context={help} disabled={submitting} /> : null}
  </section>;
  return <section className="min-w-0 max-w-full space-y-4" aria-label={problem ? `Latihan Python: ${problem.title}` : "Playground Python"}>
    {problem ? <div className="space-y-2"><h3 className="font-heading text-body-base font-bold">{problem.title}</h3><MarkdownRenderer content={problem.prompt} />{problem.publicTests.length ? <details className="text-body-sm"><summary className="cursor-pointer">Contoh input dan output</summary><div className="mt-2 space-y-2">{problem.publicTests.map((test) => <div key={test.id} className="grid grid-cols-2 gap-2"><pre className="overflow-x-auto rounded-md bg-muted p-2"><span className="block text-body-xs text-muted-foreground">Input</span>{test.stdin}</pre><pre className="overflow-x-auto rounded-md bg-muted p-2"><span className="block text-body-xs text-muted-foreground">Output</span>{test.expectedStdout}</pre></div>)}</div></details> : null}</div> : null}
    <PythonEditor value={draft.code} onChange={draft.setCode} />
    <div className="space-y-1.5"><label htmlFor={inputId} className="text-body-sm font-semibold">Input program</label><Textarea id={inputId} value={draft.stdin} onChange={(event) => draft.setStdin(event.target.value)} maxLength={8000} rows={2} className="font-mono text-body-sm" placeholder="Satu nilai per baris untuk input()" /></div>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" className="text-body-sm" onClick={run} disabled={phase !== "idle" || submitting || draft.code.length > 64000}><Play className="size-4" />Jalankan</Button>
      {phase !== "idle" ? <Button size="sm" className="text-body-sm" variant="outline" onClick={() => active.current?.abort()}><Square className="size-4" />Stop</Button> : null}
      {problem && surface ? <Button size="sm" className="text-body-sm" onClick={submit} disabled={submitting || phase !== "idle" || disabled || draft.code.length > 64000}>{submitting ? "Memeriksa..." : "Submit"}</Button> : null}
      <Button size="sm" className="text-body-sm" variant="outline" disabled={phase !== "idle" || submitting} onClick={() => { draft.setCode(problem?.starterCode ?? initialCode); draft.setStdin(""); }}><RotateCcw className="size-4" />Reset</Button>
      {playgroundLink ? <Button size="sm" className="text-body-sm" variant="ghost" onClick={handoff}><ExternalLink className="size-4" />Playground</Button> : null}
      {draft.conflicted ? <Button size="sm" className="text-body-sm" variant="outline" onClick={draft.keepLocal}>Ganti draft tersimpan</Button> : null}
      {draft.saved ? <span role="status" className="text-body-xs text-muted-foreground">{draft.saved}</span> : null}
    </div>
    {phase !== "idle" ? <p role="status" className="text-body-sm text-muted-foreground">{phase === "loading" ? "Menyiapkan Python..." : "Menjalankan kode..."}</p> : null}
    {execution ? <div className="space-y-2 border-t border-border pt-3" aria-label="Hasil eksekusi"><p role="status" className="text-body-sm font-semibold">{statusLabels[execution.status]}</p>{(executedCode !== draft.code || executedInput !== draft.stdin) ? <p className="text-body-xs text-muted-foreground">Hasil ini berasal dari kode atau input sebelum perubahan terakhir.</p> : null}{execution.stdout || execution.status === "completed" ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-mono text-body-sm">{execution.stdout || "Tidak ada output. Gunakan print() untuk menampilkan hasil."}</pre> : null}{execution.stderr ? <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-body-sm text-destructive">{execution.stderr}</pre> : null}{execution.truncated ? <p className="text-body-xs text-muted-foreground">Output dipotong karena melewati batas ukuran.</p> : null}</div> : null}
    {feedback ? <div role="status" className="space-y-2 border-t border-border pt-3 text-body-sm"><p className="font-semibold">{verdictLabels[feedback.verdict]}</p><p>Percobaan {ordinal}. {feedback.passed} dari {feedback.total} kasus uji lolos.</p>{submittedCode !== draft.code ? <p className="text-body-xs text-muted-foreground">Pemeriksaan ini merujuk pada kode sebelum perubahan terakhir.</p> : null}{feedback.publicCases.filter((test) => !test.passed).map((test) => <div key={test.testId}><p>Kasus {test.testId}: {statusLabels[test.execution.status]}</p><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-2">{test.execution.stderr || test.execution.stdout || "Tidak ada output"}</pre></div>)}</div> : null}
    {error ? <p role="alert" className="text-body-sm text-destructive">{error}</p> : null}
    {history.length ? <details className="text-body-sm"><summary className="cursor-pointer">Riwayat percobaan</summary><ol className="mt-2 divide-y divide-border">{history.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>Percobaan {item.ordinal}: {item.feedback ? verdictLabels[item.feedback.verdict] : "Masih diperiksa"}</span><Button size="sm" className="text-body-sm" variant="outline" disabled={submitting || phase !== "idle"} onClick={() => draft.setCode(item.code)}>Gunakan kode</Button></li>)}</ol></details> : null}
    {allowHelp ? <CodingHelp courseId={courseId} context={help} disabled={submitting} /> : null}
  </section>;
}
