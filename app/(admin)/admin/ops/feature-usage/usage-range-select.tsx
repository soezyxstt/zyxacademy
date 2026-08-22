"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_OPTIONS = [
  { value: "7", label: "7 Hari Terakhir" },
  { value: "30", label: "30 Hari Terakhir" },
  { value: "90", label: "90 Hari Terakhir" },
];

export function UsageRangeSelect({ current }: { current: number }) {
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
        aria-label="Rentang waktu penggunaan fitur"
        data-pending={pending || undefined}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-body-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
