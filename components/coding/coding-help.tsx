"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Bug, GitBranch, Lightbulb, ListTree, MessageSquare, Send, X } from "lucide-react";
import { CanvasSpecSchema, type CanvasSpec } from "@/lib/zyra/canvas";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";
import type { z } from "zod";
import type { codingHelpRequestSchema } from "@/lib/coding/http-contracts";

export function CodingHelp({ courseId, context, disabled = false }: { courseId: string; context: z.infer<typeof codingHelpRequestSchema>; disabled?: boolean }) {
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [snapshot, setSnapshot] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<CanvasSpec | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const sessionId = useRef<string | null>(null);
  const contextKey = JSON.stringify(context);
  const questionId = useId();
  const composerId = useId();
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const hasExecutionError = ["syntax_error", "runtime_error", "timeout"].includes(context.execution?.status ?? "");
  const actions = [
    { intent: "hint", label: "Petunjuk", icon: Lightbulb, message: "Beri saya petunjuk berikutnya, tanpa langsung memberikan seluruh solusi." },
    { intent: "decompose", label: "Pecah masalah", icon: ListTree, message: "Bantu pecah masalah ini menjadi langkah kecil dengan bahasa sederhana." },
    { intent: "flowchart", label: "Flowchart", icon: GitBranch, message: "Buat flowchart untuk langkah penyelesaian. Jelaskan apakah ini rencana solusi atau logika kode saya." },
    { intent: "explain_error", label: "Jelaskan error", icon: Bug, message: "Jelaskan kesalahan kode saya berdasarkan hasil yang ada. Jika menduga miskonsepsi, nyatakan sebagai kemungkinan dan tanyakan untuk memastikan." },
  ] as const;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (composerOpen) questionInput.current?.focus(); }, [composerOpen]);
  async function ask(intent: z.infer<typeof codingHelpRequestSchema>["intent"], message: string) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setAnswer(""); setCanvas(null); setSnapshot(contextKey);
    try {
      const response = await fetch("/api/zyra/chat", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, sessionId: sessionId.current, question: message, requestId: crypto.randomUUID(), codingContext: { ...context, intent } }) });
      if (!response.ok) { const body = await response.json(); throw new Error(body.error ?? "Zyra belum dapat merespons."); }
      if (!response.body) throw new Error("Respons Zyra belum tersedia.");
      for await (const part of consumeZyraStream(response.body, abort.signal)) {
        if (part.type === "text-delta") setAnswer((text) => text + part.textDelta);
        if (part.type === "data-session") sessionId.current = part.sessionId;
        if (part.type === "data-canvas") { const parsed = CanvasSpecSchema.safeParse(part.canvasSpec); if (parsed.success) setCanvas(parsed.data); }
        if (part.type === "data-error") setError(part.data.message);
      }
    } catch (error) { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Zyra belum dapat merespons."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <section className="min-w-0 space-y-3 border-t border-border pt-4" aria-label="Konsultasi Zyra">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="mr-auto shrink-0 font-heading text-body-base font-bold">Zyra</h3>
      <TooltipProvider>
        {actions.map(({ intent, label, icon: Icon, message }) => <Tooltip key={intent}>
          <TooltipTrigger asChild>
            <Button className="size-10 shrink-0 px-0 text-body-sm sm:w-auto sm:px-2.5" variant={intent === "explain_error" && hasExecutionError ? "destructive" : "outline"} aria-label={label} disabled={busy || disabled} onClick={() => ask(intent, message)}>
              <Icon className="size-4" aria-hidden="true" /><span className="hidden sm:inline">{label}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>)}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="size-10 shrink-0 px-0 text-body-sm sm:w-auto sm:px-2.5" variant={composerOpen ? "secondary" : "outline"} aria-label={composerOpen ? "Tutup pertanyaan" : "Tulis pertanyaan"} aria-expanded={composerOpen} aria-controls={composerId} disabled={disabled} onClick={() => setComposerOpen((open) => !open)}>
              {composerOpen ? <X className="size-4" aria-hidden="true" /> : <MessageSquare className="size-4" aria-hidden="true" />}<span className="hidden sm:inline">{composerOpen ? "Tutup" : "Tulis pertanyaan"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{composerOpen ? "Tutup pertanyaan" : "Tulis pertanyaan"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
    {composerOpen ? <form id={composerId} className="space-y-2" onSubmit={(event) => { event.preventDefault(); if (!busy && !disabled && question.trim()) void ask("review", question); }}>
      <label className="block text-body-sm" htmlFor={questionId}>Pertanyaan</label>
      <Textarea ref={questionInput} id={questionId} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} placeholder="Tanyakan tentang kode atau langkah penyelesaian" className="text-body-sm" disabled={disabled} />
      <Button type="submit" className="text-body-sm" disabled={busy || disabled || !question.trim()}><Send className="size-4" aria-hidden="true" />Tanya Zyra</Button>
    </form> : null}
    {busy ? <p role="status" className="text-body-xs text-muted-foreground">Zyra sedang meninjau kode...</p> : null}
    {snapshot !== null && snapshot !== contextKey ? <p className="text-body-xs text-muted-foreground">Penjelasan ini merujuk pada percobaan sebelum perubahan terakhir.</p> : null}
    {error ? <p role="alert" className="text-body-sm text-destructive">{error}</p> : null}
    {answer ? <div className="min-w-0"><MarkdownRenderer content={answer} /></div> : null}
    {canvas ? <LearningCanvasRenderer spec={canvas} embedded /> : null}
  </section>;
}
