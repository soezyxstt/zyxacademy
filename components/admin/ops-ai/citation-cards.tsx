"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, ExternalLink, FileText } from "lucide-react";
import type { OpsAiCitation, OpsAiCitationAvailability } from "@/lib/admin-ops-ai/contracts";
import {
  OPS_AI_CITATION_OFFICIAL_LABEL,
  OPS_AI_CITATION_OFFICIAL_DISCLAIMER,
} from "@/lib/admin-ops-ai/citations";
import { cn } from "@/lib/utils";

interface CitationCardsProps {
  citations?: OpsAiCitation[];
}

function getAvailabilityBadge(availability: OpsAiCitationAvailability) {
  switch (availability) {
    case "available":
      return {
        label: "Tersedia",
        badgeClass: "bg-status-success/15 text-status-success border-status-success/30",
      };
    case "stale":
      return {
        label: "Perlu Pembaruan",
        badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      };
    case "missing":
      return {
        label: "Tidak Ditemukan",
        badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
      };
    case "invalid":
      return {
        label: "Tidak Valid",
        badgeClass: "bg-destructive/15 text-destructive border-destructive/30",
      };
    default:
      return {
        label: availability,
        badgeClass: "bg-muted text-muted-foreground border-border/60",
      };
  }
}

export function CitationCards({ citations }: CitationCardsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState<Record<string, boolean>>({});

  if (!citations || citations.length === 0) {
    return null;
  }

  const toggleSnippet = (id: string) => {
    setExpandedSnippets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card/50 p-2.5 shadow-xs">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label={`Buka atau tutup daftar sumber referensi (${citations.length} sumber)`}
        className="flex w-full items-start sm:items-center justify-between gap-2 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
      >
        <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted text-foreground shrink-0 mt-0.5 sm:mt-0">
            <BookOpen className="size-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-heading text-body-xs font-bold text-foreground block leading-snug break-words">
              {OPS_AI_CITATION_OFFICIAL_LABEL}
            </span>
            <span className="text-[11px] text-muted-foreground block leading-tight mt-0.5">
              {citations.length} dokumen konteks terverifikasi
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mt-0.5 sm:mt-0">
          <span className="rounded-md border border-border/80 bg-muted/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {citations.length} referensi
          </span>
          {isExpanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-2.5 space-y-2 border-t border-border/50 pt-2.5">
          <p className="text-[11px] text-muted-foreground italic leading-tight">
            {OPS_AI_CITATION_OFFICIAL_DISCLAIMER}
          </p>

          <div className="space-y-2 pt-1">
            {citations.map((cite) => {
              const badge = getAvailabilityBadge(cite.availability);
              const snippetOpen = expandedSnippets[cite.id];

              return (
                <div
                  key={cite.id}
                  className="rounded-md border border-border/60 bg-background/90 p-2.5 text-body-xs space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{cite.title}</span>
                      </div>
                      {(cite.filePath || cite.section) && (
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                          {cite.filePath ? cite.filePath : ""}
                          {cite.filePath && cite.section ? " : " : ""}
                          {cite.section ? cite.section : ""}
                        </p>
                      )}
                    </div>

                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.2 text-[10px] font-semibold leading-tight",
                        badge.badgeClass
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {cite.snippet && (
                    <div className="pt-1">
                      <p
                        className={cn(
                          "text-[11px] text-muted-foreground bg-muted/40 rounded-md p-1.5 border border-border/40 font-mono leading-relaxed",
                          !snippetOpen && "line-clamp-2"
                        )}
                      >
                        {cite.snippet}
                      </p>
                      {cite.snippet.length > 120 && (
                        <button
                          type="button"
                          onClick={() => toggleSnippet(cite.id)}
                          className="mt-1 text-[10px] font-medium text-primary hover:underline cursor-pointer"
                        >
                          {snippetOpen ? "Perkecil cuplikan" : "Lihat cuplikan lengkap"}
                        </button>
                      )}
                    </div>
                  )}

                  {cite.url && (
                    <div className="pt-0.5">
                      <a
                        href={cite.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium"
                      >
                        <span>Buka tautan referensi</span>
                        <ExternalLink className="size-2.5" />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
