"use client";

import { useState } from "react";
import {
  BarChart3,
  Eye,
  FileText,
  Layers,
  Settings,
  Shield,
  Sliders,
} from "lucide-react";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { MobileNavbar } from "@/components/mobile-navbar";
import { CommandMenuProvider } from "@/components/command-menu";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "editor", label: "Question Editor", icon: FileText },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "settings", label: "Settings", icon: Sliders },
  { value: "responses", label: "Responses", icon: BarChart3, count: 12 },
  { value: "sections", label: "Sections", icon: Layers },
  { value: "security", label: "Security", icon: Shield },
  { value: "advanced", label: "Advanced", icon: Settings },
] as const;

export function StickyTabsFixture() {
  const [active, setActive] = useState<string>("editor");

  return (
    <CommandMenuProvider>
      <ApplicationShell
        showOrnaments={false}
        mobileNavigation={<MobileNavbar surface="admin" />}
        sidebar={
          <aside className="hidden w-60 shrink-0 border-r border-border bg-card p-4 md:block">
            <p className="font-heading text-body-sm font-semibold text-foreground">Zyx Academy</p>
            <p className="mt-1 text-body-xs text-muted-foreground">Sidebar navigation</p>
          </aside>
        }
      >
        <ApplicationPage className="flex flex-col items-start">
          <PageHeader title="Form Studio" />
          <Tabs value={active} onValueChange={setActive} syncUrl={false}>
            <TabsList aria-label="Form studio sections">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span>{tab.label}</span>
                    {"count" in tab && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-body-2xs font-semibold tabular-nums text-foreground">
                        {tab.count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {TABS.map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="space-y-4">
                <div className="border-b border-border pb-3">
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    {tab.label}
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {Array.from({ length: 18 }, (_, i) => (
                    <div key={i} className="py-4 text-body-sm text-muted-foreground">
                      {tab.label} item {i + 1}
                    </div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </ApplicationPage>
      </ApplicationShell>
    </CommandMenuProvider>
  );
}
