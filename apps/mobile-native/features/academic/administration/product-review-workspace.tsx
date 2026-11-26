import { useEffect, useRef, useState } from "react";
import { BackHandler, View } from "react-native";
import { randomUUID } from "expo-crypto";
import { explainBundleError } from "../../../../../lib/bundle/admin-errors";
import type { LiveProductBundle } from "../../../../../packages/native-parity/academic/administration/live";
import type { AcademicCommand, AcademicTransport } from "../client";
import { Action, AdministrationPage, CourseDialog, Field, Ink, layout, Picker } from "./ui";
import { canPublishProduct, productPath, ProductReviewError, readProductReview, reviewTargets, type ProductReviewData, type ReviewTarget } from "./product-review-client";
import { ProductDraftEditor } from "./product-draft-editor";
import { ProductReviewRubric } from "./product-review-rubric";

type Confirmation = { label: string; suffix: string; method: AcademicCommand["method"]; body: object; success: "refresh" | "exit" | "list" };
const itemChoices = [{ id: "pending", label: "Menunggu" }, { id: "changes_requested", label: "Perlu revisi" }, { id: "approved", label: "Disetujui" }] as const;

function ItemReview({ data, item, busy, confirm, dirty }: { data: ProductReviewData; item: ReviewTarget; busy: boolean;
  confirm(command: Confirmation): void; dirty(value: boolean): void }) {
  const existing = data.blockReviews.find(entry => entry.targetType === item.targetType && entry.productId === item.productId && entry.targetId === item.targetId);
  const [choice, setChoice] = useState(existing?.status ?? "pending");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  useEffect(() => dirty((existing?.status ?? "pending") !== choice || (existing?.notes ?? "") !== notes.trim()), [choice, notes, existing, dirty]);
  return <View style={layout.group}>
    <Ink>{item.content}</Ink>
    <Picker label="Keputusan" options={itemChoices} selected={choice} disabled={busy} onSelect={id => {
      const next = itemChoices.find(e => e.id === id); if (next) setChoice(next.id);
    }} />
    <Field label="Catatan" value={notes} onChangeText={setNotes} maxLength={2000} multiline editable={!busy} />
    <Action label="Simpan review item" disabled={busy || ((existing?.status ?? "pending") === choice && (existing?.notes ?? "") === notes.trim())}
      onPress={() => confirm({ label: "Simpan review item", suffix: "/item-reviews", method: "PUT", success: "refresh",
        body: { expectedRevision: data.bundle.checksum, targetType: item.targetType, targetId: item.targetId, productId: item.productId,
          status: choice, notes: notes.trim() || undefined } })} />
  </View>;
}

