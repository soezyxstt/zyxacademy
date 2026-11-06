"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

export function QuestionBankTabs({ value, children }: { value: string; children: ReactNode }) {
  const router = useRouter();
  return <Tabs value={value} syncUrl={false} className="w-full space-y-4" onValueChange={(tab) => {
    const url = new URL(window.location.href);
    if (tab === "ai-generated") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    router.push(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }}>{children}</Tabs>;
}
