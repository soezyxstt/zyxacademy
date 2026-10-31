"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, MessageSquare, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ZyraAttachmentComposer, type ZyraAttachmentComposerHandle } from "@/components/course/zyra-attachment-composer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";
import type { codingHelpRequestSchema } from "@/lib/coding/http-contracts";
import type { z } from "zod";

export function PlaygroundProblem({ courseId, context, problem, onProblemChange, onUseCode, onGeneratedCode, children }: {
  courseId: string; context: z.infer<typeof codingHelpRequestSchema>; problem: string;
  onProblemChange: (value: string) => void; onUseCode: (code: string) => void;
  onGeneratedCode: (code: string) => void; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(""), [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]), [ready, setReady] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const attachmentComposer = useRef<ZyraAttachmentComposerHandle>(null);
  const panelId = useId();
  useEffect(() => () => controller.current?.abort(), []);
  const code = answer.match(/```(?:python|py)\s*\n([\s\S]*?)```/i)?.[1];
  async function generate() {
    if (busy || !ready || (!problem.trim() && attachments.length === 0)) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setAnswer(""); setError("");
    try {
      let text = "", failed = false, completed = false;
      const response = await fetch("/api/zyra/chat", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, sessionId, attachmentIds: attachments, requestId: crypto.randomUUID(), question: `Bantu selesaikan masalah berikut dengan kode Python lengkap dan komentar yang menjelaskan langkah penting. Tampilkan kode dalam satu blok Python.\n\n${problem}`, codingContext: { ...context, intent: "review" } }) });
      if (!response.ok || !response.body) throw new Error("Zyra belum dapat membuat kode. Periksa akses dan coba lagi.");
      for await (const part of consumeZyraStream(response.body, abort.signal)) {
        if (part.type === "text-delta") { text += part.textDelta; setAnswer(text); }
        if (part.type === "data-session") setSessionId(part.sessionId);
        if (part.type === "data-error") { failed = true; setError(part.data.message); }
        if (part.type === "done") completed = true;
      }
      const generated = text.match(/```(?:python|py)\s*\n([\s\S]*?)```/i)?.[1];
      if (completed && !failed && !abort.signal.aborted && generated) onGeneratedCode(generated);
    } catch { if (!abort.signal.aborted) setError("Zyra belum dapat membuat kode. Coba lagi."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  const explanation = answer.replace(/```(?:python|py)\s*\n[\s\S]*?(?:```|$)/gi, "").trim();
  return <div className="fixed bottom-4 right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end">
    <div id={panelId} hidden={!open} className="mb-2 flex max-h-[min(70dvh,32rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg [&[hidden]]:hidden">
      <div className="min-h-0 overflow-y-auto p-2.5">
        {error ? <p role="alert" className="mb-2 text-body-xs text-destructive">{error}</p> : null}
        {explanation || code ? <div className="space-y-2 pb-2 text-body-sm">{explanation ? <MarkdownRenderer content={explanation} density="compact" /> : null}{code && !busy ? <Button size="sm" variant="outline" onClick={() => onUseCode(code)}>Gunakan kode di editor</Button> : null}</div> : null}
        {children}
      </div>
      <div className="shrink-0 space-y-1 border-t border-border p-2">
        <ZyraAttachmentComposer ref={attachmentComposer} courseId={courseId} sessionId={sessionId} disabled={busy} hideStandaloneTrigger onSessionCreated={setSessionId} onAttachmentIdsChange={setAttachments} onAttachmentsReadyChange={setReady} />
        <Textarea aria-label="Deskripsi masalah" placeholder="Jelaskan masalah atau tugasmu" value={problem} maxLength={4000} onChange={event => onProblemChange(event.target.value)} onPaste={event => { if (busy) return; const files = zyraImageFilesFromClipboard(event.clipboardData.items, event.clipboardData.files); if (files.length) { event.preventDefault(); attachmentComposer.current?.addFiles(files); } }} rows={1} className="field-sizing-content max-h-28 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-offset-0" />
        <div className="flex items-center gap-2"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="Tambahkan gambar" disabled={busy} onClick={() => attachmentComposer.current?.openFileDialog()}><Paperclip className="size-4" /></Button></TooltipTrigger><TooltipContent>Tambahkan gambar</TooltipContent></Tooltip></TooltipProvider>{busy ? <p role="status" className="min-w-0 flex-1 text-body-xs text-muted-foreground">Zyra sedang membuat kode...</p> : null}<Button size="sm" className="ml-auto shrink-0" onClick={generate} disabled={busy || !ready || (!problem.trim() && attachments.length === 0)}>{busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}Buat kode</Button></div>
      </div>
    </div>
    <Button type="button" size="sm" aria-label="Masalah yang ingin diselesaikan" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}><MessageSquare className="size-4" aria-hidden="true" />Zyra<ChevronDown className={`size-4 motion-safe:transition-transform ${open ? "" : "rotate-180"}`} aria-hidden="true" /></Button>
  </div>;
}
