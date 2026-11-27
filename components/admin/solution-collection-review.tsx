"use client";

import { useTranslations } from "@/lib/i18n/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMaterialReviewNavigation } from "@/components/admin/material-review-navigation";
import { MarkdownRenderer } from "@/components/course/markdown-renderer";
import { SolutionCollectionReader } from "@/components/course/solution-collection-reader";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SolutionCollection, SolutionCollectionItem, SolutionProvenance } from "@/lib/materials/solution-collection";
import {
  buildSolutionReview, criteria, localReviewDraft, reconcileSolutionReviewDrafts, restoreSolutionReviewDrafts,
  solutionReviewBaseline, solutionReviewDraftConflicts, solutionReviewHasUnsavedChanges, solutionReviewPendingChanges,
  solutionPublicationBlockers, type Choice, type ItemDraft, type ReviewContext, type DraftStore, type PublicationIssue,
} from "@/packages/academic/solution-review-state";

export {
  buildSolutionReview, reconcileSolutionReviewDrafts, restoreSolutionReviewDrafts, solutionReviewBaseline,
  solutionReviewDraftConflicts, solutionReviewHasUnsavedChanges, solutionReviewPendingChanges, solutionPublicationBlockers,
} from "@/packages/academic/solution-review-state";

function draftStorageKey(importId: string, reviewerId: string) { return `zyx:solution-review:${reviewerId}:${importId}`; }

