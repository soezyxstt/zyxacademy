"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PEDAGOGIC_CRITERION_IDS } from "@/lib/materials/quality-policy-constants";
import type { PedagogicRubricItem } from "@/lib/materials/quality-policy";

export type ProductV4AdminReviewContext = {
  expectedRevision: string; policyVersion: string; contentFingerprint: string;
  verificationReady: boolean; verificationPlanHash: string | null; verificationReceiptSignature: string | null;
  sections: { sectionId: string; semanticHash: string; title: string }[];
};
type CriterionDraft = { status?: PedagogicRubricItem["status"]; reason?: string; sectionId?: string };
export type ProductV4AdminReviewDraft = { approvedSectionIds: string[]; criteria: Partial<Record<typeof PEDAGOGIC_CRITERION_IDS[number], CriterionDraft>> };
export type ProductV4AdminReviewInput = ReturnType<typeof buildProductV4AdminReviewInput>;

export function buildProductV4AdminReviewInput(context: ProductV4AdminReviewContext, draft: ProductV4AdminReviewDraft) {
  const sectionDecisions = context.sections.filter((section) => draft.approvedSectionIds.includes(section.sectionId)).map((section) => ({ sectionId: section.sectionId, semanticHash: section.semanticHash, decision: "approved" as const }));
  const criteria: PedagogicRubricItem[] = PEDAGOGIC_CRITERION_IDS.flatMap((criterionId) => {
    const item = draft.criteria[criterionId];
    return item?.status && item.reason?.trim() && context.sections.some((section) => section.sectionId === item.sectionId)
      ? [{ criterionId, status: item.status, reason: item.reason.trim(), contentAnchors: [{ targetType: "section" as const, targetId: item.sectionId! }] }] : [];
  });
  return {
    ready: context.verificationReady && Boolean(context.verificationPlanHash && context.verificationReceiptSignature) && context.sections.length > 0 && sectionDecisions.length === context.sections.length && criteria.length === PEDAGOGIC_CRITERION_IDS.length && criteria.every((criterion) => criterion.status === "met"),
    request: { expectedRevision: context.expectedRevision, policyVersion: context.policyVersion, contentFingerprint: context.contentFingerprint, verificationPlanHash: context.verificationPlanHash ?? undefined, verificationReceiptSignature: context.verificationReceiptSignature ?? undefined, sectionDecisions: sectionDecisions.length ? sectionDecisions : undefined, criteria: criteria.length === PEDAGOGIC_CRITERION_IDS.length ? criteria : [] },
  };
}

const criterionLabels: Record<typeof PEDAGOGIC_CRITERION_IDS[number], string> = {
  concept_accuracy: "Ketepatan konsep", prerequisite_completeness: "Kelengkapan prasyarat", explanation_sequence: "Urutan penjelasan", symbol_and_condition_clarity: "Simbol dan syarat", example_reasoning: "Alasan pada contoh", representation_or_visual: "Representasi dan visual", misconceptions_and_limits: "Miskonsepsi dan batasan", formative_check_and_explanation: "Cek pemahaman dan pembahasan",
};

export function ProductV4ReviewForm({ context, onChange }: { context: ProductV4AdminReviewContext; onChange: (input: ProductV4AdminReviewInput) => void }) {
  const [draft, setDraft] = useState<ProductV4AdminReviewDraft>({ approvedSectionIds: [], criteria: {} });
  useEffect(() => { onChange(buildProductV4AdminReviewInput(context, draft)); }, [context, draft, onChange]);
  function update(criterionId: typeof PEDAGOGIC_CRITERION_IDS[number], patch: CriterionDraft) {
    setDraft((current) => ({ ...current, criteria: { ...current.criteria, [criterionId]: { ...current.criteria[criterionId], ...patch } } }));
  }
  return <section className="space-y-4 border-t border-border pt-4" aria-label="Review pedagogi V4">
    <h3 className="font-heading text-body-base font-bold">Review pedagogi</h3>
    <p className="text-body-sm text-muted-foreground">Persetujuan memerlukan seluruh bagian dan 8 kriteria terpenuhi.</p>
    {!context.verificationReady ? <p role="status" className="text-body-sm text-status-warning">Verifikasi revisi ini belum lengkap. Persetujuan menunggu seluruh pemeriksaan selesai.</p> : null}
    <fieldset className="space-y-3"><legend className="mb-2 text-body-sm font-semibold">Keputusan per bagian</legend>{context.sections.map((section) => <div key={section.sectionId} className="flex items-start gap-2">
      <Checkbox id={`review-section-${section.sectionId}`} checked={draft.approvedSectionIds.includes(section.sectionId)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, approvedSectionIds: checked === true ? [...current.approvedSectionIds, section.sectionId] : current.approvedSectionIds.filter((id) => id !== section.sectionId) }))} />
      <Label htmlFor={`review-section-${section.sectionId}`} className="text-body-sm font-normal">Setujui bagian {section.title}</Label>
    </div>)}</fieldset>
    <div className="divide-y divide-border">{PEDAGOGIC_CRITERION_IDS.map((criterionId) => <fieldset key={criterionId} className="space-y-2 py-3">
      <legend className="text-body-sm font-semibold">{criterionLabels[criterionId]}</legend>
      <div className="flex flex-wrap gap-2">
        <Select value={draft.criteria[criterionId]?.status ?? ""} onValueChange={(status) => update(criterionId, { status: status as PedagogicRubricItem["status"] })}><SelectTrigger className="w-44 text-body-sm" aria-label={`Penilaian ${criterionLabels[criterionId]}`}><SelectValue placeholder="Pilih penilaian" /></SelectTrigger><SelectContent><SelectItem value="met">Terpenuhi</SelectItem><SelectItem value="needs_revision">Perlu revisi</SelectItem><SelectItem value="not_met">Belum terpenuhi</SelectItem></SelectContent></Select>
        <Select value={draft.criteria[criterionId]?.sectionId ?? ""} onValueChange={(sectionId) => update(criterionId, { sectionId })}><SelectTrigger className="min-w-36 flex-1 text-body-sm" aria-label={`Bukti ${criterionLabels[criterionId]}`}><SelectValue placeholder="Pilih bagian bukti" /></SelectTrigger><SelectContent>{context.sections.map((section) => <SelectItem key={section.sectionId} value={section.sectionId}>{section.title}</SelectItem>)}</SelectContent></Select>
      </div>
      <Textarea aria-label={`Alasan ${criterionLabels[criterionId]}`} value={draft.criteria[criterionId]?.reason ?? ""} onChange={(event) => update(criterionId, { reason: event.target.value })} placeholder="Alasan penilaian berdasarkan isi bagian" className="min-h-16 text-body-sm" />
    </fieldset>)}</div>
  </section>;
}
