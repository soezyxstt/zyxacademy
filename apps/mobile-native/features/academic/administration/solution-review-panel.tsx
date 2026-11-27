import { randomUUID } from "expo-crypto";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { View } from "react-native";
import type { SolutionCollection } from "../../../../../lib/materials/solution-collection";
import {
  buildSolutionReview, criteria, localReviewDraft, restoreSolutionReviewDrafts, solutionReviewDraftConflicts,
  solutionReviewHasUnsavedChanges, solutionReviewPendingChanges, type DraftStore, type ItemDraft,
} from "../../../../../packages/academic/solution-review-state";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicTransport } from "../client";
import { reviewCopy, SolutionReviewContent } from "./solution-review-content";
import { readSolutionReview, saveSolutionReview, solutionReviewCanPublish, solutionReviewWebPath, SolutionReviewFailure, type SolutionReviewAttempt } from "./solution-review-client";
import { Action, CourseDialog, Field, Ink, layout, Picker } from "./ui";

type Context = Awaited<ReturnType<typeof readSolutionReview>>;
type Recovery = { draft?: DraftStore; pending?: SolutionReviewAttempt };
export type SolutionReviewGate = { revision: string; transport: AcademicTransport; publish: boolean; busy: boolean; unsaved: boolean };
const recoveryBySession = new WeakMap<AcademicTransport, Map<string, Recovery>>();
const itemsPerPage = 20;
const maxRecoveredBundles = 12;

function readRecovery(transport: AcademicTransport, id: string) { return recoveryBySession.get(transport)?.get(id); }

function keepRecovery(transport: AcademicTransport, id: string, value: Recovery) {
  let entries = recoveryBySession.get(transport);
  if (!entries) {
    entries = new Map();
    recoveryBySession.set(transport, entries);
  }
  entries.delete(id);
  if (value.draft || value.pending) entries.set(id, value);
  while (entries.size > maxRecoveredBundles) entries.delete(entries.keys().next().value!);
}

type Props = {
  importId: string; revision: string; collection: SolutionCollection; transport: AcademicTransport;
  draft: boolean; display: "read" | "review" | null;
  disabled: boolean; onGate(gate: SolutionReviewGate): void; onSaved(): void; onRefreshBundle(): void;
};

