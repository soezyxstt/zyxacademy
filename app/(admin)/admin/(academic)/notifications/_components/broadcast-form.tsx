"use client";

/**
 * app/admin/notifications/_components/broadcast-form.tsx
 *
 * Admin compose-and-send form with live notification preview.
 * Uses React's useActionState for progressive-enhancement form submission.
 */

import { useActionState, useState, useEffect } from "react";
import { sendBroadcastAction, type BroadcastFormState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from "@/components/ui/select";
import { Bell, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";

interface Course {
 id: string;
 title: string;
}

interface Props {
 courses: Course[];
}

const initialState: BroadcastFormState = {};

export function NotificationBroadcastForm({ courses }: Props) {
 const t = useTranslations("adminOps");
 const [state, formAction, isPending] = useActionState(sendBroadcastAction, initialState);

 // Controlled fields for live preview
 const [title, setTitle] = useState("");
 const [body, setBody] = useState("");
 const [target, setTarget] = useState("all");
 const [targetId, setTargetId] = useState("");

 // Toast feedback on result
 useEffect(() => {
 if (state.success) {
 toast.success(
 t("notificationUI.sentTo", { count: state.result?.succeeded ?? 0 }),
 { description: t("notificationUI.failedTokens", { count: state.result?.failedCount ?? 0 }) }
 );
 } else if (state.error) {
 toast.error(t("notificationUI.sendFailure"));
 }
 }, [state, t]);

 return (
 <form action={formAction} className="space-y-3">
 {/* Hidden target fields (controlled by Select components) */}
 <input type="hidden" name="target" value={target} />
 <input type="hidden" name="targetId" value={targetId} />

 {/* Target selection */}
 <div className="space-y-1.5">
 <Label htmlFor="notif-target" className="text-body-sm font-medium text-foreground">
 {t("notificationUI.target")}
 </Label>
 <Select value={target} onValueChange={(v) => { setTarget(v); setTargetId(""); }}>
 <SelectTrigger id="notif-target" className="rounded-md">
 <SelectValue placeholder={t("notificationUI.selectTarget")} />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="all">{t("notificationUI.allUsers")}</SelectItem>
 <SelectItem value="course">{t("notificationUI.specificCourse")}</SelectItem>
 <SelectItem value="user">{t("notificationUI.singleUser")}</SelectItem>
 </SelectContent>
 </Select>
 </div>

 {/* Course selector ; shown only when target is "course" */}
 {target === "course" && (
 <div className="space-y-1.5">
 <Label htmlFor="notif-course" className="text-body-sm font-medium text-foreground">
 {t("notificationUI.specificCourse")}
 </Label>
 <Select value={targetId} onValueChange={setTargetId}>
 <SelectTrigger id="notif-course" className="rounded-md">
 <SelectValue placeholder={t("notificationUI.selectCourse")} />
 </SelectTrigger>
 <SelectContent>
 {courses.map((c) => (
 <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
 ))}
 </SelectContent>
 </Select>
 </div>
 )}

 {/* User ID input ; shown only when target is "user" */}
 {target === "user" && (
 <div className="space-y-1.5">
 <Label htmlFor="notif-userid" className="text-body-sm font-medium text-foreground">
 User ID
 </Label>
 <Input
 id="notif-userid"
 value={targetId}
 onChange={(e) => setTargetId(e.target.value)}
 placeholder="e.g. abc123-def456..."
 className="rounded-md font-mono text-body-sm"
 />
 </div>
 )}

 {/* Title */}
 <div className="space-y-1.5">
 <Label htmlFor="notif-title" className="text-body-sm font-medium text-foreground">
 {t("notificationUI.title")} <span className="text-muted-foreground font-normal">({title.length}/100)</span>
 </Label>
 <Input
 id="notif-title"
 name="title"
 value={title}
 onChange={(e) => setTitle(e.target.value.slice(0, 100))}
 placeholder={t("notificationUI.titlePlaceholder")}
 required
 className="rounded-md"
 />
 </div>

 {/* Body */}
 <div className="space-y-1.5">
 <Label htmlFor="notif-body" className="text-body-sm font-medium text-foreground">
 {t("notificationUI.body")} <span className="text-muted-foreground font-normal">({body.length}/500)</span>
 </Label>
 <Textarea
 id="notif-body"
 name="body"
 value={body}
 onChange={(e) => setBody(e.target.value.slice(0, 500))}
 placeholder={t("notificationUI.writeBody")}
 rows={3}
 required
 className="rounded-md resize-none"
 />
 </div>

 <p className="text-body-xs text-muted-foreground">{t("notificationUI.deliveryNote")}</p>

 {/* Link */}
 <div className="space-y-1.5">
 <Label htmlFor="notif-link" className="text-body-sm font-medium text-foreground">
 Link <span className="text-muted-foreground font-normal">({t("notificationUI.optional")})</span>
 </Label>
 <Input
 id="notif-link"
 name="link"
 type="text"
 placeholder="/dashboard atau https://..."
 className="rounded-md"
 />
 </div>

 {/* Live preview */}
 {(title || body) && (
 <div className="border-t border-border pt-3">
 <p className="text-body-xs text-muted-foreground font-medium mb-2">
 {t("notificationUI.preview")}
 </p>
 <div className="flex gap-3 items-start">
 <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-brand-primary/15">
 <Bell className="size-4 text-brand-primary" />
 </div>
 <div>
 <p className="text-body-sm font-semibold text-foreground leading-tight">
 {title || t("notificationUI.titlePlaceholder")}
 </p>
 <p className="text-body-xs text-muted-foreground mt-0.5 leading-relaxed">
 {body || t("notificationUI.bodyPlaceholder")}
 </p>
 </div>
 </div>
 </div>
 )}

 {/* Result feedback */}
 {state.success && (
 <div className="flex items-center gap-2 rounded-md border border-status-success/30 bg-status-success/8 px-4 py-3">
 <CheckCircle2 className="size-4 text-status-success shrink-0" />
 <p className="text-body-sm text-status-success">
 {t("notificationUI.sentTo", { count: state.result?.succeeded ?? 0 })}
 {(state.result?.failedCount ?? 0) > 0 && (
 <span className="text-muted-foreground ml-1">
 {t("notificationUI.failedTokens", { count: state.result?.failedCount ?? 0 })}
 </span>
 )}
 </p>
 </div>
 )}

 {state.error && (
 <div className="flex items-center gap-2 rounded-md border border-status-error/30 bg-status-error/8 px-4 py-3">
 <AlertCircle className="size-4 text-status-error shrink-0" />
 <p className="text-body-sm text-status-error">{t("notificationUI.sendFailure")}</p>
 </div>
 )}

 <Button
 type="submit"
 disabled={!title || !body}
 isLoading={isPending}
 className="gap-2 rounded-lg"
 id="send-notification-btn"
 >
 <Send className="size-4" />
 {isPending ? t("notificationUI.sending") : t("notificationUI.send")}
 </Button>
 </form>
 );
}
