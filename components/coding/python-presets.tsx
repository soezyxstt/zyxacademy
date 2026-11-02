"use client";
import { Bug, GitBranch, ListTree, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const pythonPresets = [
  { intent: "review", label: "Jelaskan kode", icon: MessageSquare, message: "Jelaskan logika kode Python saya langkah demi langkah." },
  { intent: "flowchart", label: "Flowchart", icon: GitBranch, message: "Buat flowchart dari logika kode Python saya." },
  { intent: "decompose", label: "Pecah masalah", icon: ListTree, message: "Bantu dekomposisi masalah Python ini menjadi langkah kecil." },
  { intent: "explain_error", label: "Jelaskan error", icon: Bug, message: "Jelaskan penyebab error pada hasil eksekusi kode Python saya dan beri petunjuk perbaikannya." },
] as const;
export type PythonPreset = typeof pythonPresets[number];
export function PythonPresets({ code, hasError, disabled, onSelect }: { code: string; hasError: boolean; disabled?: boolean; onSelect: (preset: PythonPreset) => void }) {
  return <div role="toolbar" aria-label="Bantuan Python" className="flex flex-wrap items-center gap-1"><TooltipProvider>
    {pythonPresets.map(preset => <Tooltip key={preset.intent}><TooltipTrigger asChild>
      <Button type="button" size="sm" variant={preset.intent === "explain_error" && hasError ? "destructive" : "ghost"} className="h-7 gap-1 px-2 text-body-sm" disabled={disabled || (preset.intent === "explain_error" ? !hasError : preset.intent !== "decompose" && !code.trim())} onClick={() => onSelect(preset)} aria-label={preset.label}>
        <preset.icon className="size-3.5" /><span>{preset.label}</span>
      </Button>
    </TooltipTrigger><TooltipContent>{preset.label}</TooltipContent></Tooltip>)}
  </TooltipProvider></div>;
}
