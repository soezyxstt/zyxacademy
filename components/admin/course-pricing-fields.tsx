"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatJakartaDatetimeLocal, parseJakartaDatetimeLocal } from "@/lib/date-utils";
import { validateCoursePricing, type CoursePricing, type CoursePricingCategory } from "@/lib/student/course-pricing";

export function pricingCategoryLabel(pricing?: CoursePricing) { return pricing?.category === "free" ? "Free" : pricing?.category === "limited_time_free" ? "Limited Time Free" : "Premium"; }

export type PricingFields = { category: CoursePricingCategory; start: string; end: string };
export function pricingFields(pricing?: CoursePricing): PricingFields {
  return { category: pricing?.category ?? "premium", start: pricing?.startsAt ? formatJakartaDatetimeLocal(new Date(pricing.startsAt.valueOf())) : "", end: pricing?.endsAt ? formatJakartaDatetimeLocal(new Date(pricing.endsAt.valueOf())) : "" };
}
export function pricingFromFields(value: PricingFields): CoursePricing {
  return validateCoursePricing({ category: value.category, startsAt: value.category === "limited_time_free" ? parseJakartaDatetimeLocal(value.start) : null, endsAt: value.category === "limited_time_free" ? parseJakartaDatetimeLocal(value.end) : null });
}
export function CoursePricingFields({ value, onChange, disabled, id }: { value: PricingFields; onChange: (value: PricingFields) => void; disabled?: boolean; id: string }) {
  return <div className="space-y-2">
    <Label htmlFor={`${id}-pricing`} className="text-body-sm font-semibold">Kategori akses</Label>
    <Select value={value.category} onValueChange={(category) => onChange({ category: category as CoursePricingCategory, start: "", end: "" })} disabled={disabled}>
      <SelectTrigger id={`${id}-pricing`} className="rounded-lg text-body-sm"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="free">Free</SelectItem><SelectItem value="limited_time_free">Limited Time Free</SelectItem><SelectItem value="premium">Premium</SelectItem></SelectContent>
    </Select>
    {value.category === "limited_time_free" && <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`${id}-start`}>Mulai (WIB)</Label><Input id={`${id}-start`} type="datetime-local" required value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value })} disabled={disabled} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-end`}>Berakhir (WIB)</Label><Input id={`${id}-end`} type="datetime-local" required value={value.end} onChange={(e) => onChange({ ...value, end: e.target.value })} disabled={disabled} /></div>
    </div>}
  </div>;
}
