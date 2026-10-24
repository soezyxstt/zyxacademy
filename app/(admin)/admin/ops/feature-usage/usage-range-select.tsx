"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "@/lib/i18n/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_OPTIONS = ["7", "30", "90"] as const;

export function UsageRangeSelect({ current }: { current: number }) {
  const t = useTranslations("adminOps");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "30") {
      params.delete("range");
    } else {
      params.set("range", value);
    }
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  return (
    <Select value={String(current)} onValueChange={onValueChange}>
      <SelectTrigger
        className="w-[170px] shrink-0 text-body-sm"
        aria-label={t("featureUsageUI.rangeLabel")}
        data-pending={pending || undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((value) => (
          <SelectItem key={value} value={value} className="text-body-sm">
            {t(`featureUsageUI.range${value}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
