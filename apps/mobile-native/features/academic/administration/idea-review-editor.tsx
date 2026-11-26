import { randomUUID } from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ideaReviewNoteLimit, ideaReviewStatuses, isIdeaReviewTarget, type IdeaReviewDraft, type IdeaReviewStatus, type IdeaReviewTarget } from "../../../../../packages/academic/idea-item-review";
import { ADMINISTRATION_API_PREFIX } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicTransport } from "../client";
import { Action, CourseDialog, CourseStatus, Field, Ink, Picker, SaveButtons, layout } from "./ui";

type Pending = { draft: IdeaReviewDraft; requestId: string };
const statusOptions = Object.entries(ideaReviewStatuses).map(([id, label]) => ({ id, label }));
const pendingReviews = new WeakMap<AcademicTransport, Map<string, Pending>>();

type Props = {
  slug: string; importId: string; ideaId: string; transport: AcademicTransport;
  close(): void; unavailable(status: "denied" | "missing"): void; saved(): void;
};

export function IdeaReviewEditor({ slug, importId, ideaId, transport, close, unavailable, saved }: Props) {
  const path = ADMINISTRATION_API_PREFIX + ["bundle", "idea", slug, importId, "item", ideaId].map(encodeURIComponent).join("/");
  const [load, setLoad] = useState(0);
  const [target, setTarget] = useState<IdeaReviewTarget>();
  const [draft, setDraft] = useState<IdeaReviewDraft>();
  const [issue, setIssue] = useState<"failed" | "conflict" | "web" | "invalid">();
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState<Pending>();
  const activeWrite = useRef<AbortController | null>(null);
  const callbacks = useRef({ unavailable, saved });
  callbacks.current = { unavailable, saved };

  useEffect(() => {
    const controller = new AbortController();
    setTarget(undefined);
    setDraft(undefined);
    setIssue(undefined);
    setUncertain(undefined);
    void transport.get(path, controller.signal).then(async (response) => {
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) {
        pendingReviews.get(transport)?.delete(path);
        callbacks.current.unavailable(response.status === 404 ? "missing" : "denied");
        return;
      }
      if (response.status === 422) { setIssue("web"); return; }
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || !isIdeaReviewTarget(data) || data.importId !== importId || data.ideaId !== ideaId) {
        setIssue(response.status === 409 ? "conflict" : "failed");
        return;
      }
      const pending = pendingReviews.get(transport)?.get(path);
      if (pending && pending.draft.expectedRevision !== data.review.expectedRevision) {
        pendingReviews.get(transport)?.delete(path);
      }
      const recovered = pendingReviews.get(transport)?.get(path);
      setTarget(data);
      setDraft(recovered?.draft ?? data.review);
      setUncertain(recovered);
    }).catch(() => { if (!controller.signal.aborted) setIssue("failed"); });
    return () => {
      controller.abort();
      activeWrite.current?.abort();
      activeWrite.current = null;
    };
  }, [ideaId, importId, path, transport, load]);

  async function save(pending: Pending) {
    if (!transport.command || activeWrite.current || !target ||
      (!target.editable && pendingReviews.get(transport)?.get(path) !== pending)) return;
    const controller = new AbortController();
    activeWrite.current = controller;
    const requests = pendingReviews.get(transport) ?? new Map<string, Pending>();
    pendingReviews.set(transport, requests);
    requests.set(path, pending);
    setIssue(undefined);
    setBusy(true);
    try {
      const response = await transport.command(path, { method: "PATCH", requestId: pending.requestId, body: pending.draft }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.status >= 500 || response.status === 429) { setUncertain(pending); return; }
      if ([401, 403, 404].includes(response.status)) {
        requests.delete(path);
        callbacks.current.unavailable(response.status === 404 ? "missing" : "denied");
        return;
      }
      if (!response.ok) {
        requests.delete(path);
        setUncertain(undefined);
        setIssue(response.status === 409 ? "conflict" : "invalid");
        return;
      }
      const receipt = await response.json();
      if (controller.signal.aborted) return;
      if (!receipt || typeof receipt !== "object" || !("requestId" in receipt) || receipt.requestId !== pending.requestId ||
        !("importId" in receipt) || receipt.importId !== importId || !("ideaId" in receipt) || receipt.ideaId !== ideaId ||
        !("status" in receipt) || receipt.status !== pending.draft.status) {
        setUncertain(pending);
        return;
      }
      requests.delete(path);
      callbacks.current.saved();
    } catch {
      if (!controller.signal.aborted) setUncertain(pending);
    } finally {
      if (activeWrite.current === controller) activeWrite.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function start() {
    if (!draft || draft.notes.includes("\0")) { setIssue("invalid"); return; }
    void save({ requestId: randomUUID(), draft: { ...draft, notes: draft.notes.trim() } });
  }

  const editable = Boolean(target?.editable && transport.command);
  return <CourseDialog title="Review Idea" onClose={close} dismissDisabled={busy}>
    {target && draft ? <>
      <Ink kind="heading">{target.code}</Ink>
      <Ink>{target.statement}</Ink>
      <Ink>{target.explanation}</Ink>
      {target.latex ? <Ink>{target.latex}</Ink> : null}
      {target.sources.map((source, index) => <View key={index} style={layout.compact}>
        <Ink kind="strong">{source.title}</Ink>
        {source.locator ? <Ink kind="meta" tone="muted">{source.locator}</Ink> : null}
        <Ink>{source.excerpt}</Ink>
      </View>)}
      {busy || uncertain || issue === "conflict" || !editable ? <Ink>{ideaReviewStatuses[draft.status]}</Ink>
        : <Picker label="Keputusan" options={statusOptions} selected={draft.status}
          onSelect={(id) => setDraft({ ...draft, status: id as IdeaReviewStatus })} />}
      <Field label="Catatan review" value={draft.notes} multiline maxLength={ideaReviewNoteLimit} testID="academic-idea-review-notes"
        editable={editable && !busy && !uncertain && issue !== "conflict"} onChangeText={(notes) => setDraft({ ...draft, notes })} />
    </> : !issue ? <CourseStatus label="Memuat Idea…" /> : null}
    {issue === "web" ? <CourseStatus label="Buka detail Idea di web untuk meninjau konten ini." error /> : null}
    {issue === "conflict" || issue === "failed" ? <CourseStatus error
      label={issue === "conflict" ? "Idea atau keputusan review telah berubah." : "Detail Idea gagal dimuat."}
      retry={() => setLoad((value) => value + 1)} /> : null}
    {issue === "invalid" ? <CourseStatus label="Periksa keputusan dan catatan review." error /> : null}
    {uncertain ? <View style={layout.row}>
      <Action label="Periksa dengan percobaan ulang" testID="academic-idea-review-retry" disabled={busy} onPress={() => void save(uncertain)} />
      <Action label="Tutup" disabled={busy} onPress={close} />
    </View> : editable && issue !== "conflict" ? <SaveButtons onSave={start} onCancel={close} busy={busy} /> : null}
  </CourseDialog>;
}
