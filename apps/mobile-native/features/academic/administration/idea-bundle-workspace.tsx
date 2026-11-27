import { useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { explainBundleError } from "../../../../../lib/bundle/admin-errors";
import { ideaInstructionalRoleSchema, ideaKnowledgeKindSchema } from "../../../../../lib/ide/contracts";
import type { LiveIdeaBundle } from "../../../../../packages/native-parity/academic/administration/live";
import { CourseMarkdown } from "../../student/CourseMarkdown";
import type { AcademicTransport } from "../client";
import { Action, AdministrationPage, CourseDialog, CourseStatus, Field, Ink, layout, Picker } from "./ui";
import { IdeaReviewEditor } from "./idea-review-editor";
import { ideaBundleControls, ideaBundlePath, IdeaBundleRequestError, ideaEditCommand, ideaLifecycleCommand,
  isIdeaCommandReceipt, patchIdeaDraft, readIdeaBundle, type IdeaBundleData, type IdeaCommand, type IdeaDecision,
  type IdeaDraftFields } from "./idea-bundle-client";

const knowledge = ["Definisi", "Prinsip", "Rumus", "Prosedur", "Contoh", "Batasan", "Miskonsepsi", "Lainnya"];
const roles = ["Inti", "Prasyarat", "Pengayaan", "Pendukung penilaian", "Referensi"];
const knowledgeOptions = ideaKnowledgeKindSchema.options.map((id, index) => ({ id, label: knowledge[index] }));
const roleOptions = ideaInstructionalRoleSchema.options.map((id, index) => ({ id, label: roles[index] }));
const statusLabels: Record<IdeaBundleData["bundle"]["status"], string> = {
  received: "Diterima", validated: "Tervalidasi", approved: "Disetujui", rejected: "Ditolak", draft: "Draf",
  published: "Terbit", withdrawn: "Ditarik", discarding: "Sedang dihapus",
};

type Props = {
  scope: LiveIdeaBundle; slug: string; transport: AcademicTransport;
  back(): void; reload(): void; listing(): void;
  unavailable(status: "denied" | "missing"): void;
};
type Confirmation = { command: IdeaCommand; message: string };
const unknownReceipts = new WeakMap<AcademicTransport, Set<string>>();

export function IdeaBundleWorkspace({ scope, slug, transport, back, reload, listing, unavailable }: Props) {
  const path = ideaBundlePath(scope.id);
  const operationKey = JSON.stringify([scope.courseId, scope.id, scope.checksum]);
  const [data, setData] = useState<IdeaBundleData>();
  const [issue, setIssue] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [index, setIndex] = useState(0);
  const [itemReview, setItemReview] = useState<string>();
  const [edit, setEdit] = useState<IdeaDraftFields>();
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState<Confirmation>();
  const [leave, setLeave] = useState<{ proceed(): void }>();
  const active = useRef<AbortController | null>(null);
  const callbacks = useRef({ unavailable, listing });
  callbacks.current = { unavailable, listing };
  const own = data?.bundle.currentReview?.status === "pending" ? null : data?.bundle.currentReview;
  const dirty = Boolean(edit || (!own && notes.trim()));

  function navigate(proceed: () => void) {
    if (active.current) return;
    if (dirty) setLeave({ proceed });
    else proceed();
  }
  const close = () => navigate(back);

  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => { close(); return true; });
    return () => handler.remove();
  }, [dirty, back]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(undefined);
    setBlocked(false);
    setIssue("");
    const pending = unknownReceipts.get(transport);
    const uncertain = pending?.has(operationKey);
    void readIdeaBundle(transport, scope, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setData(value);
      setChecking(Boolean(uncertain && !refresh));
      setBlocked(Boolean(uncertain && !refresh));
      if (uncertain && refresh) pending?.delete(operationKey);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      const status = error instanceof IdeaBundleRequestError ? error.status : 502;
      if (status === 401 || status === 403) {
        pending?.delete(operationKey);
        callbacks.current.unavailable("denied");
      } else if (status === 404) {
        pending?.delete(operationKey);
        if (uncertain) callbacks.current.listing();
        else callbacks.current.unavailable("missing");
      } else if (status === 409) {
        pending?.delete(operationKey);
        setBlocked(true);
        setIssue("Revisi bundle berubah. Muat ulang dari daftar.");
      } else {
        setIssue("Detail bundle gagal dimuat.");
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, [transport, scope.id, scope.courseId, scope.checksum, operationKey, refresh]);

  async function submit({ command }: Confirmation) {
    if (!data || !transport.command || active.current || blocked) return;
    const controller = new AbortController();
    active.current = controller;
    const pending = unknownReceipts.get(transport) ?? new Set<string>();
    unknownReceipts.set(transport, pending);
    pending.add(operationKey);
    setBusy(true);
    setConfirm(undefined);
    setIssue("");
    try {
      const response = await transport.command(path + command.suffix, {
        method: command.method, body: command.body, requestId: randomUUID(),
      }, controller.signal);
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (response.status >= 500 || response.status === 429) throw new Error("UNKNOWN");
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        pending.delete(operationKey);
        unavailable(response.status === 404 ? "missing" : "denied");
        return;
      }
      if (!response.ok) {
        pending.delete(operationKey);
        const code = body && typeof body === "object" ? String("code" in body ? body.code : "error" in body ? body.error : "") : "";
        if (command.action === "edit" && ["IDEA_BUNDLE_REVIEW_RESET_REQUIRED", "IDEA_BUNDLE_REVIEW_RESET_STALE"].includes(code)) {
          const latest = await readIdeaBundle(transport, scope, controller.signal);
          if (controller.signal.aborted) return;
          setData(latest);
          setIssue("Review tersimpan berubah. Periksa jumlah review sebelum menyimpan lagi.");
          return;
        }
        if (response.status === 409 || code === "IDEA_BUNDLE_STALE_CONTEXT") setBlocked(true);
        setIssue(explainBundleError(code));
        return;
      }
      if (!isIdeaCommandReceipt(command, scope, body)) throw new Error("UNKNOWN");
      pending.delete(operationKey);
      setEdit(undefined);
      if (command.action === "discard") listing();
      else if (command.action === "edit") reload();
      else {
        if (command.action === "review") setNotes("");
        setRefresh(value => value + 1);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!pending.has(operationKey) && error instanceof IdeaBundleRequestError) {
        if (error.status === 401 || error.status === 403 || error.status === 404) {
          unavailable(error.status === 404 ? "missing" : "denied");
          return;
        }
        setBlocked(true);
        setIssue("Detail review terbaru gagal dimuat.");
        return;
      }
      setBlocked(true);
      setChecking(true);
      setIssue("Hasil perubahan belum diketahui.");
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const controls = data && ideaBundleControls(data);
  const idea = data?.preview.ideas[index];
  function decide(value: IdeaDecision) {
    if (!data) return;
    const label = value === "approved" ? "Setujui bundle" : "Tolak bundle";
    setConfirm({ command: { action: "review", suffix: "/review", method: "POST", label,
      body: { decision: value, notes: (own?.notes ?? notes).trim() || undefined, expectedRevision: scope.checksum } },
      message: "Keputusan ini mengunci review Anda untuk revisi ini." });
  }
  function save() {
    if (!data || !idea || !edit || !edit.code.trim() || !edit.canonicalStatement.trim() || !edit.conciseExplanation.trim()) return;
    const updated = patchIdeaDraft(data.draft, idea.id, edit);
    if (JSON.stringify(updated) === JSON.stringify(data.draft)) { setEdit(undefined); return; }
    const reset = data.reviewReset;
    const command = ideaEditCommand(data, updated);
    if (reset.itemReviewCount + reset.bundleReviewCount > 0) {
      setConfirm({ command, message: `Menyimpan revisi mengganti draf dan menghapus ${reset.itemReviewCount} review Idea serta ${reset.bundleReviewCount} keputusan bundle.` });
    } else void submit({ command, message: "" });
  }
  function lifecycle(action: "publish" | "withdraw" | "discard") {
    if (!data) return;
    const message = action === "discard" ? "Draf dan review tersimpan akan dihapus."
      : action === "withdraw" ? "Publikasi bundle ini akan ditarik dari katalog."
      : "Bundle yang disetujui akan diterbitkan ke katalog.";
    setConfirm({ command: ideaLifecycleCommand(data, action), message });
  }
  const paused = loading || busy || blocked;
  return <AdministrationPage title="Review Idea Bundle" back={close}>
    {loading || busy ? <CourseStatus label={loading ? "Memuat bundle…" : "Menyimpan perubahan…"} /> : null}
    {issue ? <CourseStatus label={issue} error /> : null}
    {checking ? <Action label="Periksa hasil perubahan" onPress={() => navigate(() => { setEdit(undefined); setChecking(false); setRefresh(value => value + 1); })} />
      : blocked ? <Action label="Muat ulang bundle" onPress={() => navigate(reload)} />
      : !loading && !data ? <Action label="Coba lagi" onPress={() => setRefresh(value => value + 1)} /> : null}
    {data && controls ? <>
      <View style={layout.group}>
        <Ink kind="heading">{data.bundle.bundleId}</Ink>
        <Ink kind="meta">{statusLabels[data.bundle.status]}</Ink>
        <Ink>{`${controls.reviewed} dari ${controls.total} Idea direview`}</Ink>
      </View>
      {idea ? <View style={layout.group}>
        <View style={layout.row}>
          <Action label="Idea sebelumnya" disabled={paused || Boolean(edit) || index === 0} onPress={() => setIndex(index - 1)} />
          <Ink kind="meta">{`${index + 1} / ${controls.total}`}</Ink>
          <Action label="Idea berikutnya" disabled={paused || Boolean(edit) || index + 1 === controls.total} onPress={() => setIndex(index + 1)} />
        </View>
        {edit ? <View style={layout.group}>
          <Field label="Kode" value={edit.code} editable={!paused} onChangeText={(code) => setEdit({ ...edit, code })} />
          <Picker label="Jenis pengetahuan" options={knowledgeOptions} selected={edit.knowledgeKind} disabled={paused} onSelect={value => {
            const parsed = ideaKnowledgeKindSchema.safeParse(value); if (parsed.success) setEdit({ ...edit, knowledgeKind: parsed.data });
          }} />
          <Picker label="Peran pembelajaran" options={roleOptions} selected={edit.instructionalRole} disabled={paused} onSelect={value => {
            const parsed = ideaInstructionalRoleSchema.safeParse(value); if (parsed.success) setEdit({ ...edit, instructionalRole: parsed.data });
          }} />
          <Field label="Pernyataan" value={edit.canonicalStatement} multiline editable={!paused} onChangeText={(canonicalStatement) => setEdit({ ...edit, canonicalStatement })} />
          <Field label="Penjelasan" value={edit.conciseExplanation} multiline editable={!paused} onChangeText={(conciseExplanation) => setEdit({ ...edit, conciseExplanation })} />
          <Field label="LaTeX" value={edit.latex ?? ""} editable={!paused} onChangeText={(latex) => setEdit({ ...edit, latex: latex || undefined })} />
          <View style={layout.row}>
            <Action label="Simpan perubahan" disabled={paused || !edit.code.trim() || !edit.canonicalStatement.trim() || !edit.conciseExplanation.trim()} onPress={save} />
            <Action label="Batal edit" disabled={busy} onPress={() => setEdit(undefined)} />
          </View>
        </View> : <>
          <IdeaContent key={idea.id} idea={idea} data={data} transport={transport} />
          <View style={layout.row}>
            <Action label="Review Idea" disabled={paused} onPress={() => setItemReview(idea.id)} />
            {controls.editable && transport.command ? <Action label="Edit Idea" disabled={paused} onPress={() => {
              const current = data.draft.ideas.find(entry => entry.id === idea.id);
              if (current) setEdit({ code: current.code, canonicalStatement: current.canonicalStatement, conciseExplanation: current.conciseExplanation,
                latex: current.latex, knowledgeKind: current.knowledgeKind, instructionalRole: current.instructionalRole });
            }} /> : null}
          </View>
        </>}
      </View> : null}
      {!edit && transport.command ? <View style={layout.group}>
        {controls.editable && !own ? <Field label="Catatan keputusan bundle" value={notes} onChangeText={setNotes} multiline maxLength={4000} editable={!paused} /> : null}
        {own ? <Ink>{own.status === "approved" ? "Keputusan Anda: disetujui" : "Keputusan Anda: ditolak"}</Ink> : null}
        {own?.notes ? <Ink>{own.notes}</Ink> : null}
        {controls.editable && !own?.revisionBound && controls.reviewed < controls.total ? <Ink>Review semua Idea sebelum menyimpan keputusan.</Ink> : null}
        <View style={layout.row}>
          {controls.approve ? <Action label={own ? "Tegaskan persetujuan" : "Setujui bundle"} disabled={paused} onPress={() => decide("approved")} /> : null}
          {controls.reject ? <Action label={own ? "Tegaskan penolakan" : "Tolak bundle"} disabled={paused} onPress={() => decide("rejected")} /> : null}
          {controls.publish ? <Action label="Terbitkan bundle" disabled={paused} onPress={() => lifecycle("publish")} /> : null}
          {controls.withdraw ? <Action label="Tarik publikasi" disabled={paused} onPress={() => lifecycle("withdraw")} /> : null}
          {controls.discard ? <Action label="Hapus draf" disabled={paused} onPress={() => lifecycle("discard")} /> : null}
        </View>
      </View> : null}
    </> : null}
    {itemReview ? <IdeaReviewEditor key={itemReview} slug={slug} importId={scope.id} ideaId={itemReview} expectedRevision={scope.checksum}
      transport={transport} close={() => setItemReview(undefined)} unavailable={unavailable}
      saved={() => { setItemReview(undefined); setRefresh(value => value + 1); }} /> : null}
    {confirm ? <CourseDialog title={confirm.command.label} onClose={() => setConfirm(undefined)}>
      <Ink>{confirm.message}</Ink>
      <View style={layout.row}>
        <Action label={confirm.command.label} onPress={() => void submit(confirm)} />
        <Action label="Batal" onPress={() => setConfirm(undefined)} />
      </View>
    </CourseDialog> : null}
    {leave ? <CourseDialog title="Tinggalkan perubahan?" onClose={() => setLeave(undefined)}>
      <Ink>Perubahan yang belum disimpan akan hilang.</Ink>
      <Action label="Tinggalkan" onPress={() => { setLeave(undefined); leave.proceed(); }} />
      <Action label="Lanjutkan" onPress={() => setLeave(undefined)} />
    </CourseDialog> : null}
  </AdministrationPage>;
}

function IdeaContent({ idea, data, transport }: { idea: IdeaBundleData["preview"]["ideas"][number]; data: IdeaBundleData; transport: AcademicTransport }) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [showSources, setShowSources] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const source = idea.provenance[sourceIndex];
  const section = data.preview.learningSections.find(entry => entry.primaryIdeaIds.includes(idea.id));
  const links = showLinks ? data.preview.relations.filter(entry => entry.sourceIdeaId === idea.id || entry.targetIdeaId === idea.id) : [];
  const markdown = (value: string) => <CourseMarkdown source={value} allowLinks={false} services={{ session: transport }} />;
  return <View style={layout.group}>
    <Ink kind="heading">{idea.code}</Ink>
    {section ? <Ink kind="meta">{section.title}</Ink> : null}
    {markdown(idea.canonicalStatement)}
    {markdown(idea.conciseExplanation)}
    {idea.latex ? markdown(`$$\n${idea.latex}\n$$`) : null}
    <View style={layout.row}>
      {source ? <Action label={showSources ? "Sembunyikan sumber" : `Sumber (${idea.provenance.length})`} onPress={() => setShowSources(!showSources)} /> : null}
      <Action label={showLinks ? "Sembunyikan keterkaitan" : "Keterkaitan"} onPress={() => setShowLinks(!showLinks)} />
    </View>
    {source && showSources ? <View style={layout.group}>
      <Ink kind="strong">{source.sourceTitle}</Ink>
      <Ink kind="meta">{[source.role, source.sectionLocator, source.pageNumber === null ? null : `Halaman ${source.pageNumber}`].filter(Boolean).join(" · ")}</Ink>
      {markdown(source.excerpt)}
      {source.note ? markdown(source.note) : null}
      <View style={layout.row}>
        <Action label="Sumber sebelumnya" disabled={sourceIndex === 0} onPress={() => setSourceIndex(sourceIndex - 1)} />
        <Ink kind="meta">{`${sourceIndex + 1} / ${idea.provenance.length}`}</Ink>
        <Action label="Sumber berikutnya" disabled={sourceIndex + 1 === idea.provenance.length} onPress={() => setSourceIndex(sourceIndex + 1)} />
      </View>
    </View> : null}
    {showLinks ? <View style={layout.group}>
      {section?.learningObjective ? markdown(section.learningObjective) : null}
      {links.length > 0 ? links.map(link => <View key={link.id} style={layout.compact}>
        <Ink kind="strong">{link.relationType.replaceAll("_", " ")}</Ink>
        <Ink>{[link.sourceIdeaId, link.targetIdeaId].map(id => data.preview.ideas.find(entry => entry.id === id)?.code ?? id).join(" → ")}</Ink>
        {link.explanation ? markdown(link.explanation) : null}
      </View>) : <Ink>Belum ada hubungan antar-Idea.</Ink>}
    </View> : null}
  </View>;
}
