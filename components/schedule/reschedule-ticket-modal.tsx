"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  MessageSquare,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import {
  submitRescheduleTicket,
  sendTicketMessage,
  tutorDecideTicket,
} from "@/app/(student)/dashboard/schedule/actions";
import { formatIsoDate } from "@/lib/date-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: any | null;
  role: "student" | "teacher" | "admin";
  currentUserId: string;
  availableSlots?: any[];
  onSuccess: () => void;
};

export function RescheduleTicketModal({
  open,
  onOpenChange,
  booking,
  role,
  currentUserId,
  availableSlots = [],
  onSuccess,
}: Props) {
  const [ticketType, setTicketType] = useState<"reschedule" | "cancellation">("reschedule");
  const [reason, setReason] = useState("");
  const [proposedSlotId, setProposedSlotId] = useState("");
  const [proposedDate, setProposedDate] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<
    "submit" | "message" | "approved" | "rejected" | null
  >(null);

  const activeTicket = booking?.rescheduleTickets?.[0] || null;
  const isTutor = role === "teacher";

  // Filter slots for the same tutor
  const tutorSlots = availableSlots.filter(
    (s) => s.tutorId === booking?.slot?.tutorId && !s.booking
  );

  const handleSubmitNewTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    if (!reason.trim()) {
      toast.error("Alasan permohonan wajib diisi");
      return;
    }

    setSubmittingAction("submit");
    setLoading(true);
    try {
      const res = await submitRescheduleTicket(
        booking.id,
        ticketType,
        reason,
        proposedSlotId || undefined,
        proposedDate || undefined
      );

      if (res.success) {
        toast.success("Permohonan berhasil diajukan ke tutor");
        setReason("");
        onSuccess();
      } else {
        toast.error(res.error || "Gagal mengajukan permohonan");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !newMessage.trim()) return;

    setSubmittingAction("message");
    setLoading(true);
    try {
      const res = await sendTicketMessage(activeTicket.id, newMessage);
      if (res.success) {
        setNewMessage("");
        onSuccess();
      } else {
        toast.error(res.error || "Gagal mengirim pesan");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  const handleTutorDecision = async (decision: "approved" | "rejected") => {
    if (!activeTicket) return;

    setSubmittingAction(decision);
    setLoading(true);
    try {
      const res = await tutorDecideTicket(activeTicket.id, decision, decisionNotes);
      if (res.success) {
        toast.success(
          decision === "approved"
            ? "Permohonan berhasil disetujui"
            : "Permohonan telah ditolak"
        );
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(res.error || "Gagal memproses keputusan");
      }
    } catch {
      toast.error("Terjadi kesalahan koneksi");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!loading) onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-xl rounded-xl border border-border p-6 shadow-xl text-left max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-body-base font-bold flex items-center gap-2">
            <MessageSquare className="size-5 text-brand-primary" />
            Permohonan Reschedule & Pembatalan
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            Perubahan jadwal perlu persetujuan tutor.
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 my-2">
            {/* Header info */}
            <div className="border-b border-border pb-3 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  Tutor: {booking.slot?.tutor?.name} • Kelompok: {booking.group?.name}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                {booking.startTime || booking.slot?.startTime} - {booking.endTime || booking.slot?.endTime}
              </Badge>
            </div>

            {/* If NO active ticket: Show Creation Form */}
            {!activeTicket ? (
              <form onSubmit={handleSubmitNewTicket} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold text-foreground block">
                    Jenis Permohonan
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTicketType("reschedule")}
                      className={`p-2.5 rounded-lg border text-body-xs font-semibold transition-all ${
                        ticketType === "reschedule"
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      Pindah Jadwal (Reschedule)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTicketType("cancellation")}
                      className={`p-2.5 rounded-lg border text-body-xs font-semibold transition-all ${
                        ticketType === "cancellation"
                          ? "border-red-500 bg-red-500/10 text-red-600"
                          : "border-border bg-card text-muted-foreground"
                      }`}
                    >
                      Batalkan Sesi (Hangus)
                    </button>
                  </div>
                </div>

                {ticketType === "cancellation" && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>
                      Pemberitahuan: Pembatalan pasca penguncian mingguan menyebabkan kuota sesi kelompok pada minggu tersebut hangus tanpa pengembalian dana/kuota.
                    </span>
                  </div>
                )}

                {ticketType === "reschedule" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-body-xs font-semibold text-foreground block">
                        Usulan Tanggal Pengganti
                      </label>
                      <Input
                        type="date"
                        value={proposedDate}
                        onChange={(e) => setProposedDate(e.target.value)}
                        className="h-9 rounded-lg text-body-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-body-xs font-semibold text-foreground block">
                        Pilih Slot Tutor yang Luang
                      </label>
                      <Select
                        value={proposedSlotId}
                        onValueChange={setProposedSlotId}
                      >
                        <SelectTrigger className="h-9 rounded-lg text-body-xs bg-card">
                          <SelectValue placeholder="Pilih Slot" />
                        </SelectTrigger>
                        <SelectContent>
                          {tutorSlots.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.dayOfWeek} ({s.startTime} - {s.endTime})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-body-xs font-semibold text-foreground block">
                    Alasan Permohonan
                  </label>
                  <Textarea
                    placeholder="Jelaskan alasan permohonan dan kesepakatan waktu yang diharapkan..."
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    required
                    className="rounded-lg text-body-sm resize-none"
                  />
                </div>

                <DialogFooter className="gap-2 pt-2">
                  <DialogClose asChild>
                    <Button variant="outline" type="button" disabled={loading}>
                      Batal
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    isLoading={submittingAction === "submit"}
                    disabled={loading || !reason.trim()}
                    className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
                  >
                    Ajukan Tiket
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              /* If ACTIVE ticket: Show Thread & Decision Panel */
              <div className="space-y-4">
                {/* Ticket Status Bar */}
                <div className="border-b border-border pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={activeTicket.status === "approved" ? "default" : "outline"}
                      className={`text-[10px] uppercase font-bold ${
                        activeTicket.status === "approved"
                          ? "bg-emerald-600 text-white"
                          : activeTicket.status === "rejected"
                          ? "bg-red-500/10 text-red-600 border-red-500/30"
                          : "text-muted-foreground"
                      }`}
                    >
                      {activeTicket.status === "approved"
                        ? "Disetujui"
                        : activeTicket.status === "rejected"
                        ? "Ditolak"
                        : "Menunggu Persetujuan"}
                    </Badge>
                    <span className="text-body-xs font-semibold text-foreground capitalize">
                      Permohonan {activeTicket.type}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    Diajukan {formatIsoDate(new Date(activeTicket.createdAt))}
                  </span>
                </div>

                {/* Reason box */}
                <div className="text-body-xs space-y-1">
                  <span className="font-semibold text-foreground">Alasan: </span>
                  <p className="text-muted-foreground">{activeTicket.reason}</p>
                </div>

                {/* Discussion Thread */}
                <div className="space-y-2">
                  <h4 className="text-body-xs font-bold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-brand-primary" />
                    <span>Ruang Diskusi Kelompok & Tutor</span>
                  </h4>

                  <div className="p-3 rounded-xl border border-border bg-muted/10 space-y-2.5 max-h-48 overflow-y-auto">
                    {(activeTicket.messages || []).map((msg: any) => {
                      const isMe = msg.senderId === currentUserId;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                        >
                          <div
                            className={`p-2.5 rounded-xl text-body-xs max-w-[80%] ${
                              isMe
                                ? "bg-brand-primary text-white"
                                : "bg-card border border-border text-foreground"
                            }`}
                          >
                            <span className="text-[10px] font-bold block opacity-80 mb-0.5">
                              {msg.sender?.name || "Pengguna"}
                            </span>
                            <p className="whitespace-pre-wrap">{msg.message}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Chat Input if pending */}
                  {activeTicket.status === "pending" && (
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                      <Input
                        placeholder="Ketik pesan diskusi..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        className="h-9 rounded-lg text-body-xs"
                      />
                      <Button
                        type="submit"
                        isLoading={submittingAction === "message"}
                        disabled={loading || !newMessage.trim()}
                        size="xs"
                        className="h-9 px-3 rounded-lg bg-brand-primary text-white"
                      >
                        <Send className="size-3.5" />
                      </Button>
                    </form>
                  )}
                </div>

                {/* Tutor Approval / Rejection Controls */}
                {isTutor && activeTicket.status === "pending" && (
                  <div className="border-t border-border space-y-3 pt-3">
                    <h4 className="text-body-xs font-bold text-foreground">
                      Keputusan Tutor
                    </h4>
                    <Textarea
                      placeholder="Catatan persetujuan atau alasan penolakan..."
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                      rows={2}
                      className="rounded-lg text-body-xs resize-none"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        isLoading={submittingAction === "rejected"}
                        disabled={loading}
                        onClick={() => handleTutorDecision("rejected")}
                        className="rounded-lg gap-1"
                      >
                        <XCircle className="size-4" />
                        <span>Tolak</span>
                      </Button>
                      <Button
                        size="sm"
                        isLoading={submittingAction === "approved"}
                        disabled={loading}
                        onClick={() => handleTutorDecision("approved")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1"
                      >
                        <CheckCircle2 className="size-4" />
                        <span>Setujui Permohonan</span>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
