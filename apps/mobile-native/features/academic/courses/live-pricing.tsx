import { useState } from "react";
import { parseCoursePricingInput } from "../../../../../packages/academic/course-pricing";
import { displayWib, formatWib } from "./course-pricing-fields";
import { Field, Ink, Picker } from "./ui";

const pricingOptions = [
  { id: "premium", label: "Premium" }, { id: "free", label: "Gratis" }, { id: "limited_time_free", label: "Gratis sementara" },
] as const;

type StoredPricing = { category: string; startsAt: string | null; endsAt: string | null };

export function useCoursePricingFields(initial?: StoredPricing) {
  const [access, setAccess] = useState(initial?.category ?? "premium");
  const [start, setStart] = useState(() => displayWib(initial?.startsAt ? new Date(initial.startsAt) : null));
  const [end, setEnd] = useState(() => displayWib(initial?.endsAt ? new Date(initial.endsAt) : null));
  function serialize() {
    const bound = (field: string, original?: string | null) =>
      original && displayWib(new Date(original)) === field ? original : formatWib(field);
    const value = parseCoursePricingInput({ category: access, startsAt: bound(start, initial?.startsAt), endsAt: bound(end, initial?.endsAt) });
    if (access === "limited_time_free" && (displayWib(value.startsAt) !== start || displayWib(value.endsAt) !== end)) {
      throw new Error("Invalid WIB date");
    }
    return { category: value.category, startsAt: value.startsAt?.toISOString() ?? null, endsAt: value.endsAt?.toISOString() ?? null };
  }
  return { access, start, end, setAccess, setStart, setEnd, serialize };
}

export function CoursePricingFields({ pricing, disabled, onChange }: {
  pricing: ReturnType<typeof useCoursePricingFields>; disabled: boolean; onChange(): void;
}) {
  return <>
    <Picker label="Akses mata kuliah" selected={pricing.access} disabled={disabled} options={pricingOptions}
      onSelect={value => { pricing.setAccess(value); onChange(); }} testID="course-field-access" />
    {pricing.access === "limited_time_free" && <>
      <Ink kind="meta" tone="muted">Gunakan format YYYY-MM-DD JJ:MM dalam WIB.</Ink>
      <Field label="Mulai gratis" value={pricing.start} disabled={disabled} onChangeText={value => { pricing.setStart(value); onChange(); }} />
      <Field label="Akhir gratis" value={pricing.end} disabled={disabled} onChangeText={value => { pricing.setEnd(value); onChange(); }} />
    </>}
  </>;
}
