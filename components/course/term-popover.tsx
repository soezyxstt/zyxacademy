"use client";

/**
 * EIF E3: interactive material popover. Given a selected concept term, shows
 * deterministic actions sourced from KO data via the E0 fabric (Quick Explain,
 * Analogy, Example, Common Mistake, Quiz Me), plus a mastery chip. The only
 * quota-spending action is "Tanya tutor", which calls back to the existing
 * tutor drawer. The first actions never call an LLM.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, BookOpen, Lightbulb, FlaskConical, TriangleAlert, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MathText } from "@/components/course/math-text";
import { ZyraMark } from "@/components/course/zyra-mark";
import { getConceptPopover, type ConceptPopoverData } from "@/lib/learning-context-actions";

type Tab = "explain" | "analogy" | "example" | "mistake";

const TREND_LABEL: Record<string, string> = {
  improving: "naik",
  stable: "stabil",
  declining: "turun",
};

export function TermPopover({
  courseId,
  conceptName,
  onAskTutor,
}: {
  courseId: string;
  conceptName: string;
  onAskTutor: () => void;
}) {
  const [data, setData] = useState<ConceptPopoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("explain");

  useEffect(() => {
    let active = true;
    getConceptPopover(courseId, conceptName)
      .then((res) => {
        if (active) setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [courseId, conceptName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-body-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Memuat konsep...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-body-sm text-muted-foreground">Konsep tidak ditemukan.</p>
        <Button size="sm" variant="outline" onClick={onAskTutor} className="gap-1.5">
          <ZyraMark className="size-3.5" /> Tanya Zyra
        </Button>
      </div>
    );
  }

  const tabs = ([
    { id: "explain", label: "Penjelasan", icon: BookOpen, available: !!data.quickExplain },
    { id: "analogy", label: "Analogi", icon: Lightbulb, available: !!data.analogy },
    { id: "example", label: "Contoh", icon: FlaskConical, available: !!data.example },
    { id: "mistake", label: "Kesalahan umum", icon: TriangleAlert, available: !!data.commonMistake },
  ] as Array<{ id: Tab; label: string; icon: typeof BookOpen; available: boolean }>).filter((t) => t.available);

  const activeTab = tabs.find((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <div className="w-80 max-w-[90vw] rounded-xl border border-border bg-popover shadow-md p-3 space-y-3">
      {/* Header: concept + mastery chip */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm font-semibold text-foreground"><MathText as="span">{data.conceptName}</MathText></span>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-body-sm text-muted-foreground tabular-nums">
          {data.mastery.score}
          {data.mastery.trend ? ` · ${TREND_LABEL[data.mastery.trend]}` : ""}
        </span>
      </div>

      {/* Action tabs */}
      {tabs.length > 0 && (
        <Tabs value={activeTab} onValueChange={(value) => setTab(value as Tab)} syncUrl={false}>
          <TabsList>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <TabsTrigger
                key={t.id}
                value={t.id}
                className="px-2 py-1"
              >
                <Icon className="size-3.5" />
                {t.label}
              </TabsTrigger>
            );
          })}
          </TabsList>
        </Tabs>
      )}

      {/* Active content (deterministic, from KO data) */}
      <div className="text-body-sm text-muted-foreground">
        {activeTab === "explain" && data.quickExplain && <MathText>{data.quickExplain.content}</MathText>}
        {activeTab === "analogy" && data.analogy && <MathText as="p">{data.analogy}</MathText>}
        {activeTab === "example" && data.example && <MathText>{data.example.content}</MathText>}
        {activeTab === "mistake" && data.commonMistake && <MathText>{data.commonMistake.content}</MathText>}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border pt-2">
        <Button size="sm" variant="outline" asChild className="gap-1.5">
          <Link href={`/courses/${courseId}/quiz`}>
            <ListChecks className="size-3.5" /> Uji aku
          </Link>
        </Button>
        <Button size="sm" variant="ghost" asChild className="gap-1.5">
          <Link href={data.reviewHref}>
            <BookOpen className="size-3.5" /> Tinjau
          </Link>
        </Button>
        <Button size="sm" variant="ghost" onClick={onAskTutor} className="ml-auto gap-1.5">
          <ZyraMark className="size-3.5" /> Tanya Zyra
        </Button>
      </div>
    </div>
  );
}
