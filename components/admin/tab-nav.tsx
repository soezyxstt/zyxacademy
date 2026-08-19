"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
}

export function AdminTabNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  return (
    <div className="border-b border-border mb-6">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "pb-3 text-body-xs font-medium transition-colors border-b-2 relative -mb-[2px]",
                isActive
                  ? "border-brand-primary text-brand-primary font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
