import { useState } from "react";
import { View } from "react-native";
import {
  productCriteria, type Bundle, type BundleDecision, type ItemDecision, type ReviewItem,
} from "../../../../../packages/native-parity/academic/administration/fixtures";
import { useAdministrationStore } from "./provider";
import {
  Action, DataRow, Field, Ink, MultiChoice, PagedRows, SaveButtons, SearchBox, Subheading, Tabs,
  courseName, layout, matchWords, normalSearch, useAdministrationMutation,
} from "./ui";

const itemStatus: Record<ItemDecision, string> = { pending: "Menunggu review", approved: "Disetujui", changes_requested: "Perlu revisi" };
const bundleStatus = { ...itemStatus, validated: "Tervalidasi", rejected: "Ditolak", published: "Terbit", withdrawn: "Ditarik" };
const itemTypes = { concept: "Ide", article: "Artikel", diktat: "Diktat" };
const criteriaOptions = productCriteria.map((criterion) => ({ id: criterion, label: criterion }));
const productTabs = [{ id: "all", label: "Semua" }, { id: "article", label: "Artikel" }, { id: "diktat", label: "Diktat" }] as const;
type ProductTab = (typeof productTabs)[number]["id"];

function ContentEditor({ initial, cancel, save }: { initial: ReviewItem; cancel(): void; save(title: string, content: string): void }) {
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  return <Subheading title="Edit konten">
    <Field label="Judul" value={title} onChangeText={setTitle} testID="academic-review-edit-title" />
    <Field label="Konten" value={content} onChangeText={setContent} multiline testID="academic-review-edit-content" />
    <SaveButtons saveLabel="Simpan revisi" onCancel={cancel} onSave={() => save(title, content)} />
  </Subheading>;
}

function ItemReview({ item, disabled, save }: { item: ReviewItem; disabled: boolean; save(status: ItemDecision, note: string): void }) {
  const [note, setNote] = useState(item.note);
  return <View style={layout.group}>
    <Field label="Catatan bagian" value={note} onChangeText={setNote} multiline editable={!disabled} />
    <View style={layout.row}>
      <Action label="Setujui bagian" onPress={() => save("approved", note)} disabled={disabled} testID="academic-review-item-approve" />
      <Action label="Minta revisi bagian" onPress={() => save("changes_requested", note)} disabled={disabled} />
      {item.status !== "pending" ? <Action label="Setel ulang" onPress={() => save("pending", note)} disabled={disabled} /> : null}
    </View>
  </View>;
}

