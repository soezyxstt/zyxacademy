"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Bug, GitBranch, Lightbulb, ListTree, Loader2, Send } from "lucide-react";
import { CanvasSpecSchema, type CanvasSpec } from "@/lib/zyra/canvas";
import { LearningCanvasRenderer } from "@/components/course/learning-canvas/learning-canvas-renderer";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";
import type { z } from "zod";
import type { codingHelpRequestSchema } from "@/lib/coding/http-contracts";

export function CodingHelp({ courseId, context, disabled = false, problemDescription = "", compact = false }: { courseId: string; context: z.infer<typeof codingHelpRequestSchema>; disabled?: boolean; problemDescription?: string; compact?: boolean }) {
  const [question, setQuestion] = useState(""), [answer, setAnswer] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [snapshot, setSnapshot] = useState<string | null>(null);
  const [activeIntent, setActiveIntent] = useState<z.infer<typeof codingHelpRequestSchema>["intent"]>("review");
  const [canvas, setCanvas] = useState<CanvasSpec | null>(null);
  const sessionId = useRef<string | null>(null);
  const contextKey = JSON.stringify(context);
  const hasExecutionError = ["syntax_error", "runtime_error", "timeout"].includes(context.execution?.status ?? "");
  const actions = [
    { intent: "hint", label: "Petunjuk", icon: Lightbulb, message: "Beri saya petunjuk berikutnya, tanpa langsung memberikan seluruh solusi." },
    { intent: "decompose", label: "Pecah masalah", icon: ListTree, message: "Bantu pecah masalah ini menjadi langkah kecil dengan bahasa sederhana." },
    { intent: "flowchart", label: "Flowchart", icon: GitBranch, message: "Buat flowchart untuk langkah penyelesaian. Jelaskan apakah ini rencana solusi atau logika kode saya." },
    { intent: "explain_error", label: "Jelaskan error", icon: Bug, message: "Jelaskan penyebab error dari kode dan hasil Run saya. Bedakan temuan yang terlihat dari kemungkinan cara berpikir saya, lalu ajukan satu pertanyaan untuk memastikan dugaan itu. Beri satu petunjuk kecil tanpa menuliskan seluruh solusi. Ajak saya memprediksi hasil dan mencoba Run lagi, lalu tutup dengan dorongan yang konkret." },
  ] as const;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function ask(intent: z.infer<typeof codingHelpRequestSchema>["intent"], message: string) {
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setActiveIntent(intent); setBusy(true); setError(""); setAnswer(""); setCanvas(null); setSnapshot(contextKey);
    try {
      const response = await fetch("/api/zyra/chat", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, sessionId: sessionId.current, question: problemDescription ? `Masalah yang sedang dikerjakan: ${problemDescription}

${message}` : message, requestId: crypto.randomUUID(), codingContext: { ...context, intent } }) });
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
  function submitQuestion() { if (!busy && !disabled && question.trim()) void ask("review", question); }
  return <section className="min-w-0 space-y-2" aria-label="Konsultasi Zyra">
    {!compact || busy ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1">{!compact ? <h3 className="font-heading text-body-base font-bold">Zyra</h3> : null}{busy ? <p role="status" className="flex items-center gap-1.5 text-body-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{answer ? "Zyra sedang menjawab..." : activeIntent === "explain_error" ? "Zyra sedang meninjau error..." : activeIntent === "flowchart" ? "Zyra sedang menyusun flowchart..." : activeIntent === "decompose" ? "Zyra sedang menguraikan masalah..." : activeIntent === "hint" ? "Zyra sedang menyiapkan petunjuk..." : "Zyra sedang meninjau pertanyaan..."}</p> : null}</div> : null}
    <form className={cn("min-w-0", compact ? "flex flex-wrap items-center gap-2" : "space-y-2")} onSubmit={(event) => { event.preventDefault(); submitQuestion(); }}>
      <div role="toolbar" aria-label="Bantuan cepat" className="flex flex-wrap items-center gap-1.5">
        <TooltipProvider>
          {actions.map(({ intent, label, icon: Icon, message }) => { const highlighted = intent === "explain_error" && hasExecutionError; return <Tooltip key={intent}>
            <TooltipTrigger asChild>
              <Button type="button" size="sm" className={cn("size-7 shrink-0 px-0 text-body-sm", !compact && "sm:w-auto sm:px-2", !highlighted && "bg-primary/10 text-primary hover:bg-primary/20")} variant={highlighted ? "destructive" : "ghost"} aria-label={label} disabled={busy || disabled} onClick={() => ask(intent, message)}>
                <Icon className="size-3.5" aria-hidden="true" />{!compact ? <span className="hidden sm:inline">{label}</span> : null}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>; })}
        </TooltipProvider>
      </div>
      <Collapsible open={compact ? undefined : true} className={compact ? "min-w-0 flex-1 data-[state=open]:basis-full" : undefined}>
        {compact ? <CollapsibleTrigger asChild><Button type="button" variant="ghost" size="sm" className="px-2">Tanya tentang kode</Button></CollapsibleTrigger> : null}
      <CollapsibleContent forceMount className="data-[state=closed]:hidden">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background p-1.5 focus-within:border-ring">
        <Textarea aria-label="Pertanyaan" rows={1} value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submitQuestion(); } }} maxLength={2000} placeholder="Tanyakan tentang kode atau langkah penyelesaian" className="field-sizing-content max-h-40 min-h-8 resize-none border-0 bg-transparent px-1.5 py-1.5 shadow-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" disabled={disabled} />
        <Button type="submit" size="icon-sm" aria-label="Tanya Zyra" disabled={busy || disabled || !question.trim()}><Send className="size-3.5" aria-hidden="true" /></Button>
      </div>
      </CollapsibleContent>
      </Collapsible>
    </form>
    {(answer || canvas || error || (snapshot !== null && snapshot !== contextKey)) ? <div className="min-w-0 space-y-2 border-t border-border pt-2">
    {snapshot !== null && snapshot !== contextKey ? <p className="text-body-xs text-muted-foreground">Penjelasan ini merujuk pada percobaan sebelum perubahan terakhir.</p> : null}
    {error ? <p role="alert" className="text-body-sm text-destructive">{error}</p> : null}
    {answer ? <div className="min-w-0"><MarkdownRenderer content={answer} /></div> : null}
    {canvas ? <LearningCanvasRenderer spec={canvas} embedded /> : null}
    </div> : null}
  </section>;
}
