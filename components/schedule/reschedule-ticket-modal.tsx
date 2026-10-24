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
import { useAppLocale, useTranslations } from "@/lib/i18n/client";

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
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  const formatDate = (value: Date) => new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value);
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
      toast.error(t("ticket.errors.reasonRequired"));
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
        toast.success(t("ticket.submitted"));
        setReason("");
        onSuccess();
      } else {
        toast.error(t("ticket.errors.submit"));
      }
    } catch {
      toast.error(t("ticket.errors.connection"));
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
        toast.error(t("ticket.errors.message"));
      }
    } catch {
      toast.error(t("ticket.errors.connection"));
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
          decision === "approved" ? t("ticket.approvedToast") : t("ticket.rejectedToast")
        );
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(t("ticket.errors.decision"));
      }
    } catch {
      toast.error(t("ticket.errors.connection"));
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
            {t("ticket.title")}
          </DialogTitle>
          <DialogDescription className="text-body-xs text-muted-foreground">
            {t("ticket.description")}
          </DialogDescription>
        </DialogHeader>

        {booking && (
          <div className="space-y-4 my-2">
            {/* Header info */}
            <div className="border-b border-border pb-3 text-body-xs flex items-center justify-between">
              <div>
                <p className="font-bold text-foreground">{booking.course?.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("audit.tutor")}: {booking.slot?.tutor?.name} • {t("audit.group")}: {booking.group?.name}
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
                    {t("ticket.typeLabel")}
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
                      {t("ticket.reschedule")}
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
                      {t("ticket.cancellation")}
                    </button>
                  </div>
                </div>

                {ticketType === "cancellation" && (
                  <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                    <span>
                      {t("ticket.cancellationWarning")}
                    </span>
                  </div>
                )}

                {ticketType === "reschedule" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-body-xs font-semibold text-foreground block">
                        {t("ticket.proposedDate")}
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
                        {t("ticket.availableSlot")}
                      </label>
                      <Select
                        value={proposedSlotId}
                        onValueChange={setProposedSlotId}
                      >
                        <SelectTrigger className="h-9 rounded-lg text-body-xs bg-card">
                          <SelectValue placeholder={t("ticket.selectSlot")} />
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
                    {t("ticket.reason")}
                  </label>
                  <Textarea
                    placeholder={t("ticket.reasonPlaceholder")}
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
                      {t("ticket.cancel")}
                    </Button>
                  </DialogClose>
                  <Button
                    type="submit"
                    isLoading={submittingAction === "submit"}
                    disabled={loading || !reason.trim()}
                    className="bg-brand-primary text-white hover:bg-brand-primary/90 rounded-lg"
                  >
                    {t("ticket.submit")}
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
                        ? t("ticket.status.approved")
                        : activeTicket.status === "rejected"
                        ? t("ticket.status.rejected")
                        : t("ticket.status.pending")}
                    </Badge>
                    <span className="text-body-xs font-semibold text-foreground capitalize">
                      {t("ticket.requestType", { type: activeTicket.type === "reschedule" ? t("ticket.reschedule") : t("ticket.cancellation") })}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {t("ticket.submittedOn", { date: formatDate(new Date(activeTicket.createdAt)) })}
                  </span>
                </div>

                {/* Reason box */}
                <div className="text-body-xs space-y-1">
                  <span className="font-semibold text-foreground">{t("ticket.reason")}: </span>
                  <p className="text-muted-foreground">{activeTicket.reason}</p>
                </div>

                {/* Discussion Thread */}
                <div className="space-y-2">
                  <h4 className="text-body-xs font-bold text-foreground flex items-center gap-1.5">
                    <MessageSquare className="size-3.5 text-brand-primary" />
                    <span>{t("ticket.discussionTitle")}</span>
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
                              {msg.sender?.name || t("ticket.userFallback")}
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
                        placeholder={t("ticket.messagePlaceholder")}
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
                      {t("ticket.tutorDecision")}
                    </h4>
                    <Textarea
                      placeholder={t("ticket.decisionNotesPlaceholder")}
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
                        <span>{t("ticket.reject")}</span>
                      </Button>
                      <Button
                        size="sm"
                        isLoading={submittingAction === "approved"}
                        disabled={loading}
                        onClick={() => handleTutorDecision("approved")}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg gap-1"
                      >
                        <CheckCircle2 className="size-4" />
                        <span>{t("ticket.approve")}</span>
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
