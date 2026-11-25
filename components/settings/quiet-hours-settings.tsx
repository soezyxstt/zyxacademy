"use client";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAppLocale } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { DEFAULT_QUIET_HOURS, quietHoursSchema, type QuietHours } from "@/lib/notifications/quiet-hours";

const timeText = (minutes: number) => `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;
const fromTime = (value: string) => { const [h,m] = value.split(":").map(Number); return h*60+m; };

export function QuietHoursSettings() {
 const { locale } = useAppLocale();
 const en = locale === "en";
 const demo = useStudentExperience().mode === "demo";
 const id = useId();
 const [settings, setSettings] = useState<QuietHours | null>(demo ? DEFAULT_QUIET_HOURS : null);
 const [failed,setFailed] = useState(false);
 const [pending,setPending] = useState(false);
 const [retry,setRetry] = useState(0);
 const [saved,setSaved] = useState<QuietHours | null>(demo ? DEFAULT_QUIET_HOURS : null);
 useEffect(() => {
  if (demo) return;
  const abort = new AbortController();
  setFailed(false);
  void fetch("/api/notifications/quiet-hours", { cache: "no-store", credentials: "include", signal: abort.signal })
   .then(async res => {
    if (!res.ok) throw Error("QUIET_LOAD_FAILED");
    const value = quietHoursSchema.parse(await res.json());
    if (!abort.signal.aborted) { setSettings(value); setSaved(value); }
   }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
  return () => abort.abort();
 }, [demo,retry]);
 async function save() {
  if (!settings || pending || !quietHoursSchema.safeParse(settings).success) return;
  setPending(true);
  try {
   if (!demo) {
    const res = await fetch("/api/notifications/quiet-hours", { method: "PUT", credentials: "include", headers: {"Content-Type":"application/json"}, body: JSON.stringify(settings) });
    if (!res.ok) throw Error("QUIET_SAVE_FAILED");
   }
   setSaved(settings);
   window.dispatchEvent(new CustomEvent("zyx:quiet-hours-changed"));
   toast.success(en ? "Quiet hours saved" : "Jam tenang disimpan");
  } catch { toast.error(en ? "Could not save quiet hours" : "Jam tenang belum berhasil disimpan"); }
  finally { setPending(false); }
 }
 const valid = settings ? quietHoursSchema.safeParse(settings).success : false;
 const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
 const currentZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Jakarta";
 const zones = [...new Set(["Asia/Jakarta","Asia/Makassar","Asia/Jayapura",currentZone, settings?.timeZone].filter((v): v is string => Boolean(v)))];
 return <section className="space-y-3" aria-labelledby={id+"-title"}>
  <header className="space-y-1 border-b border-border/40 pb-3">
   <h2 id={id+"-title"} className="font-heading text-body-base font-bold">{en ? "Quiet hours" : "Jam tenang"}</h2>
   <p className="text-body-xs text-muted-foreground">{en ? "New updates stay in your inbox. A summary of unread notifications is sent when quiet hours end." : "Notifikasi baru tetap masuk ke riwayat. Ringkasan notifikasi yang belum dibaca akan dikirim setelah jam tenang berakhir."}</p>
  </header>
  {failed ? <div className="space-y-2"><p role="alert" className="text-body-sm">{en ? "Could not load quiet hours." : "Jam tenang gagal dimuat."}</p><Button size="sm" variant="outline" onClick={() => setRetry(v => v+1)}>{en ? "Try again" : "Coba lagi"}</Button></div> :
   !settings ? <p role="status" className="text-body-xs text-muted-foreground">{en ? "Loading…" : "Memuat…"}</p> :
   <>
    <div className="flex justify-between items-center gap-4">
     <div><label htmlFor={id+"-enabled"} className="text-body-sm font-medium">{en ? "Enable quiet hours" : "Aktifkan jam tenang"}</label><p className="text-body-xs text-muted-foreground">{en ? "Applies to your account on all devices." : "Berlaku untuk akun Anda di semua perangkat."}</p></div>
     <Switch id={id+"-enabled"} checked={settings.enabled} disabled={pending} onCheckedChange={enabled => setSettings(v => v && ({...v,enabled}))}/>
    </div>
    {settings.enabled && <div className="space-y-3">
     <div className="grid grid-cols-2 gap-3">
      <label className="text-body-xs font-medium space-y-1">{en ? "From" : "Mulai"}<Input type="time" value={timeText(settings.startMinute)} disabled={pending} onChange={e => {const startMinute=fromTime(e.target.value);if(Number.isFinite(startMinute)) setSettings(v => v && ({...v,startMinute}));}}/></label>
      <label className="text-body-xs font-medium space-y-1">{en ? "Until" : "Sampai"}<Input type="time" value={timeText(settings.endMinute)} disabled={pending} onChange={e => {const endMinute=fromTime(e.target.value);if(Number.isFinite(endMinute)) setSettings(v => v && ({...v,endMinute}));}}/></label>
     </div>
     <label className="block text-body-xs font-medium space-y-1">{en ? "Time zone" : "Zona waktu"}<select className="w-full rounded-md border border-input bg-background p-2 text-body-sm" value={settings.timeZone} disabled={pending} onChange={e => setSettings(v => v && ({...v,timeZone:e.target.value}))}>{zones.map(zone => <option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}</select></label>
     {!valid && <p role="alert" className="text-body-xs text-destructive">{en ? "Choose different start and end times." : "Jam mulai dan selesai harus berbeda."}</p>}
     {settings.startMinute > settings.endMinute && <p className="text-body-xs text-muted-foreground">{en ? "Ends the next morning." : "Berakhir keesokan harinya."}</p>}
    </div>}
    <div className="flex justify-end"><Button size="sm" disabled={!valid || !dirty || pending} onClick={() => void save()}>{pending ? (en ? "Saving…" : "Menyimpan…") : (en ? "Save quiet hours" : "Simpan jam tenang")}</Button></div>
   </>}
 </section>;
}