export function ProductReviewWorkspace({ scope, transport, back, exit, listing }: { scope: LiveProductBundle; transport: AcademicTransport;
  back(): void; exit(): void; listing(): void }) {
  const [data, setData] = useState<ProductReviewData>();
  const [version, setVersion] = useState(0);
  const [issue, setIssue] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [select, setSelect] = useState("");
  const [targetId, setTargetId] = useState("");
  const [panel, setPanel] = useState("read");
  const [confirm, setConfirm] = useState<Confirmation>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leave, setLeave] = useState<{ next: () => void }>();
  function navigate(next: () => void) {
    if (active.current) return;
    if (dirty) setLeave({ next });
    else next();
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { navigate(back); return true; });
    return () => sub.remove();
  }, [back, dirty]);
  const active = useRef<AbortController | null>(null);
  const path = productPath(scope.id);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setConfirm(undefined); setIssue(""); setBlocked(false);
    readProductReview(transport, scope, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => {
      if (controller.signal.aborted) return;
      setIssue(error instanceof ProductReviewError && error.status === 409 ? "Revisi bundle berubah. Buka kembali dari daftar."
        : error instanceof ProductReviewError && [401,403,404].includes(error.status) ? "Bundle tidak tersedia untuk akun ini." : "Detail bundle gagal dimuat.");
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, [transport, scope.id, scope.courseId, scope.checksum, version]);

  async function submit(command: Confirmation) {
    if (!transport.command || active.current || blocked) return;
    const controller = new AbortController();
    active.current = controller; setBusy(true); setConfirm(undefined); setIssue("");
    try {
      const response = await transport.command(path + command.suffix, { method: command.method, body: command.body, requestId: randomUUID() }, controller.signal);
      const json = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if ([401,403,404].includes(response.status)) setData(undefined);
        if (response.status === 409 || response.status >= 500) setBlocked(true);
        setIssue(response.status >= 500 ? "Hasil perubahan belum diketahui. Periksa kembali bundle."
          : explainBundleError(json && typeof json === "object" && "code" in json ? String(json.code)
            : json && typeof json === "object" && "error" in json ? String(json.error) : ""));
        return;
      }
      if (!json || typeof json !== "object" || !("result" in json) || !json.result) throw new Error("UNKNOWN");
      setDirty(false);
      if (command.success === "list") listing();
      else if (command.success === "exit") exit();
      else setVersion(v => v + 1);
    } catch {
      if (!controller.signal.aborted) { setBlocked(true); setIssue("Hasil perubahan belum diketahui. Periksa kembali bundle."); }
    } finally {
      if (active.current === controller) active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const selected = data?.draft.products.find(p => p.id === select) ?? data?.draft.products[0];
  const preview = data?.previews.find(p => p.id === selected?.id);
  const targets = selected?.productType === "article" ? reviewTargets(selected) : [];
  const target = targets.find(r => r.targetId === targetId) ?? targets[0];
  const pendingPdf = data?.pdfStatuses?.some(p => p.revision === scope.checksum && p.status === "pending");
  const lifecycle = (label: string, suffix: string, method: "POST" | "DELETE") => setConfirm({ label, suffix, method,
    success: method === "DELETE" ? "list" : "exit", body: { expectedRevision: scope.checksum } });
  const draft = data?.bundle.status === "draft";
  const v5 = data?.manifest.schemaVersion === "product-bundle.v5";
  return <AdministrationPage title="Review produk" back={() => navigate(back)}>
    {issue ? <><Ink tone="error">{issue}</Ink><Action label="Periksa kembali" onPress={() => navigate(exit)} /></> : null}
    {leave ? <CourseDialog title="Buang perubahan yang belum disimpan?" onClose={() => setLeave(undefined)}>
      <View style={layout.row}><Action label="Lanjut mengedit" onPress={() => setLeave(undefined)} />
        <Action label="Buang perubahan" variation="destructive" onPress={() => { setLeave(undefined); setDirty(false); leave.next(); }} /></View>
    </CourseDialog> : null}
    {!data && !issue ? <Ink>Memuat bundle…</Ink> : null}
    {data && !blocked ? <>
      <Ink kind="heading">{data.bundle.bundleId}</Ink>
      <Picker label="Tindakan" selected={panel} options={[{ id: "read", label: "Isi produk" },
        ...(draft && !pendingPdf && !v5 ? [{ id: "edit", label: "Edit produk" }, { id: "review", label: "Keputusan bundle" }] : []),
        { id: "release", label: "Publikasi" }]} onSelect={id => { if (id !== panel) navigate(() => setPanel(id)); }} disabled={busy} />
      {panel === "read" || panel === "edit" ? <>
        <Picker label="Produk" selected={selected?.id ?? ""} options={data.previews.map(p => ({ id: p.id, label: p.title }))}
          onSelect={id => { if (id !== selected?.id) navigate(() => { setSelect(id); setTargetId(""); }); }} disabled={busy} />
        {panel === "read" && target ? <>
          <Picker label={target.targetType === "article_section" ? "Bagian" : "Blok"} selected={target.targetId}
            options={targets.map(t => ({ id: t.targetId, label: t.label }))} onSelect={id => { if (id !== target.targetId) navigate(() => setTargetId(id)); }} disabled={busy} />
          {draft && !data.bundle.currentReview && !pendingPdf ? <ItemReview key={JSON.stringify([version,selected?.id,target.targetId])}
            item={target} data={data} busy={busy} dirty={setDirty} confirm={setConfirm} /> : <Ink>{target.content}</Ink>}
        </> : panel === "read" ? preview?.sections.map((s, i) => <View key={i} style={layout.compact}><Ink kind="strong">{s.label}</Ink><Ink>{s.content}</Ink></View>)
          : selected ? <ProductDraftEditor busy={busy} dirty={setDirty} key={selected.id} data={data} id={selected.id}
            save={body => setConfirm({ label: "Simpan revisi", suffix: "", method: "PUT", success: "exit", body })} /> : null}
      </> : panel === "review" && draft && !v5 && !pendingPdf ? <ProductReviewRubric data={data} busy={busy} dirty={setDirty}
        decide={(label, body) => setConfirm({ label, body, method: "POST", suffix: "/review", success: "refresh" })} />
        : panel === "release" ? <>
          {data.blockingIssues?.map((reason,i) => <Ink key={i}>{reason.remediation || reason.reason}</Ink>)}
          <View style={layout.row}>
            {draft ? <Action label="Terbitkan" disabled={busy || !canPublishProduct(data)} onPress={() => lifecycle("Terbitkan bundle", "/publish", "POST")} /> : null}
            {draft ? <Action label="Hapus draf" disabled={busy || pendingPdf} onPress={() => lifecycle("Hapus draf", "", "DELETE")} /> : null}
            {data.bundle.status === "published" ? <Action label="Tarik publikasi" disabled={busy} onPress={() => lifecycle("Tarik publikasi", "/withdraw", "POST")} /> : null}
          </View>
        </> : null}
      {confirm ? <CourseDialog title={confirm.label} onClose={() => setConfirm(undefined)}>
        <Ink>{data.bundle.bundleId}</Ink>
        <View style={layout.row}><Action label="Batal" onPress={() => setConfirm(undefined)} /><Action label={confirm.label} onPress={() => void submit(confirm)} /></View>
      </CourseDialog> : null}
    </> : null}
  </AdministrationPage>;
}