function Provenance({ label, provenance }: { label: string; provenance: SolutionProvenance }) {
  const t = useTranslations("admin.solutionCollectionReview");
  const kind = t(provenance.kind);
  return <div className="space-y-1 text-body-xs">
    <h4 className="font-semibold text-foreground">{label}</h4>
    <p className="break-words text-muted-foreground">{kind}: {provenance.attribution}</p>
    {provenance.sources.map((source, index) => <p key={`${source.title}-${source.locator}-${index}`} className="break-words text-muted-foreground">{source.url ? <a href={source.url} target="_blank" rel="noopener noreferrer" className="rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{source.title}</a> : source.title}, {source.locator}</p>)}
  </div>;
}

function ItemReview({ item, draft, disabled, onChange, actions }: {
  item: SolutionCollectionItem; draft: ItemDraft; disabled: boolean; onChange: (draft: ItemDraft) => void; actions?: ReactNode;
}) {
  const t = useTranslations("admin.solutionCollectionReview");
  return <section className="space-y-4 border-t border-border pt-6" aria-label={t("itemReview")}>
    <h3 className="font-heading text-body-base font-bold">{t("itemReview")}</h3>
    {item.hintMarkdown ? <section aria-label={t("studentHint")} className="space-y-2 border-l-2 border-border pl-4">
      <h4 className="font-heading text-body-sm font-semibold">{t("studentHint")}</h4>
      <MarkdownRenderer content={item.hintMarkdown} />
      <p className="text-body-xs text-muted-foreground">{t("hintCheck")}</p>
    </section> : null}
    <div className="grid gap-3 sm:grid-cols-2"><Provenance label={t("problemSource")} provenance={item.provenance.problem} /><Provenance label={t("solutionSource")} provenance={item.provenance.solution} /></div>
    <div className="grid gap-3 sm:grid-cols-2">{criteria.map(({ key }) => <div key={key} className="space-y-1">
      <Label htmlFor={`solution-${item.id}-${key}`} className="text-body-sm">{t(key)}</Label>
      <Select disabled={disabled} value={draft[key] ?? ""} onValueChange={(value) => onChange({ ...draft, [key]: value as Choice })}>
        <SelectTrigger id={`solution-${item.id}-${key}`} className="w-full text-body-sm"><SelectValue placeholder={t("chooseDecision")} /></SelectTrigger>
        <SelectContent><SelectItem value="approved">{t("approved")}</SelectItem><SelectItem value="changes_requested">{t("needsChanges")}</SelectItem></SelectContent>
      </Select>
    </div>)}</div>
    <div className="space-y-1"><Label htmlFor={`solution-${item.id}-notes`} className="text-body-sm">{t("notes")}</Label><Textarea id={`solution-${item.id}-notes`} maxLength={2000} disabled={disabled} value={draft.notes ?? ""} onChange={(event) => onChange({ ...draft, notes: event.target.value })} className="text-body-sm" /></div>
    {actions}
  </section>;
}

export function SolutionCollectionReview({ collection, importId, checksum, status, publicationReady, publicationIssues, onRefresh, onMutate, saving }: {
  collection: SolutionCollection; importId: string; checksum: string; status: string; publicationReady: boolean;
  publicationIssues?: readonly PublicationIssue[];
  onRefresh: () => Promise<void>; onMutate: (action: "publish" | "withdraw" | "discard") => Promise<void>; saving: boolean;
}) {
  const t = useTranslations("admin.solutionCollectionReview");
  const [loadedContext, setLoadedContext] = useState<{ importId: string; checksum: string; result: ReviewContext } | null>(null);
  const [recoveryConflict, setRecoveryConflict] = useState<DraftStore | null>(null);
  const [store, setStore] = useState<DraftStore>({ importId, items: {} });
  const pendingDraft = useRef<DraftStore | null>(null);
  const [draftRecovery, setDraftRecovery] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"discard" | "withdraw" | "reset" | "recover" | "discardPrevious" | null>(null);
  const itemIds = JSON.stringify(collection.items.map((item) => item.id));
  useEffect(() => {
    let active = true;
    setContextLoading(status === "draft");
    setError(null);
    setDraftRecovery("");
    setStore((previous) => previous.importId === importId ? previous : { importId, items: {} });
    if (status !== "draft") return () => { active = false; };
    fetch(`/api/admin/bundles/product/${encodeURIComponent(importId)}/solution-review?${new URLSearchParams({ expectedRevision: checksum })}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("review context unavailable");
        return response.json() as Promise<{ result: ReviewContext }>;
      })
      .then(({ result }) => {
        if (!active) return;
        const expectedIds = JSON.parse(itemIds) as string[];
        const returnedHashes = new Map(result.itemHashes.map((entry) => [entry.itemId, entry.itemHash]));
        if (!(/^[a-f0-9]{64}$/.test(result.reviewVersion ?? "") && result.revision === checksum && result.productId === collection.id && result.itemHashes.length === expectedIds.length && returnedHashes.size === expectedIds.length && expectedIds.every((id) => Boolean(returnedHashes.get(id))))) throw new Error("review context revision mismatch");
        let recovered: unknown = null;
        if (result.reviewerId) {
          try { recovered = JSON.parse(sessionStorage.getItem(draftStorageKey(importId, result.reviewerId)) ?? "null"); }
          catch { setStorageUnavailable(true); }
        }
        const candidate = pendingDraft.current?.importId === importId ? pendingDraft.current : recovered;
        const hasConflict = solutionReviewDraftConflicts(candidate, importId, result);
        setRecoveryConflict(hasConflict ? restoreSolutionReviewDrafts(candidate, importId, result, true) : null);
        const restored = restoreSolutionReviewDrafts(candidate, importId, result);
        const local = localReviewDraft(candidate, importId, result);
        pendingDraft.current = Object.keys(local.items).length || Object.keys(local.previousItems ?? {}).length ? local : null;
        if (!hasConflict && Object.keys(local.items).length > 0) setDraftRecovery("draftRecovered");
        setStore(previous => previous.importId === importId && previous.baseReview === solutionReviewBaseline(result) ? { ...restored, items: { ...restored.items, ...reconcileSolutionReviewDrafts(previous, importId, result).items } } : restored);
        setLoadedContext({ importId, checksum, result });
      })
      .catch(() => { if (active) setError("loadError"); })
      .finally(() => { if (active) setContextLoading(false); });
    return () => { active = false; };
  }, [importId, checksum, status, retry, collection.id, itemIds]);

  const context = loadedContext?.importId === importId && loadedContext.result.productId === collection.id ? loadedContext.result : null;
  const hashes = new Map(context?.itemHashes.map(({ itemId, itemHash }) => [itemId, itemHash]) ?? []);
  const currentContext = !contextLoading && !error && context?.revision === checksum && context.productId === collection.id && context.itemHashes.length === collection.items.length && hashes.size === collection.items.length && collection.items.every((item) => Boolean(hashes.get(item.id))) ? context : null;
  const draft = Object.fromEntries(collection.items.flatMap((item) => {
    const entry = store.importId === importId ? store.items[item.id] : undefined;
    return entry && entry.itemHash === hashes.get(item.id) ? [[item.id, entry.draft]] : [];
  })) as Record<string, ItemDraft>;
  const complete = collection.items.filter((item) => criteria.every(({ key }) => Boolean(draft[item.id]?.[key]))).length;
  const review = currentContext ? buildSolutionReview(currentContext, collection, draft) : null;
  const previousDrafts = store.importId === importId ? Object.values(store.previousItems ?? {}) : [];
  const disabled = saving || submitting || !currentContext || Boolean(recoveryConflict) || previousDrafts.length > 0;
  // A failed request disables editing, but must keep guarding the existing draft.
  const pendingDirty = pendingDraft.current?.importId === importId && (context
    ? solutionReviewPendingChanges(pendingDraft.current, importId, context)
    : Object.keys(pendingDraft.current.items).length > 0);
  const dirty = Boolean(previousDrafts.length || pendingDirty || (context && solutionReviewHasUnsavedChanges(context, collection, draft)));
  useMaterialReviewNavigation(dirty || Boolean(recoveryConflict), saving || submitting || contextLoading);
  const itemReviewStatus = Object.fromEntries(collection.items.map(item => [item.id, criteria.every(({ key }) => Boolean(draft[item.id]?.[key])) ? "complete" as const : "incomplete" as const]));
  const canPublish = Boolean(publicationReady && currentContext?.savedReview?.decision === "approved" && review?.approved && !dirty && !recoveryConflict);
  function goToIncomplete() {
    const url = new URL(window.location.href);
    const current = Math.max(0, collection.items.findIndex(item => item.id === url.searchParams.get("item")));
    const ordered = [...collection.items.slice(current + 1), ...collection.items.slice(0, current + 1)];
    const next = ordered.find(item => itemReviewStatus[item.id] === "incomplete");
    if (next) { url.searchParams.set("item", next.id); window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`); }
  }
  function resetLocalChanges() {
    if (!currentContext) return;
    const restored = { ...restoreSolutionReviewDrafts(null, importId, currentContext), previousItems: store.previousItems };
    setStore(restored);
    pendingDraft.current = solutionReviewPendingChanges(restored, importId, currentContext) ? restored : null;
    setRecoveryConflict(null);
    if (currentContext.reviewerId) {
      try {
        if (pendingDraft.current) sessionStorage.setItem(draftStorageKey(importId, currentContext.reviewerId), JSON.stringify(pendingDraft.current));
        else sessionStorage.removeItem(draftStorageKey(importId, currentContext.reviewerId));
      }
      catch { setStorageUnavailable(true); }
    }
  }
  function discardPreviousDrafts() {
    if (!currentContext) return;
    const updated = { ...store, previousItems: {} };
    setStore(updated);
    // The visible store may contain the server version while a separate local
    // candidate awaits conflict resolution. Discard only its archived items.
    const unresolved = recoveryConflict ? { ...(pendingDraft.current ?? recoveryConflict), previousItems: {} } : null;
    setRecoveryConflict(previous => previous ? { ...previous, previousItems: {} } : null);
    pendingDraft.current = unresolved ?? (solutionReviewPendingChanges(updated, importId, currentContext) ? updated : null);
    if (currentContext.reviewerId) {
      try {
        if (pendingDraft.current) sessionStorage.setItem(draftStorageKey(importId, currentContext.reviewerId), JSON.stringify(pendingDraft.current));
        else sessionStorage.removeItem(draftStorageKey(importId, currentContext.reviewerId));
      } catch { setStorageUnavailable(true); }
    }
  }
  async function refreshBundle() {
    // The parent keeps this component mounted, including when tab storage is unavailable.
    setContextLoading(true);
    await onRefresh();
    setRetry(value => value + 1);
  }
  async function submit(decision: "approved" | "rejected") {
    if (!review || (decision === "approved" && !review.approved)) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/bundles/product/${encodeURIComponent(importId)}/solution-review`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: review.expectedRevision, expectedReviewVersion: review.expectedReviewVersion, items: review.items, decision }),
      });
      if (response.status === 409) {
        const failure = await response.json().catch(() => null) as { error?: string } | null;
        if (failure?.error === "PRODUCT_V5_REVIEW_STALE") { setRetry(value => value + 1); return; }
        if (failure?.error === "PRODUCT_BUNDLE_STALE_CONTEXT") { await refreshBundle(); return; }
      }
      if (!response.ok) throw new Error("review failed");
      if (currentContext?.reviewerId) {
        try { sessionStorage.removeItem(draftStorageKey(importId, currentContext.reviewerId)); }
        catch { setStorageUnavailable(true); }
      }
      pendingDraft.current = null;
      setRecoveryConflict(null);
      await refreshBundle();
    } catch { setError("saveError"); }
    finally { setSubmitting(false); }
  }

  return <div className="space-y-5">
    {status === "draft" ? <section className="space-y-3" aria-label={t("reviewRegion")}>
      <h2 className="font-heading text-body-base font-bold">{t("reviewEach")}</h2>
      <p className="text-body-xs text-muted-foreground">{t("releaseBoundary")}</p>
      <p role="status" className="text-body-sm font-semibold">{contextLoading ? t("loadingReview") : t("progress", { complete, total: collection.items.length })}</p>
      {storageUnavailable ? <p role="status" className="border-l-2 border-status-warning pl-3 text-body-xs text-foreground">{t("storageUnavailable")}</p> : null}
      {draftRecovery ? <p className="text-body-xs text-muted-foreground">{t(draftRecovery)}</p> : null}
      {previousDrafts.length ? <section className="space-y-2 border-l-2 border-status-warning pl-3">
        <p role="alert" className="text-body-sm">{t("previousDraftsDescription")}</p>
        <Label htmlFor="solution-previous-drafts">{t("previousDrafts")}</Label>
        <Textarea id="solution-previous-drafts" readOnly rows={6} className="text-body-sm" value={previousDrafts.map(entry => [
          t("previousItem", { id: entry.itemId }),
          ...criteria.flatMap(({ key }) => entry.draft[key] ? [`${t(key)}: ${t(entry.draft[key] === "approved" ? "approved" : "needsChanges")}`] : []),
          ...(entry.draft.notes ? [`${t("notes")}: ${entry.draft.notes}`] : []),
        ].join("\n")).join("\n\n")} />
        <Button type="button" variant="outline" disabled={saving || submitting || contextLoading || !currentContext} onClick={() => setConfirmAction("discardPrevious")}>{t("discardPrevious")}</Button>
      </section> : null}
      {recoveryConflict ? <div role="alert" className="space-y-2 border-l-2 border-status-warning pl-3">
        <p className="text-body-sm">{t("draftConflict")}</p>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={resetLocalChanges}>{t("useServer")}</Button><Button variant="outline" size="sm" onClick={() => setConfirmAction("recover")}>{t("recoverLocal")}</Button></div>
      </div> : null}
      {dirty ? <p role="status" className="text-body-xs text-muted-foreground">{t("dirty")}</p> : null}
      {context?.savedReview && !dirty ? <p className={`text-body-sm ${context.savedReview.decision === "approved" ? "text-status-success" : "text-status-warning"}`}>{t(context.savedReview.decision === "approved" ? "savedApproved" : "savedRejected")}</p> : null}
      {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-status-error"><span>{t(error)}</span><Button type="button" variant="outline" size="sm" disabled={saving || submitting} onClick={() => void refreshBundle()}>{t("reloadRevision")}</Button></div> : null}
      {context && !currentContext && !contextLoading && !error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-body-sm text-status-error"><span>{t("staleRevision")}</span><Button type="button" variant="outline" size="sm" disabled={saving || submitting} onClick={() => void refreshBundle()}>{t("reloadRevision")}</Button></div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={saving || submitting} onClick={() => setConfirmAction("discard")}>{t("discard")}</Button>
      </div>

    </section> : status === "published" ? <div className="flex items-center gap-3"><span className="text-body-sm text-status-success">{t("published")}</span><Button type="button" variant="outline" disabled={saving} onClick={() => setConfirmAction("withdraw")}>{t("withdraw")}</Button></div> : null}
    <div aria-busy={contextLoading || saving || submitting}><SolutionCollectionReader embedded itemReviewStatus={status === "draft" ? itemReviewStatus : undefined} collection={collection} initialRevealed={status === "draft"} renderItemReview={status === "draft" ? (item) => <ItemReview item={item} draft={draft[item.id] ?? {}} disabled={disabled} actions={<div className="space-y-2"><div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled || !review?.approved} onClick={() => void submit("approved")}>{t("approveBundle")}</Button>
        <Button type="button" disabled={disabled || !canPublish} onClick={() => void onMutate("publish")}>{t("publish")}</Button>
        <Button type="button" variant="outline" disabled={disabled || !review} onClick={() => void submit("rejected")}>{t("rejectBundle")}</Button>
        {complete < collection.items.length ? <Button type="button" variant="outline" disabled={disabled} onClick={goToIncomplete}>{t("nextIncomplete")}</Button> : null}
        {dirty ? <Button type="button" variant="outline" disabled={disabled} onClick={() => setConfirmAction("reset")}>{t("restoreSaved")}</Button> : null}
      </div>
      {!publicationReady ? <div role="status" aria-label={t("publicationReady")} className="space-y-2 text-body-xs text-muted-foreground">
        {solutionPublicationBlockers(publicationIssues).map(reason => <p key={reason}>{t(reason)}</p>)}
        <Button type="button" variant="outline" size="sm" disabled={saving || submitting} onClick={() => void refreshBundle()}>{t("refreshStatus")}</Button>
      </div> : null}
      </div>} onChange={(next) => {
      const itemHash = currentContext && hashes.get(item.id);
      if (!itemHash || disabled || !currentContext) return;
      const updated = { importId, baseReview: solutionReviewBaseline(currentContext), previousItems: store.previousItems, items: { ...(store.importId === importId ? store.items : {}), [item.id]: { itemHash, draft: next } } };
      setStore(updated);
      pendingDraft.current = solutionReviewPendingChanges(updated, importId, currentContext) ? updated : null;
      if (currentContext.reviewerId) {
        try {
          if (pendingDraft.current) sessionStorage.setItem(draftStorageKey(importId, currentContext.reviewerId), JSON.stringify(updated));
          else sessionStorage.removeItem(draftStorageKey(importId, currentContext.reviewerId));
        }
        catch { setStorageUnavailable(true); }
      }
    }} /> : undefined} /></div>
    <AdminConfirmDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }} title={confirmAction === "discardPrevious" ? t("discardPrevious") : confirmAction === "recover" ? t("recoverLocal") : confirmAction === "reset" ? t("restoreSaved") : confirmAction === "withdraw" ? t("withdraw") : t("discard")} description={confirmAction === "discardPrevious" ? t("discardPreviousDescription") : confirmAction === "recover" ? t("recoverDescription") : confirmAction === "reset" ? t("restoreDescription") : confirmAction === "withdraw" ? t("withdrawDescription") : t("discardDescription")} confirmLabel={confirmAction === "discardPrevious" ? t("discardPrevious") : confirmAction === "recover" ? t("recoverLocal") : confirmAction === "reset" ? t("restore") : confirmAction === "withdraw" ? t("withdraw") : t("discard")} destructive loading={saving} onConfirm={() => { const action = confirmAction; setConfirmAction(null); if (action === "discardPrevious") discardPreviousDrafts(); else if (action === "reset") resetLocalChanges(); else if (action === "recover" && recoveryConflict && currentContext) {
        const recovered = { ...recoveryConflict, baseReview: solutionReviewBaseline(currentContext) };
        setStore(recovered); setRecoveryConflict(null);
        pendingDraft.current = recovered;
        if (currentContext.reviewerId) { try { sessionStorage.setItem(draftStorageKey(importId, currentContext.reviewerId), JSON.stringify(recovered)); } catch { setStorageUnavailable(true); } }
      } else if (action && action !== "recover") void onMutate(action); }} />
  </div>;
}
