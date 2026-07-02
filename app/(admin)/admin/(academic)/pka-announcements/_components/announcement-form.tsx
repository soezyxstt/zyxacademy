"use client";

import { useActionState, useEffect } from "react";
import { createAndSendPkaAnnouncementAction, type PkaAnnouncementFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "@/components/ui/toast";

const initialState: PkaAnnouncementFormState = {};

export function PkaAnnouncementForm() {
  const [state, formAction, isPending] = useActionState(createAndSendPkaAnnouncementAction, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success(`Pengumuman terkirim ke ${state.result?.recipientCount ?? 0} peserta.`);
    } else if (state.error) {
      toast.error("Gagal mengirim pengumuman", { description: state.error });
    }
  }, [state]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <form action={formAction} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="pka-title" className="text-body-sm font-medium text-foreground">Judul</Label>
          <Input id="pka-title" name="title" required placeholder="Sesi Review Simulasi PKA Matematika" className="rounded-md" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pka-body" className="text-body-sm font-medium text-foreground">Pesan</Label>
          <Textarea id="pka-body" name="body" required rows={4} placeholder="Yuk join sesi review bareng kakak tutor..." className="rounded-md resize-none" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pka-meet-link" className="text-body-sm font-medium text-foreground">Link Google Meet</Label>
            <Input id="pka-meet-link" name="meetLink" type="url" required placeholder="https://meet.google.com/..." className="rounded-md" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pka-session-at" className="text-body-sm font-medium text-foreground">Jadwal sesi</Label>
            <Input id="pka-session-at" name="sessionAt" type="datetime-local" required className="rounded-md" />
          </div>
        </div>

        {state.success && (
          <div className="flex items-center gap-2 rounded-md border border-status-success/30 bg-status-success/8 px-4 py-3">
            <CheckCircle2 className="size-4 shrink-0 text-status-success" />
            <p className="text-body-sm text-status-success">
              Terkirim ke <strong>{state.result?.recipientCount}</strong> peserta ({state.result?.emailsSucceeded} email, {state.result?.notificationsSucceeded} notifikasi berhasil).
            </p>
          </div>
        )}

        {state.error && (
          <div className="flex items-center gap-2 rounded-md border border-status-error/30 bg-status-error/8 px-4 py-3">
            <AlertCircle className="size-4 shrink-0 text-status-error" />
            <p className="text-body-sm text-status-error">{state.error}</p>
          </div>
        )}

        <Button type="submit" disabled={isPending} className="w-full gap-2 rounded-lg">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {isPending ? "Mengirim..." : "Kirim Pengumuman"}
        </Button>
      </form>
    </div>
  );
}
