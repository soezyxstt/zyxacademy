"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n/client";
import { Flag } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { AdminTable, AdminTableHead } from "@/components/admin/table";
import { Button } from "@/components/ui/button";
import { FormattedDate } from "@/components/ui/formatted-date";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DiscussionMarkdown } from "./discussion-markdown";
import { DiscussionReportsSkeleton } from "./discussion-skeleton";
import type { DiscussionLoadState, DiscussionReport, DiscussionWorkspaceProps } from "./view-model";


export function DiscussionReportedMessage({ message }: { message: NonNullable<DiscussionReport["message"]> }) {
  const t = useTranslations("discussions");
  const author = message.authorKind === "deleted" ? t("deletedAuthor") : message.authorKind === "unavailable" ? t("unknownAuthor") : message.authorName;
  const body = message.bodyKind === "deleted" || message.deleted ? t("deletedMessage") : message.bodyKind === "image" ? t("image") : message.bodyKind === "source_unavailable" ? t("sourceUnavailable") : message.body;
  return <div className="min-w-0 space-y-2 border-l-2 border-primary pl-3 [overflow-wrap:anywhere]"><span className="text-body-xs text-muted-foreground">{t("messageNumber", { name: author, number: message.seq })}</span><DiscussionMarkdown content={body} /></div>;
}

export function DiscussionReports({ reports, state = "ready", onRetry, onSetStatus, onOpenQuestion }: { reports: DiscussionReport[]; state?: DiscussionLoadState; onRetry?: () => void; onSetStatus?: DiscussionWorkspaceProps["onSetReportStatus"]; onOpenQuestion: (id: string, messageId: string) => void }) {
  const t = useTranslations("discussions");
  const [selected, setSelected] = useState<DiscussionReport | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  async function update(reportId: string, status: "resolved" | "dismissed") {
    if (!onSetStatus || pending) return;
    setPending(reportId);
    setFailed(null);
    try { await onSetStatus({ reportId, status }); } catch { setFailed(reportId); } finally { setPending(null); }
  }
  if (state === "loading") return <DiscussionReportsSkeleton label={t("loadingReports")} />;
  if (state === "error") return <AdminEmptyState icon={Flag} title={t("reportsError")} action={<Button type="button" variant="outline" onClick={onRetry}>{t("retry")}</Button>} />;
  if (!reports.length) return <AdminEmptyState icon={Flag} title={t("noReports")} />;
  return <><AdminTable><table role="table" className="block w-full text-left text-body-sm @min-[52rem]/discussions:table">
    <AdminTableHead className="sr-only @min-[52rem]/discussions:not-sr-only @min-[52rem]/discussions:table-header-group"><tr><th scope="col" className="p-3 font-semibold">{t("questions")}</th><th scope="col" className="p-3 font-semibold">{t("reporterAndReason")}</th><th scope="col" className="p-3 font-semibold">{t("date")}</th><th scope="col" className="p-3 font-semibold">{t("status")}</th><th scope="col" className="p-3 font-semibold">{t("actions")}</th></tr></AdminTableHead>
    <tbody role="rowgroup" className="block divide-y divide-border @min-[52rem]/discussions:table-row-group">{reports.map((report) => <tr role="row" key={report.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 p-3 @min-[52rem]/discussions:table-row @min-[52rem]/discussions:p-0">
      <td role="cell" className="col-span-2 block min-w-0 @min-[52rem]/discussions:table-cell @min-[52rem]/discussions:max-w-56 @min-[52rem]/discussions:p-3"><Button type="button" variant="link" className="h-auto max-w-full justify-start whitespace-normal break-words p-0 text-left [overflow-wrap:anywhere]" onClick={() => setSelected(report)}>{report.questionTitle}</Button></td>
      <td role="cell" className="col-span-2 block min-w-0 [overflow-wrap:anywhere] @min-[52rem]/discussions:table-cell @min-[52rem]/discussions:max-w-64 @min-[52rem]/discussions:p-3"><div>{report.reporterName}</div><div className="text-body-xs text-muted-foreground">{report.reason}</div></td>
      <td role="cell" className="block self-center text-body-xs @min-[52rem]/discussions:table-cell @min-[52rem]/discussions:p-3"><FormattedDate date={report.createdAt} options={{ day: "numeric", month: "short", year: "numeric" }} /></td>
      <td role="cell" className="block self-center @min-[52rem]/discussions:table-cell @min-[52rem]/discussions:p-3"><span className="rounded-md bg-muted px-2 py-1 text-body-xs">{t(report.status === "pending" ? "reportStatus_pending" : report.status === "resolved" ? "reportStatus_resolved" : report.status === "dismissed" ? "reportStatus_dismissed" : "status_unknown")}</span></td>
      <td role="cell" className="col-span-2 block @min-[52rem]/discussions:table-cell @min-[52rem]/discussions:p-3">{report.status === "pending" && onSetStatus ? <div className="flex flex-wrap gap-1"><Button type="button" size="sm" variant="outline" disabled={pending !== null} onClick={() => void update(report.id, "resolved")}>{t("resolve")}</Button><Button type="button" size="sm" variant="ghost" disabled={pending !== null} onClick={() => void update(report.id, "dismissed")}>{t("dismiss")}</Button>{failed === report.id && <span role="alert" className="w-full text-body-xs text-destructive">{t("failedRetry")}</span>}</div> : <span className="text-muted-foreground">-</span>}</td>
    </tr>)}</tbody>
  </table></AdminTable><Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] min-w-0 overflow-y-auto [&>*]:min-w-0 [overflow-wrap:anywhere]"><DialogHeader><DialogTitle>{t("reportedMessage")}</DialogTitle></DialogHeader>{selected && <><h3 className="font-heading text-body-sm">{selected.questionTitle}</h3>{selected.message ? <DiscussionReportedMessage message={selected.message} /> : <p className="text-body-sm text-muted-foreground">{t("reportedMessageUnavailable")}</p>}<p className="text-body-xs text-muted-foreground">{selected.reporterName}: {selected.reason}</p><Button type="button" variant="outline" onClick={() => { onOpenQuestion(selected.questionId, selected.messageId); setSelected(null); }}>{t("openDiscussion")}</Button></>}</DialogContent></Dialog></>;
}
