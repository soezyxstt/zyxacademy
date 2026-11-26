"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { useAppLocale } from "@/lib/i18n/client";
import { useStudentExperience } from "@/components/student-experience-provider";

type DeviceSession = { id: string; label: string; createdAt: string; updatedAt: string; expiresAt: string; current: boolean };
export function AccountSessions() {
 const { locale } = useAppLocale();
 const en = locale === "en";
 const experience = useStudentExperience();
 const [rows, setRows] = useState<DeviceSession[] | null>(null);
 const [failed, setFailed] = useState(false);
 const [confirm, setConfirm] = useState<string | null>(null);
 const [pending, setPending] = useState(false);
 const [revision, refresh] = useState(0);
 useEffect(() => {
  if (experience.mode === "demo") return;
  const abort = new AbortController();
  setFailed(false);
  void fetch("/api/account/sessions", { credentials: "include", cache: "no-store", signal: abort.signal })
   .then(async res => { if (!res.ok) throw Error("SESSION_LIST_FAILED"); const data = await res.json(); if (!abort.signal.aborted) setRows(data.sessions); })
   .catch(() => { if (!abort.signal.aborted) setFailed(true); });
  return () => abort.abort();
 }, [experience.mode, revision]);
 const date = (value: string) => new Intl.DateTimeFormat(en ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
 async function revoke(id: string) {
  setPending(true);
  try {
   const res = await fetch("/api/account/sessions", { method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
   if (!res.ok) throw Error("REVOKE_FAILED");
   setRows(previous => previous?.filter(row => row.id !== id) ?? null);
   setConfirm(null);
   toast.success(en ? "Session signed out" : "Perangkat telah keluar");
  } catch { toast.error(en ? "Could not sign out this session" : "Perangkat belum berhasil dikeluarkan"); }
  finally { setPending(false); }
 }
 if (experience.mode === "demo") return null;
 return <section className="space-y-3">
  <header className="border-b border-border/40 pb-3 space-y-1">
   <h2 className="font-heading text-body-base font-bold">{en ? "Signed-in devices" : "Perangkat yang masuk"}</h2>
   <p className="text-body-xs text-muted-foreground">{en ? "Review active sessions and sign out devices you no longer use." : "Lihat sesi yang masih aktif dan keluarkan perangkat yang tidak lagi Anda gunakan."}</p>
  </header>
  {failed ? <div className="space-y-2"><p role="alert" className="text-body-sm">{en ? "Could not load devices." : "Daftar perangkat gagal dimuat."}</p><Button variant="outline" size="sm" onClick={() => refresh(v => v + 1)}>{en ? "Try again" : "Coba lagi"}</Button></div> :
   !rows ? <p role="status" className="text-body-sm text-muted-foreground">{en ? "Loading devices…" : "Memuat perangkat…"}</p> :
   <div className="divide-y divide-border/30">{rows.map(row => <div key={row.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0 space-y-1">
     <p className="font-medium text-body-sm">{row.label || (en ? "Unknown device" : "Perangkat tidak dikenal")} {row.current && <span className="text-body-xs text-muted-foreground">({en ? "This device" : "Perangkat ini"})</span>}</p>
     <p className="text-body-xs text-muted-foreground">{en ? "Signed in" : "Masuk"}: {date(row.createdAt)}</p>
     <p className="text-body-xs text-muted-foreground">{en ? "Session renewed" : "Sesi diperbarui"}: {date(row.updatedAt)}</p>
    </div>
    {!row.current && (confirm === row.id ? <div className="flex flex-wrap gap-2 items-center"><span className="text-body-xs">{en ? "Sign out this session?" : "Keluarkan perangkat ini?"}</span><Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirm(null)}>{en ? "Cancel" : "Batal"}</Button><Button variant="destructive" size="sm" disabled={pending} onClick={() => void revoke(row.id)}>{en ? "Sign out" : "Keluarkan"}</Button></div> : <Button variant="outline" size="sm" disabled={pending} className="self-start" onClick={() => setConfirm(row.id)}>{en ? "Sign out device" : "Keluarkan perangkat"}</Button>)}
   </div>)}</div>}
 </section>;
}