export function SolutionReviewPanel({ importId, revision, collection, transport, draft, display, disabled, onGate, onSaved, onRefreshBundle }: Props) {
  const t = reviewCopy(transport.locale);
  const en = transport.locale === "en";
  const { canInteract, suspended } = useProtectedInteraction();
  const [context, setContext] = useState<Context>();
  const [store, setStore] = useState<DraftStore>({ importId, items: {} });
  const [conflicting, setConflicting] = useState<DraftStore>();
  const [pending, setPending] = useState<SolutionReviewAttempt>();
  const [loading, setLoading] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<"retry" | "stale" | "denied" | "invalid">();
  const [reload, setReload] = useState(0);
  const [index, setIndex] = useState(0);
  const [oldPage, setOldPage] = useState(0);
  const [confirmation, setConfirmation] = useState<"approved" | "rejected" | "restore" | "discard-old">();
  const mutation = useRef<AbortController | null>(null);
  const bound = useRef(canInteract);
  bound.current = canInteract;

  useEffect(() => {
    setContext(undefined);
    setProblem(undefined);
    setConfirmation(undefined);
    if (!draft || suspended) return;
    const controller = new AbortController();
    setLoading(true);
    void readSolutionReview(transport, importId, revision, collection, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const recovered = readRecovery(transport, importId);
      const local = localReviewDraft(recovered?.draft, importId, result);
      const pending = recovered?.pending?.payload.expectedRevision === revision ? recovered.pending : undefined;
      const conflict = solutionReviewDraftConflicts(local, importId, result);
      setConflicting(conflict ? local : undefined);
      setStore(restoreSolutionReviewDrafts(local, importId, result));
      setPending(pending);
      setContext(result);
      keepRecovery(transport, importId, { draft: solutionReviewPendingChanges(local, importId, result) ? local : undefined, pending });
    }).catch(error => {
      if (controller.signal.aborted) return;
      const status = error instanceof SolutionReviewFailure ? error.status : 500;
      if ([401, 403, 404].includes(status)) {
        keepRecovery(transport, importId, {});
        setPending(undefined);
        setStore({ importId, items: {} });
        setConflicting(undefined);
        setProblem("denied");
      } else setProblem(status === 409 ? "stale" : "retry");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [draft, transport, importId, revision, collection, reload, suspended]);

  useEffect(() => () => { mutation.current?.abort(); mutation.current = null; }, [transport, importId, revision]);

  const shown = context?.collection ?? collection;
  const item = shown.items[index] ?? shown.items[0];
  const itemDrafts = Object.fromEntries(Object.entries(store.items).map(([id, entry]) => [id, entry.draft]));
  const review = context ? buildSolutionReview(context, shown, itemDrafts) : null;
  const previous = Object.values(store.previousItems ?? {});
  const dirty = Boolean(context && solutionReviewHasUnsavedChanges(context, shown, itemDrafts));
  const blocked = Boolean(conflicting || previous.length || problem || !context || loading || suspended);
  const hasLocal = dirty || Boolean(conflicting || previous.length || pending || readRecovery(transport, importId)?.draft);
  const gate = draft && solutionReviewCanPublish(context ?? null, review, {
    dirty, busy: saving || disabled, pending: Boolean(pending), conflict: blocked,
  });
  useLayoutEffect(() => { onGate({ revision, transport, publish: gate, busy: saving, unsaved: hasLocal }); },
    [onGate, revision, transport, gate, saving, hasLocal]);

  function updateStore(next: DraftStore, unresolved: DraftStore | null | undefined = conflicting, unresolvedAttempt = pending) {
    setStore(next);
    if (!context) return;
    const local = unresolved ?? localReviewDraft(next, importId, context);
    keepRecovery(transport, importId, {
      draft: solutionReviewPendingChanges(local, importId, context) ? local : undefined, pending: unresolvedAttempt,
    });
  }

  function change(next: ItemDraft) {
    if (!context || blocked || saving || pending || !bound.current()) return;
    const hash = context.itemHashes.find(entry => entry.itemId === item.id)?.itemHash;
    if (!hash) return;
    updateStore({ ...store, items: { ...store.items, [item.id]: { itemHash: hash, draft: next } } });
  }

  function chooseSaved() {
    if (!context) return;
    const next = restoreSolutionReviewDrafts({ importId, items: {}, previousItems: store.previousItems }, importId, context);
    setConflicting(undefined);
    updateStore(next, null);
    setProblem(undefined);
  }

  function recoverDraft() {
    if (!context || !conflicting) return;
    const next = restoreSolutionReviewDrafts(conflicting, importId, context, true);
    setConflicting(undefined);
    updateStore(next, null);
  }

  function discardOlder() {
    const next = { ...store, previousItems: {} };
    const unresolved = conflicting ? { ...conflicting, previousItems: {} } : undefined;
    setConflicting(unresolved);
    updateStore(next, unresolved ?? null);
  }

  async function submit(attempt: SolutionReviewAttempt) {
    if (mutation.current || !bound.current() || suspended || attempt.payload.expectedRevision !== revision) return;
    const controller = new AbortController();
    mutation.current = controller;
    setSaving(true);
    setPending(attempt);
    setConfirmation(undefined);
    setProblem(undefined);
    keepRecovery(transport, importId, { draft: readRecovery(transport, importId)?.draft, pending: attempt });
    try {
      const result = await saveSolutionReview(transport, importId, attempt, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === "uncertain") return;
      setPending(undefined);
      if (result.status === "saved") {
        keepRecovery(transport, importId, {});
        setContext(undefined);
        onSaved();
      } else if (result.status === "denied") {
        keepRecovery(transport, importId, {});
        setContext(undefined);
        setStore({ importId, items: {} });
        setConflicting(undefined);
        setProblem("denied");
      } else {
        keepRecovery(transport, importId, { draft: readRecovery(transport, importId)?.draft });
        if (result.status === "stale") setReload(value => value + 1);
        else setProblem("invalid");
      }
    } catch {
      // Explicit retry resubmits the same full snapshot. The review service acknowledges identical saves.
    } finally {
      if (mutation.current === controller) mutation.current = null;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  function submitDecision(decision: "approved" | "rejected") {
    if (!review || blocked || (decision === "approved" && !review.approved)) return;
    const { expectedRevision, expectedReviewVersion, items } = review;
    void submit({ requestId: randomUUID(), payload: { expectedRevision, expectedReviewVersion, items, decision } });
  }

  if (!display || !item) return null;

  const choose = itemDrafts[item.id] ?? {};
  const complete = shown.items.filter(entry => criteria.every(({ key }) => Boolean(itemDrafts[entry.id]?.[key]))).length;
  const ready = draft && display === "review";
  const canEdit = ready && !blocked && !disabled && !saving && !pending;
  const pageStart = Math.floor(index / itemsPerPage) * itemsPerPage;
  const count = shown.items.length;
  return <View style={layout.group}>
    <Ink kind="meta">{shown.course.title} · {shown.chapter.title}</Ink>
    <Picker label={en ? "Question" : "Soal"} selected={item.id}
      options={shown.items.slice(pageStart, pageStart + itemsPerPage).map(entry => ({ id: entry.id, label: entry.title }))}
      onSelect={id => { const next = shown.items.findIndex(entry => entry.id === id); if (next >= 0) setIndex(next); }}
      disabled={saving || count < 2} />
    {count > 1 ? <View style={layout.row}>
      <Action label={en ? "Previous question" : "Soal sebelumnya"} onPress={() => setIndex(index - 1)} disabled={!index || saving} />
      <Ink kind="meta">{index + 1} / {count}</Ink>
      <Action label={en ? "Next question" : "Soal berikutnya"} onPress={() => setIndex(index + 1)} disabled={index + 1 >= count || saving} />
    </View> : null}
    <SolutionReviewContent key={item.id} item={item} origin={transport.origin} locale={transport.locale}
      webReview={solutionReviewWebPath(shown.course.id, importId) ?? undefined} />
    {ready ? <>
      <Ink kind="heading">{t.itemReview}</Ink>
      <Ink kind="meta">{t.progress.replace("{complete}", String(complete)).replace("{total}", String(count))}</Ink>
      {loading ? <Ink>{t.loadingReview}</Ink> : null}
      {problem ? <View accessibilityLiveRegion="polite" style={layout.group}>
        <Ink tone="error">{problem === "stale" ? t.staleRevision : problem === "invalid" ? t.saveError
          : problem === "denied" ? (en ? "Review access is unavailable." : "Akses review tidak tersedia.") : t.loadError}</Ink>
        {problem === "stale" ? <Action label={t.reloadRevision} onPress={onRefreshBundle} />
          : <Action label={t.refreshStatus} onPress={() => setReload(value => value + 1)} />}
      </View> : null}
      {conflicting ? <View accessibilityLiveRegion="polite" style={layout.group}>
        <Ink tone="error">{t.draftConflict}</Ink>
        <View style={layout.row}>
          <Action label={t.useServer} onPress={chooseSaved} disabled={saving || Boolean(pending)} />
          <Action label={t.recoverLocal} onPress={recoverDraft} disabled={saving || Boolean(pending)} />
        </View>
      </View> : null}
      {previous.length > 0 ? <View style={layout.group}>
        <Ink kind="strong">{t.previousDrafts}</Ink><Ink>{t.previousDraftsDescription}</Ink>
        {previous.slice(oldPage * itemsPerPage, (oldPage + 1) * itemsPerPage).map(entry => <View key={entry.itemId + entry.itemHash} style={layout.compact}>
          <Ink kind="strong">{t.previousItem.replace("{id}", entry.itemId)}</Ink>
          {criteria.map(({ key }) => entry.draft[key] ? <Ink key={key}>{t[key]} · {entry.draft[key] === "approved" ? t.approved : t.needsChanges}</Ink> : null)}
          {entry.draft.notes ? <Ink>{entry.draft.notes}</Ink> : null}
        </View>)}
        {previous.length > itemsPerPage ? <View style={layout.row}>
          <Action label={en ? "Previous page" : "Halaman sebelumnya"} onPress={() => setOldPage(oldPage - 1)} disabled={!oldPage} />
          <Action label={en ? "Next page" : "Halaman berikutnya"} onPress={() => setOldPage(oldPage + 1)} disabled={(oldPage + 1) * itemsPerPage >= previous.length} />
        </View> : null}
        <Action label={t.discardPrevious} onPress={() => setConfirmation("discard-old")} disabled={saving || Boolean(pending)} />
      </View> : null}
      {criteria.map(({ key }) => <Picker key={key} label={t[key]} selected={choose[key] ?? ""}
        options={[{ id: "approved", label: t.approved }, { id: "changes_requested", label: t.needsChanges }]}
        disabled={!canEdit} onSelect={choice => {
          if (choice === "approved" || choice === "changes_requested") change({ ...choose, [key]: choice });
        }} />)}
      <Field label={t.notes} value={choose.notes ?? ""} editable={canEdit} onChangeText={notes => change({ ...choose, notes })} maxLength={2000} multiline />
      {context?.savedReview && !dirty ? <Ink>{context.savedReview.decision === "approved" ? t.savedApproved : t.savedRejected}</Ink> : null}
      {pending ? <View style={layout.group} accessibilityLiveRegion="polite">
        <Ink>{en ? "The save outcome is unconfirmed." : "Hasil penyimpanan belum diketahui."}</Ink>
        <Action label={en ? "Check this submission" : "Periksa kiriman ini"} onPress={() => void submit(pending)} disabled={saving || disabled || suspended} />
      </View> : <>
        <Ink kind="meta">{t.releaseBoundary}</Ink>
        <View style={layout.row}>
          {complete < count ? <Action label={t.nextIncomplete} onPress={() => {
            const next = shown.items.findIndex(entry => criteria.some(({ key }) => !itemDrafts[entry.id]?.[key]));
            if (next >= 0) setIndex(next);
          }} disabled={saving} /> : null}
          <Action label={t.approveBundle} variation="default" onPress={() => setConfirmation("approved")} disabled={!canEdit || !review?.approved} />
          <Action label={t.rejectBundle} onPress={() => setConfirmation("rejected")} disabled={!canEdit || !review} />
          {dirty && !blocked ? <Action label={t.restoreSaved} onPress={() => setConfirmation("restore")} disabled={saving} /> : null}
        </View>
      </>}
      {confirmation ? <CourseDialog title={confirmation === "approved" ? t.approveBundle : confirmation === "rejected" ? t.rejectBundle
        : confirmation === "restore" ? t.restoreSaved : t.discardPrevious} onClose={() => setConfirmation(undefined)}>
        <Ink>{confirmation === "restore" ? t.restoreDescription : confirmation === "discard-old" ? t.discardPreviousDescription : shown.title}</Ink>
        <View style={layout.row}>
          <Action label={en ? "Cancel" : "Batal"} onPress={() => setConfirmation(undefined)} />
          <Action label={en ? "Confirm" : "Konfirmasi"} variation="default" disabled={disabled || saving || suspended} onPress={() => {
            const next = confirmation;
            setConfirmation(undefined);
            if (!bound.current()) return;
            if (next === "restore") chooseSaved();
            else if (next === "discard-old") discardOlder();
            else submitDecision(next);
          }} />
        </View>
      </CourseDialog> : null}
    </> : null}
  </View>;
}
