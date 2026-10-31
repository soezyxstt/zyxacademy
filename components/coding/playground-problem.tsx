"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ZyraAttachmentComposer, type ZyraAttachmentComposerHandle } from "@/components/course/zyra-attachment-composer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { zyraImageFilesFromClipboard } from "@/lib/zyra/images/composer";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { consumeZyraStream } from "@/lib/zyra/stream-consumer";
import type { codingHelpRequestSchema } from "@/lib/coding/http-contracts";
import type { z } from "zod";

export function PlaygroundProblem({ courseId, context, problem, onProblemChange, onUseCode }: {
  courseId: string; context: z.infer<typeof codingHelpRequestSchema>; problem: string;
  onProblemChange: (value: string) => void; onUseCode: (code: string) => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(""), [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<string[]>([]), [ready, setReady] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const attachmentComposer = useRef<ZyraAttachmentComposerHandle>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const currentCode = useRef(context.code);
  currentCode.current = context.code;
  const code = answer.match(/```(?:python|py)\s*\n([\s\S]*?)```/i)?.[1];
  async function generate() {
    if (busy || !ready || (!problem.trim() && attachments.length === 0)) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setAnswer(""); setError("");
    const originalCode = context.code;
    let generatedAnswer = "", failed = false, complete = false;
    try {
      const response = await fetch("/api/zyra/chat", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, sessionId, attachmentIds: attachments, requestId: crypto.randomUUID(), question: `Bantu selesaikan masalah berikut dengan kode Python lengkap dan komentar yang menjelaskan langkah penting. Tampilkan kode dalam satu blok Python.\n\n${problem}`, codingContext: { ...context, intent: "generate" } }) });
      if (!response.ok || !response.body) throw new Error("Zyra belum dapat membuat kode. Periksa akses dan coba lagi.");
      for await (const part of consumeZyraStream(response.body, abort.signal)) {
        if (part.type === "text-delta") { generatedAnswer += part.textDelta; setAnswer(value => value + part.textDelta); }
        if (part.type === "data-session") setSessionId(part.sessionId);
        if (part.type === "data-error") { failed = true; setError(part.data.message); }
        if (part.type === "done") complete = true;
      }
      if (!failed && !abort.signal.aborted) {
        const generatedCode = generatedAnswer.match(/```(?:python|py)\s*\n([\s\S]*?)```/i)?.[1];
        if (!complete || !generatedCode?.trim() || generatedCode.length > 64000) setError("Kode belum tersedia. Coba buat kode lagi.");
        else if (currentCode.current !== originalCode) setError("Kode berubah saat Zyra membuat jawaban. Kode di editor tetap dipertahankan.");
        else onUseCode(generatedCode.replace(/\n$/, ""));
      }
    } catch { if (!abort.signal.aborted) setError("Zyra belum dapat membuat kode. Coba lagi."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <div className="overflow-hidden rounded-t-lg border border-b-0 border-border bg-card">
    <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={open} onClick={() => setOpen(value => !value)}><span>Masalah yang ingin diselesaikan</span><ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
    <div hidden={!open} className="space-y-2 border-t border-border p-3">
      <Textarea aria-label="Deskripsi masalah" placeholder="Jelaskan masalah atau tugasmu" value={problem} maxLength={4000} onChange={event => onProblemChange(event.target.value)} onPaste={event => { if (busy) return; const files = zyraImageFilesFromClipboard(event.clipboardData.items, event.clipboardData.files); if (files.length) { event.preventDefault(); attachmentComposer.current?.addFiles(files); } }} rows={2} />
      <ZyraAttachmentComposer ref={attachmentComposer} courseId={courseId} sessionId={sessionId} disabled={busy} hideStandaloneTrigger onSessionCreated={setSessionId} onAttachmentIdsChange={setAttachments} onAttachmentsReadyChange={setReady} />
      <div className="flex items-center justify-between gap-2"><TooltipProvider><Tooltip><TooltipTrigger asChild><Button type="button" size="icon-sm" variant="ghost" aria-label="Tambahkan gambar" disabled={busy} onClick={() => attachmentComposer.current?.openFileDialog()}><Paperclip className="size-4" /></Button></TooltipTrigger><TooltipContent>Tambahkan gambar</TooltipContent></Tooltip></TooltipProvider><Button size="sm" onClick={generate} disabled={busy || !ready || (!problem.trim() && attachments.length === 0)}>{busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : null}Buat kode</Button></div>
      {error ? <p role="alert" className="text-body-sm text-destructive">{error}</p> : null}
      {answer ? <div className="space-y-2 border-t border-border pt-2"><MarkdownRenderer content={answer} />{code && !busy && !error ? <Button size="sm" variant="outline" onClick={() => onUseCode(code)}>Gunakan kode di editor</Button> : null}</div> : busy ? <p role="status" className="text-body-xs text-muted-foreground">Zyra sedang membuat kode...</p> : null}
    </div>
  </div>;
}
