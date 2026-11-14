"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCalendarDays, getCalendarWeekRange, getJakartaCalendarDate } from "@/lib/date-utils";
import { demoSessionSchema, demoWeekSessions, type DemoResource, type DemoSession } from "@/lib/demo-state";
import { deleteDemoFile, readDemoFile, storeDemoFile } from "@/lib/demo-files";
import { useDemoState } from "./use-demo-state";

export function DemoSchedule({ coursePath, chapter }: { coursePath: string; chapter: string }) {
  const { state, save, ready, error } = useDemoState(coursePath);
  const [day, setDay] = useState("");
  const [draft, setDraft] = useState<DemoSession | null>(null);
  const [pendingFiles, setPendingFiles] = useState<Record<string, File>>({});
  const [phase, setPhase] = useState<"pre" | "post">("pre");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fileError, setFileError] = useState("");
  useEffect(() => { setDay(getJakartaCalendarDate()); }, []);
  const sessions = day ? demoWeekSessions(day, chapter, state.sessions) : [];
  const week = day ? getCalendarWeekRange(day) : null;

  const edit = (session: DemoSession) => {
    setDraft(session); setPendingFiles({}); setLink(""); setPhase("pre"); setFileError(""); setMessage("");
  };
  const persist = async () => {
    if (!draft) return;
    const parsed = demoSessionSchema.safeParse(draft);
    if (!parsed.success) { setFileError("Periksa tanggal, waktu, topik, dan lampiran. Maksimal 40 lampiran per sesi."); return; }
    setBusy(true); setFileError("");
    const written: string[] = [];
    try {
      for (const resource of draft.resources) {
        if (pendingFiles[resource.id]) {
          await storeDemoFile(coursePath, resource.id, pendingFiles[resource.id]);
          written.push(resource.id);
        }
      }
      if (!save(current => ({ ...current, sessions: { ...current.sessions, [draft.id]: parsed.data } }))) {
        await Promise.allSettled(written.map(id => deleteDemoFile(coursePath, id)));
        return;
      }
      const previous = state.sessions[draft.id]?.resources ?? [];
      const removed = previous.filter(resource => resource.kind === "file" && !draft.resources.some(next => next.id === resource.id));
      const cleanup = await Promise.allSettled(removed.map(resource => deleteDemoFile(coursePath, resource.id)));
      setDraft(null);
      setMessage(cleanup.some(result => result.status === "rejected") ? "Jadwal tersimpan. Sebagian berkas lama belum terhapus dari browser." : "Jadwal tersimpan di browser.");
    } catch {
      await Promise.allSettled(written.map(id => deleteDemoFile(coursePath, id)));
      setFileError("Berkas belum tersimpan. Penyimpanan browser penuh atau diblokir. Coba lagi atau pilih berkas lebih kecil.");
    } finally { setBusy(false); }
  };
  const download = async (resource: DemoResource) => {
    try {
      const file = pendingFiles[resource.id] ?? await readDemoFile(coursePath, resource.id);
      if (!(file instanceof Blob)) throw new Error("MISSING_FILE");
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = resource.name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setFileError("Berkas tidak tersedia di browser ini. Unggah kembali berkasnya."); }
  };

  return (
    <div className="mt-5" aria-busy={!ready || !day}>
      <p className="text-body-xs text-muted-foreground">Perubahan dan berkas hanya tersimpan di browser ini. Menghapus data browser akan menghapus demo tersimpan.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="text-body-sm" disabled={!day} onClick={() => setDay(addCalendarDays(day, -7))}>Minggu sebelumnya</Button>
        <Button variant="outline" size="sm" className="text-body-sm" onClick={() => setDay(getJakartaCalendarDate())}>Minggu ini</Button>
        <Button variant="outline" size="sm" className="text-body-sm" disabled={!day} onClick={() => setDay(addCalendarDays(day, 7))}>Minggu berikutnya</Button>
        <div className="flex items-center gap-2"><Label htmlFor="demo-week">Tanggal</Label><Input id="demo-week" type="date" value={day} disabled={!ready || !day} className="w-auto" onChange={event => { if (event.target.value) setDay(event.target.value); }} /></div>
        <Button size="sm" className="text-body-sm" disabled={!ready || !day} onClick={() => edit({ id: crypto.randomUUID(), date: day, time: "19:00", topic: chapter, notes: "", status: "booked", resources: [] })}>Pesan sesi</Button>
      </div>
      {week && <p className="mt-3 text-body-xs text-muted-foreground">{week.startIso} sampai {week.endIso}, WIB</p>}
      {(error || message) && <p role="status" className="mt-3 text-body-sm">{error || message}</p>}
      <ul className="mt-3 divide-y divide-border">
        {sessions.map(session => (
          <li key={session.id} className="flex flex-wrap items-start gap-3 py-4">
            <CalendarDays className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold">{session.date}, {session.time} WIB</p>
              <p className="mt-1 break-words text-body-sm">{session.topic}</p>
              <p className="mt-1 break-words text-body-xs text-muted-foreground">{state.groupName}</p>
              <Badge variant="outline" className="mt-2">{session.status === "cancelled" ? "Dibatalkan" : session.status === "completed" ? "Selesai" : "Terjadwal"}</Badge>
            </div>
            <Button size="sm" className="text-body-sm" variant="outline" disabled={!ready} onClick={() => edit(session)}>Detail sesi</Button>
          </li>
        ))}
      </ul>
      {ready && day && sessions.length === 0 && <AdminEmptyState icon={CalendarDays} title="Tidak ada sesi minggu ini" description="Sesi telah dipindahkan. Pilih minggu lain atau pesan sesi." />}

      <Dialog open={draft !== null} onOpenChange={open => { if (!open && !busy) setDraft(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detail sesi</DialogTitle><DialogDescription>Jadwal, catatan, dan lampiran tersimpan di browser ini.</DialogDescription></DialogHeader>
          {draft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void persist(); }}>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="demo-date">Tanggal sesi</Label><Input id="demo-date" type="date" required value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} /></div>
              <div className="space-y-2"><Label htmlFor="demo-time">Waktu WIB</Label><Input id="demo-time" type="time" required value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} /></div>
            </div>
            <div className="space-y-2"><Label htmlFor="demo-topic">Topik</Label><Input id="demo-topic" required maxLength={200} value={draft.topic} onChange={event => setDraft({ ...draft, topic: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="demo-note">Catatan sesi</Label><Textarea id="demo-note" maxLength={4000} value={draft.notes} onChange={event => setDraft({ ...draft, notes: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="demo-status">Status sesi</Label><Select value={draft.status} onValueChange={(status: DemoSession["status"]) => setDraft({ ...draft, status })}><SelectTrigger id="demo-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="booked">Terjadwal</SelectItem><SelectItem value="completed">Selesai</SelectItem><SelectItem value="cancelled">Dibatalkan</SelectItem></SelectContent></Select></div>
            <div className="space-y-2">
              <Label htmlFor="demo-phase">Lampiran</Label>
              <Select value={phase} onValueChange={(value: "pre" | "post") => setPhase(value)}><SelectTrigger id="demo-phase"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pre">Sebelum sesi</SelectItem><SelectItem value="post">Sesudah sesi</SelectItem></SelectContent></Select>
              <Button asChild variant="outline" size="sm" className="text-body-sm relative focus-within:ring-2 focus-within:ring-ring"><label><Upload className="size-4" aria-hidden="true" /> Unggah berkas<input aria-label="Unggah berkas" type="file" multiple className="absolute inset-0 cursor-pointer opacity-0" disabled={busy} onChange={event => {
                const files = Array.from(event.target.files ?? []);
                const additions = files.map(file => ({ id: crypto.randomUUID(), phase, kind: "file" as const, name: file.name }));
                setPendingFiles(current => ({ ...current, ...Object.fromEntries(additions.map((resource, index) => [resource.id, files[index]])) }));
                setDraft({ ...draft, resources: [...draft.resources, ...additions] }); event.target.value = "";
              }} /></label></Button>
              <div className="flex flex-wrap gap-2"><Input aria-label="Tautan materi" type="url" placeholder="https://" value={link} onChange={event => setLink(event.target.value)} className="min-w-[140px] flex-1" /><Button type="button" variant="outline" size="sm" className="text-body-sm" onClick={() => {
                const parsed = demoSessionSchema.shape.resources.element.safeParse({ id: crypto.randomUUID(), kind: "link", phase, name: link, url: link });
                if (!parsed.success) { setFileError("Gunakan tautan http atau https yang valid, maksimal 200 karakter."); return; }
                setDraft({ ...draft, resources: [...draft.resources, parsed.data] }); setLink(""); setFileError("");
              }}>Tambah tautan</Button></div>
              <ul className="divide-y divide-border">{draft.resources.map(resource => (
                <li key={resource.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-0 flex-1"><p className="text-body-xs text-muted-foreground">{resource.phase === "pre" ? "Sebelum sesi" : "Sesudah sesi"}</p>
                    {resource.kind === "link" ? <a href={resource.url} target="_blank" rel="noopener noreferrer" className="break-all text-body-sm underline">{resource.name}</a> : <Button type="button" variant="link" className="h-auto max-w-full whitespace-normal break-all p-0 text-left" onClick={() => void download(resource)}>{resource.name}</Button>}
                  </div>
                  <Button type="button" variant="outline" size="sm" className="text-body-sm" onClick={() => setDraft({ ...draft, resources: draft.resources.filter(item => item.id !== resource.id) })} disabled={busy}>Hapus</Button>
                </li>
              ))}</ul>
            </div>
            {(fileError || error) && <p role="alert" className="text-body-sm text-status-error">{fileError || error}</p>}
            <Button type="submit" disabled={busy}>{busy ? "Menyimpan..." : "Simpan sesi"}</Button>
            </fieldset>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
