"use client";

import { BrainCircuit, Target } from "lucide-react";
import { Tabs } from "radix-ui";
import { Badge, BetaBadge } from "@/components/ui/badge";
import { TabsTrigger } from "@/components/ui/tabs";
import { badgePosition, quizInsightsBadgeTabs, type BadgeCaseSpec, type BetaBadgeCaseSpec } from "@/packages/ui-parity/badge-cases";

const center = { ...badgePosition, display: "flex", alignItems: "center", justifyContent: "center" } as const;

export function BadgeCase({ item }: { item: BadgeCaseSpec }) {
  return (
    <div style={center}>
      <Badge data-parity-badge={item.id} variant={item.variant}>{item.label}</Badge>
    </div>
  );
}

export function BetaBadgeCase({ item }: { item: BetaBadgeCaseSpec }) {
  return (
    <div style={center}>
      <Tabs.Root defaultValue={item.selected}>
        <Tabs.List aria-label="Analisis kuis" className="flex items-stretch gap-0.5">
          {quizInsightsBadgeTabs.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="gap-2"
              data-parity-beta={value === "ai-insights" ? item.id : undefined}
            >
              {value === "ai-insights" ? <BrainCircuit className="size-4" aria-hidden /> : <Target className="size-4" aria-hidden />}
              <span>{label}</span>
              {value === "ai-insights" && <BetaBadge />}
            </TabsTrigger>
          ))}
        </Tabs.List>
        {quizInsightsBadgeTabs.map(({ value, label }) => (
          <Tabs.Content key={value} value={value} className="sr-only" aria-label={label} />
        ))}
      </Tabs.Root>
    </div>
  );
}
