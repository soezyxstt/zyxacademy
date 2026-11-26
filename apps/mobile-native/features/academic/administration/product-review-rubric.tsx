import { useEffect, useState } from "react";
import { View } from "react-native";
import { PEDAGOGIC_CRITERION_IDS } from "../../../../../lib/materials/quality-policy-constants";
import { Action, Field, Ink, layout, Picker } from "./ui";
import type { ProductReviewData, RubricItem } from "./product-review-client";

const criterionLabels = {
  concept_accuracy: "Ketepatan konsep", prerequisite_completeness: "Kelengkapan prasyarat",
  explanation_sequence: "Urutan penjelasan", symbol_and_condition_clarity: "Simbol dan syarat",
  example_reasoning: "Alasan pada contoh", representation_or_visual: "Representasi dan visual",
  misconceptions_and_limits: "Miskonsepsi dan batasan", formative_check_and_explanation: "Cek pemahaman dan pembahasan",
};
type Criterion = typeof PEDAGOGIC_CRITERION_IDS[number];
type Draft = Partial<Omit<RubricItem, "criterionId">>;
const decisions = [{ id: "met", label: "Terpenuhi" }, { id: "needs_revision", label: "Perlu revisi" }, { id: "not_met", label: "Belum terpenuhi" }] as const;

export function ProductReviewRubric({ data, busy, decide, dirty }: { data: ProductReviewData; busy: boolean;
  dirty(value: boolean): void; decide(label: string, body: Record<string, unknown>): void }) {
  const [selected, setSelected] = useState<Criterion>(PEDAGOGIC_CRITERION_IDS[0]);
  const [note, setNote] = useState(data.bundle.currentReview?.notes ?? data.pedagogicReview?.notes ?? "");
  const [drafts, setDrafts] = useState<Partial<Record<Criterion, Draft>>>({});
  const draftFor = (id: Criterion): Draft => drafts[id] ?? data.pedagogicReview?.criteria.find(row => row.criterionId === id) ?? {};
  const changed = note !== (data.bundle.currentReview?.notes ?? data.pedagogicReview?.notes ?? "")
    || PEDAGOGIC_CRITERION_IDS.some(id => {
      if (!drafts[id]) return false;
      const saved = data.pedagogicReview?.criteria.find(row => row.criterionId === id);
      const next = draftFor(id);
      return saved?.status !== next.status || (saved?.reason ?? "") !== (next.reason ?? "")
        || JSON.stringify(saved?.contentAnchors ?? []) !== JSON.stringify(next.contentAnchors ?? []);
    });
  useEffect(() => dirty(changed), [dirty, changed]);
  const current = draftFor(selected);
  const change = (patch: Draft) => setDrafts({ ...drafts, [selected]: { ...current, ...patch } });
  const criteria = PEDAGOGIC_CRITERION_IDS.flatMap(criterionId => {
    const row = draftFor(criterionId);
    return row.status && row.reason?.trim() && row.contentAnchors?.length ? [{ ...row, criterionId, reason: row.reason.trim() }] : [];
  });
  const sections = data.context?.sections.flatMap(section => {
    const saved = data.blockReviews.find(r => r.productId === section.productId && r.targetType === "article_section" && r.targetId === section.sectionId);
    return saved && saved.status !== "pending" ? [{ productId: section.productId, sectionId: section.sectionId, semanticHash: section.semanticHash,
      decision: saved.status, ...(saved.notes ? { notes: saved.notes } : {}) }] : [];
  }) ?? [];
  const complete = !data.context || (criteria.length === PEDAGOGIC_CRITERION_IDS.length && sections.length === data.context.sections.length);
  const approve = complete && criteria.every(row => row.status === "met") && sections.every(row => row.decision === "approved")
    && (!data.v4ReviewContext || (data.v4ReviewContext.verificationReady && data.v4ReviewContext.verificationPlanHash && data.v4ReviewContext.verificationReceiptSignature));
  const evidence = data.draft.products.flatMap(p => {
    const entry = (targetType: RubricItem["contentAnchors"][number]["targetType"], targetId: string, label: string) =>
      ({ id: JSON.stringify([targetType, targetId]), label, value: { targetType, targetId } });
    return [entry("document", p.id, p.title ?? p.id),
      ...(p.sections ?? []).map(s => entry("section", s.id, s.title)),
      ...[...(p.blocks ?? []), ...(p.sections ?? []).flatMap(s => s.blocks)].map(b => entry("block", b.id, b.title ?? b.id)),
      ...(p.visuals ?? []).map(v => entry("visual", v.id, v.id))];
  });
  const submit = (decision: string, label: string) => decide(label, {
    decision, expectedRevision: data.bundle.checksum, reason: note.trim() || undefined,
    ...(data.context ? { policyVersion: data.context.policyVersion, contentFingerprint: data.context.contentFingerprint, criteria, sectionDecisions: sections } : {}),
    ...(data.v4ReviewContext ? { verificationPlanHash: data.v4ReviewContext.verificationPlanHash ?? undefined,
      verificationReceiptSignature: data.v4ReviewContext.verificationReceiptSignature ?? undefined } : {}),
  });
  return <View style={layout.group}>
    {data.context ? <>
      <Picker label="Kriteria" options={PEDAGOGIC_CRITERION_IDS.map(id => ({ id, label: criterionLabels[id] }))} selected={selected}
        onSelect={id => { const next = PEDAGOGIC_CRITERION_IDS.find(item => item === id); if (next) setSelected(next); }} />
      <Picker label="Penilaian" options={[...decisions]} selected={current.status ?? ""}
        onSelect={id => change({ status: decisions.find(d => d.id === id)?.id })} />
      <Picker label="Bukti konten" options={evidence} selected={current.contentAnchors?.[0] ? JSON.stringify([current.contentAnchors[0].targetType,current.contentAnchors[0].targetId]) : ""}
        onSelect={id => { const found = evidence.find(e => e.id === id); if (found) change({ contentAnchors: [found.value, ...(current.contentAnchors?.slice(1) ?? []).filter(a => a.targetType !== found.value.targetType || a.targetId !== found.value.targetId)] }); }} />
      <Field label="Alasan penilaian" value={current.reason ?? ""} onChangeText={reason => change({ reason })} multiline />
      <Ink kind="meta">{`${criteria.length}/${PEDAGOGIC_CRITERION_IDS.length} kriteria · ${sections.length}/${data.context.sections.length} bagian`}</Ink>
    </> : null}
    <Field label="Catatan keputusan" value={note} onChangeText={setNote} maxLength={4000} multiline />
    <View style={layout.row}>
      <Action label="Setujui bundle" disabled={busy || !approve} onPress={() => submit("approved","Setujui bundle")} />
      {data.context ? <Action label="Minta revisi" disabled={busy || !complete || !note.trim()} onPress={() => submit("changes_requested","Minta revisi")} /> : null}
      <Action label="Tolak bundle" disabled={busy || !complete || !note.trim()} onPress={() => submit("rejected","Tolak bundle")} />
    </View>
  </View>;
}
