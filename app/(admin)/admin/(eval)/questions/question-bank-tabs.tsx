"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/tabs";

const ToolbarTarget = createContext<HTMLElement | null>(null);

export function QuestionBankToolbar({ children }: { children: ReactNode }) {
  const target = useContext(ToolbarTarget);
  return target ? createPortal(children, target) : null;
}

export function QuestionBankTabs({ value, tabs, children }: { value: string; tabs: ReactNode; children: ReactNode }) {
  const router = useRouter();
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return <Tabs value={value} syncUrl={false} className="w-full space-y-4" onValueChange={(tab) => {
    const url = new URL(window.location.href);
    if (tab === "ai-generated") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    router.push(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }}>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {tabs}
      <div ref={setTarget} className="flex min-w-[140px] flex-1 flex-wrap items-center gap-2" />
    </div>
    <ToolbarTarget.Provider value={target}>{children}</ToolbarTarget.Provider>
  </Tabs>;
}
