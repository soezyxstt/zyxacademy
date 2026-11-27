import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { applyProductFields, authoredElsewhere, productDraftFields } from "./product-draft-fields";
import type { ProductReviewData } from "./product-review-client";
import { Action, Field, Ink, layout, Picker } from "./ui";

export function ProductDraftEditor({ data, id, save, dirty, busy }: { data: ProductReviewData; id: string; busy: boolean;
  save(body: object): void; dirty(value: boolean): void }) {
  const original = data.draft.products.find(p => p.id === id)!;
  const fields = useMemo(() => productDraftFields(original), [original]);
  const [values, setValues] = useState<Record<string,string>>({});
  const [fieldKey, setFieldKey] = useState("");
  const field = fields.find(f => f.key === fieldKey) ?? fields[0];
  const revised = useMemo(() => applyProductFields(original, values), [original,values]);
  const changed = Object.entries(values).some(([key,value]) => {
    const f = fields.find(entry => entry.key === key); return f && String(f.value) !== value;
  });
  useEffect(() => dirty(changed), [changed, dirty]);
  if (authoredElsewhere(original)) return <Ink>Konten terstruktur ini direvisi melalui alur authoring V4.</Ink>;
  if (!field) return null;
  const raw = values[field.key] ?? String(field.value);
  const set = (val: string) => setValues(prev => ({ ...prev, [field.key]: val }));
  const options = field.choices ?? (typeof field.value === "boolean" ? [{ id: "true", label: "Benar" },{ id: "false", label: "Salah" }] : null);
  const weights = fields.filter(f => f.numeric);
  return <View style={layout.group}>
    <Picker label="Bidang" options={fields.map(f => ({ id: f.key, label: f.label }))} selected={field.key} onSelect={setFieldKey} disabled={busy} />
    {options ? <Picker label={field.label} options={options} selected={raw} onSelect={set} disabled={busy} />
      : <Field label={field.label} value={raw} onChangeText={set} editable={!busy} multiline={!field.numeric}
        keyboardType={field.numeric ? "decimal-pad" : "default"} />}
    {field.numeric && weights.length ? <Action label="Ratakan bobot Idea" disabled={busy}
      onPress={() => setValues(prev => ({ ...prev, ...Object.fromEntries(weights.map(f => [f.key, String(1 / weights.length)])) }))} /> : null}
    {!revised ? <Ink tone="error">Bobot harus lebih dari nol dan paling besar satu.</Ink> : null}
    <Action label="Simpan revisi" disabled={busy || !changed || !revised} onPress={() => {
      if (revised) save({ expectedRevision: data.bundle.checksum, draft: { products: data.draft.products.map(p => p.id === id ? revised : p) } });
    }} />
  </View>;
}
