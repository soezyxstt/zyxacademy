"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  ExternalLink,
  BookOpen,
  Database,
  Compass,
  FileText,
} from "lucide-react";
import type {
  OpsAiCitation,
  OpsAiProvenanceSource,
} from "@/lib/admin-ops-ai/contracts";
import {
  OPS_AI_CITATION_OFFICIAL_LABEL,
  OPS_AI_CITATION_OFFICIAL_DISCLAIMER,
} from "@/lib/admin-ops-ai/citations";
import { cn } from "@/lib/utils";

interface CitationCardsProps {
  citations?: OpsAiCitation[];
}

function getProvenanceLabel(source: OpsAiProvenanceSource) {
  switch (source) {
    case "semantic-rag":
      return "Basis Pengetahuan";
    case "database-read":
      return "Basis Data";
    case "live-tool":
      return "Navigasi";
    default:
      return "Dokumentasi";
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
    <div className="text-body-xs font-sans text-muted-foreground my-2 select-text">
      {/* Collapsible toggle header (Cloudflare style: > Sumber referensi) */}
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label={`Buka atau tutup daftar sumber referensi (${citations.length} sumber)`}
        className="group flex items-start text-left gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer py-0.5 focus-visible:outline-none w-full"
      >
        {isExpanded ? (
          <ChevronDown className="size-3 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground group-hover:text-foreground transition-colors mt-0.5 shrink-0" />
        )}

        <span className="font-heading text-body-xs font-bold text-foreground block leading-snug break-words">
          {OPS_AI_CITATION_OFFICIAL_LABEL} ({citations.length} referensi)
        </span>
      </button>

      {/* Expanded list with clean -> arrow items */}
      {isExpanded && (
        <div className="mt-1.5 pl-2 border-l border-border/50 space-y-2 text-[11px]">
          <p className="text-[10px] text-muted-foreground/80 italic leading-snug">
            {OPS_AI_CITATION_OFFICIAL_DISCLAIMER}
          </p>

          <div className="space-y-1.5 pt-0.5">
            {citations.map((cite) => {
              const provLabel = getProvenanceLabel(cite.source);
              const snippetOpen = expandedSnippets[cite.id];

              return (
                <div key={cite.id} className="space-y-0.5">
                  <div className="flex items-start gap-1.5">
                    <span className="text-muted-foreground select-none">→</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-foreground/90">
                          {cite.title}
                        </span>

                        <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1 py-0.2 rounded-sm">
                          {provLabel}
                        </span>

                        {cite.filePath && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {cite.filePath}
                          </span>
                        )}

                        {cite.section && (
                          <span className="text-[10px] text-muted-foreground">
                            › {cite.section}
                          </span>
                        )}

                        {typeof cite.score === "number" && (
                          <span className="text-[10px] font-mono text-muted-foreground/70">
                            ({Math.round(cite.score * 100)}%)
                          </span>
                        )}
                      </div>

                      {/* Excerpt */}
                      {cite.snippet && (
                        <div className="mt-1 pl-1 text-[11px] text-muted-foreground/90 font-sans leading-relaxed">
                          <p className={cn("bg-muted/30 p-1.5 rounded-md border border-border/30", !snippetOpen && "line-clamp-2")}>
                            {cite.snippet}
                          </p>
                          {cite.snippet.length > 120 && (
                            <button
                              type="button"
                              onClick={() => toggleSnippet(cite.id)}
                              className="mt-0.5 text-[10px] text-primary hover:underline cursor-pointer"
                            >
                              {snippetOpen ? "Perkecil kutipan" : "Lihat kutipan lengkap"}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Live link if specific navigation target */}
                      {cite.source === "live-tool" && cite.url && cite.url !== "/admin" && (
                        <div className="mt-0.5">
                          <a
                            href={cite.url}
                            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline font-medium"
                          >
                            <span>Buka halaman: {cite.url}</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
