"use client";

import type { ReactNode } from "react";
import { Bell, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useViewportMode } from "@/hooks/use-viewport-mode";

interface NotificationsLayoutProps {
  composeLabel: string;
  historyLabel: string;
  composeContent: ReactNode;
  historyContent: ReactNode;
}

export function NotificationsLayout({
  composeLabel,
  historyLabel,
  composeContent,
  historyContent,
}: NotificationsLayoutProps) {
  const viewportMode = useViewportMode();

  if (viewportMode === "mobile") {
    return (
      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">{composeLabel}</TabsTrigger>
          <TabsTrigger value="history">{historyLabel}</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="max-w-3xl">
          {composeContent}
        </TabsContent>

        <TabsContent value="history">
          {historyContent}
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <>
      <section className="max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-body-base font-semibold text-foreground">
            {composeLabel}
          </h2>
        </div>
        {composeContent}
      </section>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-body-base font-semibold text-foreground">
            {historyLabel}
          </h2>
        </div>
        {historyContent}
      </div>
    </>
  );
}
