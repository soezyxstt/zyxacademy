"use client";
import { useState } from "react";
import { ApplicationPage } from "@/components/application-page";
import { Button } from "@/components/ui/button";
import { useAppLocale } from "@/lib/i18n/client";
import { pauseBrowserPush } from "@/lib/firebase/messaging";
import { canUseBrowserPush } from "@/lib/native/runtime";

export default function BrowserNotificationsCleanup() {
 const { locale } = useAppLocale();
 const en = locale === "en";
 const [status,setStatus] = useState<"idle"|"pending"|"success"|"failed">("idle");
 async function stop() {
  setStatus("pending");
  try { await pauseBrowserPush(); setStatus("success"); }
  catch { setStatus("failed"); }
 }
 return <ApplicationPage>
  <div className="max-w-xl space-y-4">
   <h1 className="font-heading font-bold text-xl">{en ? "Stop browser notifications" : "Hentikan notifikasi browser"}</h1>
   <p className="text-body-sm text-muted-foreground">{en ? "This stops notifications from this browser only. The installed Zyx Academy app and other devices remain connected." : "Tindakan ini hanya menghentikan notifikasi dari browser ini. Aplikasi Zyx Academy dan perangkat lain tetap terhubung."}</p>
   {status === "success" ? <p role="status" className="text-body-sm">{en ? "Browser notifications are now off. You can return to the app." : "Notifikasi browser sudah dinonaktifkan. Anda dapat kembali ke aplikasi."}</p> :
    <>
     {status === "failed" && <p role="alert" className="text-body-sm text-destructive">{en ? "Open this page in Chrome, or disable this site's notification permission in Chrome settings." : "Buka halaman ini di Chrome atau nonaktifkan izin notifikasi situs ini melalui pengaturan Chrome."}</p>}
     <Button disabled={status === "pending"} onClick={() => canUseBrowserPush() ? void stop() : setStatus("failed")}>{status === "pending" ? (en ? "Stopping…" : "Menonaktifkan…") : (en ? "Stop browser notifications" : "Hentikan notifikasi browser")}</Button>
    </>}
  </div>
 </ApplicationPage>;
}
