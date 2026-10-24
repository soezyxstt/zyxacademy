"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, History, Megaphone, CheckCircle2, XCircle, Users, Pin, Edit2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable } from "@/components/admin/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { cn } from "@/lib/utils";
import { normalizeDate } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";
import {
  createAndSendPkaAnnouncementAction,
  archivePkaAnnouncementAction,
  togglePinPkaAnnouncementAction,
  editPkaAnnouncementAction,
  type PkaAnnouncementRow,
} from "../actions";

const TITLE_MAX = 100;
const BODY_MAX = 4000;

function formatRelative(date: Date, t: ReturnType<typeof useTranslations<"adminOps">>): string {
  const normalized = normalizeDate(date);
  const diff = Date.now() - normalized.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("pkaAnnouncementUI.justNow");
  if (mins < 60) return t("pkaAnnouncementUI.minutes", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("pkaAnnouncementUI.hours", { count: hours });
  const days = Math.floor(hours / 24);
  return t("pkaAnnouncementUI.days", { count: days });
}


export function AnnouncementsTab({ history }: { history: PkaAnnouncementRow[] }) {
  const t = useTranslations("adminOps");
  const [isPending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const router = useRouter();

  const handleToggleArchive = (id: string, archive: boolean) => {
    startTransition(async () => {
      const res = await archivePkaAnnouncementAction(id, archive);
      if (res.error) {
        toast.error(t("pkaAnnouncementUI.archiveFailure"), { description: res.error });
      } else {
        toast.success(t("pkaAnnouncementUI.archiveSuccess"));
        router.refresh();
      }
    });
  };

  const handleTogglePin = (id: string, pin: boolean) => {
    startTransition(async () => {
      const res = await togglePinPkaAnnouncementAction(id, pin);
      if (res.error) {
        toast.error(t("pkaAnnouncementUI.pinFailure"), { description: res.error });
      } else {
        toast.success(t("pkaAnnouncementUI.pinSuccess"));
        router.refresh();
      }
    });
  };

  const handleEditClick = (row: PkaAnnouncementRow) => {
    setEditingId(row.id);
    setTitle(row.title);
    setBody(row.body);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setBody("");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.error(t("pkaAnnouncementUI.required"));
      return;
    }

    startTransition(async () => {
      if (editingId) {
        const res = await editPkaAnnouncementAction(editingId, title, body);
        if (res.error) {
          toast.error(t("pkaAnnouncementUI.updateFailure"), { description: res.error });
        } else {
          toast.success(t("pkaAnnouncementUI.updateSuccess"));
          setEditingId(null);
          setTitle("");
          setBody("");
          router.refresh();
        }
      } else {
        const formData = new FormData();
        formData.set("title", title);
        formData.set("body", body);

        const res = await createAndSendPkaAnnouncementAction({}, formData);
        if (res.error) {
          toast.error(t("pkaAnnouncementUI.sendFailure"), { description: res.error });
        } else {
          toast.success(t("pkaAnnouncementUI.sentTo", { count: res.result?.recipientCount ?? 0 }), {
            description: t("pkaAnnouncementUI.sendResult", { push: res.result?.notificationsSucceeded ?? 0, email: res.result?.emailsSucceeded ?? 0 }),
          });
          setTitle("");
          setBody("");
          router.refresh();
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className={cn("grid items-start gap-4", (title || body) && "lg:grid-cols-2")}>
        {/* Compose */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-3">
            <div className="flex items-center gap-2">
              {editingId ? <Edit2 className="size-4 text-brand-primary" aria-hidden /> : <Megaphone className="size-4 text-brand-primary" aria-hidden />}
              <h3 className="font-heading text-body-sm font-semibold text-foreground">
                {editingId ? t("pkaAnnouncementUI.edit") : t("pkaAnnouncementUI.create")}
              </h3>
            </div>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={handleCancelEdit} className="h-7 text-body-xs">
                {t("pkaAnnouncementUI.cancelEdit")}
              </Button>
            )}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="pka-ann-title" className="text-body-sm font-medium text-foreground">
                {t("pkaAnnouncementUI.title")} {" "}
                <span className="font-normal text-muted-foreground">
                  ({title.length}/{TITLE_MAX})
                </span>
              </Label>
              <Input
                id="pka-ann-title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                placeholder={t("pkaAnnouncementUI.titlePlaceholder")}
                required
                className="rounded-md"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pka-ann-body" className="text-body-sm font-medium text-foreground">
                {t("pkaAnnouncementUI.message")} {" "}
                <span className="font-normal text-muted-foreground">
                  ({t("pkaAnnouncementUI.markdown")}, {body.length}/{BODY_MAX})
                </span>
              </Label>
              <Textarea
                id="pka-ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                placeholder={t("pkaAnnouncementUI.bodyPlaceholder")}
                required
                className="min-h-[160px] rounded-md font-mono text-body-sm"
              />
            </div>

            <Button type="submit" disabled={!title.trim() || !body.trim()} isLoading={isPending} className="gap-2 rounded-lg">
              <Send className="size-4" />
              {editingId ? t("pkaAnnouncementUI.save") : t("pkaAnnouncementUI.send")}
            </Button>
            {!editingId && (
              <p className="text-body-xs text-muted-foreground">
                {t("pkaAnnouncementUI.deliveryNote")}
              </p>
            )}
          </form>
        </div>

        {/* Live preview */}
        {(title || body) && <div className="min-w-0 border-t border-border pt-3 lg:sticky lg:top-6">
          <div className="mb-3">
            <h3 className="font-heading text-body-sm font-semibold text-foreground">{t("pkaAnnouncementUI.preview")}</h3>
          </div>
          <div>
            {title || body ? (
              <div className="space-y-3">
                <h4 className="font-heading text-body-base text-foreground">{title || t("pkaAnnouncementUI.announcementTitlePlaceholder")}</h4>
                {body ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownRenderer content={body} />
                  </div>
                ) : (
                  <p className="text-body-sm italic text-muted-foreground/60">{t("pkaAnnouncementUI.noMessage")}</p>
                )}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-body-sm text-muted-foreground">
                  {t("pkaAnnouncementUI.noContent")}
                </p>
              </div>
            )}
          </div>
        </div>}
      </div>

      {/* History */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h3 className="font-heading text-body-base font-semibold text-foreground">{t("pkaAnnouncementUI.history")}</h3>
        </div>

        {history.length === 0 ? (
          <AdminEmptyState icon={Megaphone} title={t("pkaAnnouncementUI.empty")} />
        ) : (
          <AdminTable>
            <div className="hidden md:grid grid-cols-[1fr_120px_100px_120px_100px] gap-4 border-b border-border bg-muted/30 px-5 py-3">
              <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaAnnouncementUI.announcement")}</span>
              <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaAnnouncementUI.status")}</span>
              <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaAnnouncementUI.recipients")}</span>
              <span className="text-body-xs font-semibold text-muted-foreground">{t("pkaAnnouncementUI.time")}</span>
              <span className="text-body-xs font-semibold text-muted-foreground text-right">{t("pkaAnnouncementUI.actions")}</span>
            </div>
            <ul className="divide-y divide-border/60">
              {history.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "grid grid-cols-1 gap-2 px-5 py-3.5 transition-colors hover:bg-muted/20 md:grid-cols-[1fr_120px_100px_120px_100px] md:items-center md:gap-4",
                    row.isArchived && "opacity-60 bg-muted/5"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-foreground">
                      {row.title}
                      {row.isPinned && (
                        <span className="ml-2 rounded-md bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary uppercase">
                          {t("pkaAnnouncementUI.pinned")}
                        </span>
                      )}
                      {row.isArchived && (
                        <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                          {t("pkaAnnouncementUI.archived")}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 truncate text-body-xs text-muted-foreground">{row.body}</p>
                  </div>
                  <div className="flex items-center">
                    {row.sentAt ? (
                      <span className="flex items-center gap-1 text-body-xs text-status-success">
                        <CheckCircle2 className="size-3.5" />
                        {t("pkaAnnouncementUI.sent")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-body-xs text-status-error">
                        <XCircle className="size-3.5" />
                        {t("pkaAnnouncementUI.failed")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-body-xs text-muted-foreground">
                    <Users className="size-3.5" />
                    {row.recipientCount ?? 0}
                  </div>
                  <div className="flex items-center">
                    <span
                      className="text-body-xs text-muted-foreground"
                      title={normalizeDate(row.createdAt).toLocaleString("id-ID")}
                    >
                      {formatRelative(row.createdAt, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md"
                      disabled={isPending}
                      onClick={() => handleTogglePin(row.id, !row.isPinned)}
                      title={row.isPinned ? t("pkaAnnouncementUI.unpin") : t("pkaAnnouncementUI.pin")}
                    >
                      <Pin className={cn("size-3.5", row.isPinned && "fill-current text-brand-primary")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 rounded-md"
                      disabled={isPending}
                      onClick={() => handleEditClick(row)}
                      title={t("pkaAnnouncementUI.editAnnouncement")}
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-body-xs font-semibold rounded-md"
                      disabled={isPending}
                      onClick={() => handleToggleArchive(row.id, !row.isArchived)}
                    >
                      {row.isArchived ? t("pkaAnnouncementUI.unarchive") : t("pkaAnnouncementUI.archive")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </AdminTable>
        )}
      </section>
    </div>
  );
}
