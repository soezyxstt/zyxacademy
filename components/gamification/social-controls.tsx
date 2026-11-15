"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { followStudentAction, unfollowStudentAction, blockStudentAction, reportStudentAction } from "@/lib/gamification/social-actions";

export function SocialControls({ publicId, following, canFollow, english }: { publicId: string; following: boolean; canFollow: boolean; english: boolean }) {
 const [pending, start] = useTransition(); const [message, setMessage] = useState(""); const [blockOpen, setBlockOpen] = useState(false); const [reportOpen, setReportOpen] = useState(false); const [reason, setReason] = useState("other"); const router = useRouter();
 const run = (action: () => Promise<unknown>, success?: string) => start(async () => { try { await action(); setMessage(success ?? ""); setBlockOpen(false); setReportOpen(false); router.refresh(); } catch { setMessage(english ? "Could not complete action. Try again." : "Tindakan belum berhasil. Coba lagi."); } });
 return <div className="space-y-2"><div className="flex flex-wrap gap-2">
 {(canFollow || following) && <Button disabled={pending} onClick={() => run(() => following ? unfollowStudentAction(publicId) : followStudentAction(publicId))}>{following ? "Unfollow" : "Follow"}</Button>}
 <Dialog open={blockOpen} onOpenChange={setBlockOpen}><DialogTrigger asChild><Button variant="outline">{english ? "Block" : "Blokir"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{english ? "Block student?" : "Blokir siswa?"}</DialogTitle></DialogHeader><p className="text-body-sm">{english ? "Blocking removes follows in both directions." : "Pemblokiran menghapus hubungan mengikuti kedua arah."}</p><Button variant="destructive" disabled={pending} onClick={() => run(() => blockStudentAction(publicId))}>{english ? "Block" : "Blokir"}</Button></DialogContent></Dialog>
 <Dialog open={reportOpen} onOpenChange={setReportOpen}><DialogTrigger asChild><Button variant="outline">{english ? "Report" : "Laporkan"}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{english ? "Report student" : "Laporkan siswa"}</DialogTitle></DialogHeader><SelectField label={english ? "Reason" : "Alasan"} value={reason} onValueChange={setReason} options={[{value:"harassment",label:english ? "Harassment" : "Pelecehan"},{value:"impersonation",label:english ? "Impersonation" : "Penyamaran"},{value:"inappropriate",label:english ? "Inappropriate content" : "Konten tidak pantas"},{value:"other",label:english ? "Other" : "Lainnya"}]} /><Button disabled={pending} onClick={() => run(() => reportStudentAction(publicId, reason), english ? "Report sent" : "Laporan terkirim")}>{english ? "Send report" : "Kirim laporan"}</Button></DialogContent></Dialog>
 </div>{message && <p role="status" className="text-body-xs">{message}</p>}</div>;
}
