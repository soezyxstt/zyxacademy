"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ZyraAttachmentComposer } from "@/components/course/zyra-attachment-composer";
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
  useEffect(() => () => controller.current?.abort(), []);
  const code = answer.match(/```(?:python|py)\s*\n([\s\S]*?)```/i)?.[1];
  async function generate() {
    if (busy || !ready || (!problem.trim() && attachments.length === 0)) return;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setAnswer(""); setError("");
    try {
      const response = await fetch("/api/zyra/chat", { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, sessionId, attachmentIds: attachments, requestId: crypto.randomUUID(), question: `Bantu selesaikan masalah berikut dengan kode Python lengkap dan komentar yang menjelaskan langkah penting. Tampilkan kode dalam satu blok Python.\n\n${problem}`, codingContext: { ...context, intent: "review" } }) });
      if (!response.ok || !response.body) throw new Error("Zyra belum dapat membuat kode. Periksa akses dan coba lagi.");
      for await (const part of consumeZyraStream(response.body, abort.signal)) {
        if (part.type === "text-delta") setAnswer(value => value + part.textDelta);
        if (part.type === "data-session") setSessionId(part.sessionId);
        if (part.type === "data-error") setError(part.data.message);
      }
    } catch { if (!abort.signal.aborted) setError("Zyra belum dapat membuat kode. Coba lagi."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <div className="overflow-hidden rounded-t-lg border border-b-0 border-border bg-card">
    <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-expanded={open} onClick={() => setOpen(value => !value)}><span className="flex items-center gap-2"><Sparkles className="size-4 text-primary" />Masalah yang ingin diselesaikan</span><ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
    <div hidden={!open} className="space-y-2 border-t border-border p-3">
      <Textarea aria-label="Deskripsi masalah" placeholder="Jelaskan masalah atau tugasmu" value={problem} maxLength={4000} onChange={event => onProblemChange(event.target.value)} rows={2} />
      <div className="flex flex-wrap items-center justify-between gap-2"><ZyraAttachmentComposer courseId={courseId} sessionId={sessionId} disabled={busy} onSessionCreated={setSessionId} onAttachmentIdsChange={setAttachments} onAttachmentsReadyChange={setReady} /><Button size="sm" onClick={generate} disabled={busy || !ready || (!problem.trim() && attachments.length === 0)}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Buat kode</Button></div>
      {error ? <p role="alert" className="text-body-sm text-destructive">{error}</p> : null}
      {answer ? <div className="space-y-2 border-t border-border pt-2"><MarkdownRenderer content={answer} />{code && !busy ? <Button size="sm" variant="outline" onClick={() => onUseCode(code)}>Gunakan kode di editor</Button> : null}</div> : busy ? <p role="status" className="text-body-xs text-muted-foreground">Zyra sedang membuat kode...</p> : null}
    </div>
  </div>;
}