export function AdministrationBundleReview({ bundle, returnToReview }: { bundle: Bundle; returnToReview(): void }) {
  const store = useAdministrationStore();
  const mutation = useAdministrationMutation(store);
  const product = bundle.kind === "product";
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<ProductTab>("all");
  const [selected, setSelected] = useState(bundle.items[0]?.id ?? "");
  const [source, setSource] = useState(false);
  const [edit, setEdit] = useState<{ item: ReviewItem; revision: number }>();
  const [reason, setReason] = useState(bundle.reason);
  const [criteria, setCriteria] = useState<string[]>(bundle.criteria);
  const rows = bundle.items.filter((item) => (tab === "all" || item.type === tab) && matchWords(normalSearch(search), [item.title, item.content]));
  const active = rows.find((item) => item.id === selected) ?? rows[0];
  const reviewed = bundle.items.filter((item) => item.status !== "pending").length;
  const locked = bundle.status === "published" || bundle.status === "withdrawn";
  const busy = bundle.pdf === "pending";
  const saveCurrentReview = (status: BundleDecision) => {
    mutation.run({ type: "bundle.decide", id: bundle.id, revision: bundle.revision, status, reason, criteria }, {
      title: status === "approved" ? "Setujui bundle?" : status === "rejected" ? "Tolak bundle?" : "Minta revisi bundle?",
      description: bundle.title, destructive: status === "rejected", confirmLabel: status === "approved" ? "Setujui" : status === "rejected" ? "Tolak" : "Minta revisi",
      success: "Keputusan review disimpan.",
    });
  };

  return <>
    <Subheading title={bundle.title}>
      <Ink kind="meta" tone="muted">{`${courseName(bundle.courseId)} · ${bundle.author} · Revisi ${bundle.revision}`}</Ink>
      <Ink>{bundleStatus[bundle.status]}</Ink>
    </Subheading>
    {mutation.feedback}
    <View style={layout.row}><Action label={source ? "Tutup sumber" : "Lihat sumber"} onPress={() => setSource(!source)} /></View>
    {source ? <Subheading title="Sumber">
      <Ink>{bundle.source}</Ink>
      {bundle.items.map((item) => <DataRow key={item.id} title={item.title} description={item.source} />)}
    </Subheading> : null}
    {product ? <Tabs<ProductTab> options={productTabs} selected={tab} onSelect={setTab} testID="academic-product-filter" /> : null}
    <SearchBox label={product ? "Cari bagian produk" : "Cari ide"} value={search} onChange={setSearch} />
    <PagedRows key={`${search}-${tab}`} rows={rows} empty="Belum ada konten untuk ditinjau." filtered={Boolean(search || tab !== "all")}
      render={(item) => <DataRow key={item.id} title={item.title} description={product ? itemTypes[item.type] : undefined}
        detail={[active?.id === item.id ? "Dibuka" : "", itemStatus[item.status]].filter(Boolean).join(" · ")}
        testID={`academic-review-item-${item.id}`} onPress={() => { setSelected(item.id); setEdit(undefined); }} />} />
    {active ? <Subheading title={active.title}>
      {edit?.item.id === active.id ? <ContentEditor key={active.id} initial={edit.item} cancel={() => setEdit(undefined)}
        save={(title, content) => mutation.run({ type: "bundle.content", id: bundle.id, revision: edit.revision, itemId: edit.item.id, title, content }, {
          title: "Simpan revisi konten?", description: "Status review dan verifikasi bundle akan direset.", confirmLabel: "Simpan revisi",
          success: "Revisi konten disimpan.", after: () => { setEdit(undefined); setCriteria([]); setReason(""); },
          review: () => {
            const current = store.getSnapshot().records.bundles.find((entry) => entry.id === bundle.id)?.items.find((entry) => entry.id === edit.item.id);
            return current ? <Ink>{`${current.title}\n${current.content}`}</Ink> : null;
          },
        })} /> : <>
          <Ink>{active.content}</Ink>
          <Ink kind="meta" tone="muted">{active.source}</Ink>
          {!locked ? <>
            <View style={layout.row}><Action label="Edit konten" onPress={() => setEdit({ item: active, revision: bundle.revision })} disabled={busy} /></View>
            <ItemReview key={`${active.id}-${active.note}`} item={active} disabled={busy} save={(status, note) => mutation.run(
              { type: "bundle.item", id: bundle.id, revision: bundle.revision, itemId: active.id, status, note },
              { success: "Review bagian disimpan." },
            )} />
          </> : active.note ? <Ink>{active.note}</Ink> : null}
        </>}
    </Subheading> : null}
    {product ? <Subheading title="Kesiapan produk">
      <Ink kind="meta">{bundle.pdf === "ready" ? "Bukti PDF tersedia" : bundle.pdf === "pending" ? "Verifikasi PDF dalam antrean" : "Perlu verifikasi PDF"}</Ink>
      {!locked && bundle.pdf !== "ready" ? <View style={layout.row}><Action label={busy ? "Periksa status PDF" : "Minta verifikasi PDF"} onPress={() => mutation.run(
        { type: busy ? "bundle.pdf.poll" : "bundle.pdf.request", id: bundle.id, revision: bundle.revision },
        { success: busy ? "Bukti PDF tersedia." : "Verifikasi PDF diantrekan." },
      )} disabled={Boolean(edit)} /></View> : null}
      {!locked ? <MultiChoice label="Kriteria pedagogis terpenuhi" options={criteriaOptions} chosen={criteria}
        change={setCriteria} disabled={busy || Boolean(edit)} /> : null}
    </Subheading> : null}
    <Subheading title="Keputusan bundle">
      <Ink kind="meta" tone="muted">{`${reviewed}/${bundle.items.length} bagian ditinjau`}</Ink>
      {locked ? bundle.reason ? <Ink>{bundle.reason}</Ink> : null : <>
        <Field label="Catatan keputusan" value={reason} onChangeText={setReason} multiline editable={!busy && !edit} />
        <View style={layout.row}>
          <Action label="Setujui bundle" onPress={() => saveCurrentReview("approved")} disabled={busy || Boolean(edit)} testID="academic-bundle-approve" />
          {product ? <Action label="Minta revisi" onPress={() => saveCurrentReview("changes_requested")} disabled={busy || Boolean(edit)} /> : null}
          <Action label="Tolak bundle" onPress={() => saveCurrentReview("rejected")} disabled={busy || Boolean(edit)} />
        </View>
      </>}
      <View style={layout.row}>
        {bundle.status === "approved" ? <Action label="Terbitkan bundle" variation="default" disabled={busy || Boolean(edit)} onPress={() => mutation.run(
          { type: "bundle.publish", id: bundle.id, revision: bundle.revision },
          { title: "Terbitkan bundle?", description: bundle.title, confirmLabel: "Terbitkan", success: "Bundle diterbitkan." },
        )} /> : null}
        {bundle.status === "published" ? <Action label="Tarik publikasi" variation="destructive" onPress={() => mutation.run(
          { type: "bundle.withdraw", id: bundle.id, revision: bundle.revision },
          { title: "Tarik publikasi?", description: bundle.title, confirmLabel: "Tarik publikasi", destructive: true, success: "Publikasi ditarik." },
        )} /> : null}
        {!locked ? <Action label="Hapus bundle" variation="destructive" disabled={busy || Boolean(edit)} onPress={() => mutation.run(
          { type: "bundle.delete", id: bundle.id, revision: bundle.revision },
          { title: "Hapus bundle?", description: bundle.title, confirmLabel: "Hapus bundle", destructive: true, success: "Bundle dihapus.", after: returnToReview },
        )} /> : null}
      </View>
    </Subheading>
  </>;
}
