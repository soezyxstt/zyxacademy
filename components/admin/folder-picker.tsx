"use client";

import { useMemo } from "react";
import { Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MediaTreeNode } from "@/lib/media";

export type FlatFolder = { path: string; label: string; depth: number };

export function flattenTree(nodes: MediaTreeNode[], depth = 0, acc: FlatFolder[] = []): FlatFolder[] {
  for (const node of nodes) {
    acc.push({ path: node.path, label: node.name, depth });
    if (node.children.length) flattenTree(node.children, depth + 1, acc);
  }
  return acc;
}

export function FolderPicker({
  folders,
  value,
  onSelect,
  disabled = new Set<string>(),
  rootLabel = "Media (root)",
}: {
  folders: FlatFolder[];
  value: string;
  onSelect: (path: string) => void;
  disabled?: Set<string>;
  rootLabel?: string;
}) {
  const options = useMemo(() => [{ path: "", label: rootLabel, depth: 0 }, ...folders], [folders, rootLabel]);
  return (
    <div className="border-border bg-background max-h-64 overflow-auto rounded-lg border p-1">
      {options.map((option) => {
        const isDisabled = disabled.has(option.path);
        return (
          <button
            key={option.path || "root"}
            type="button"
            disabled={isDisabled}
            onClick={() => onSelect(option.path)}
            style={{ paddingLeft: `${8 + option.depth * 16}px` }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-body-sm transition-colors",
              isDisabled && "cursor-not-allowed opacity-40",
              !isDisabled && value === option.path && "bg-brand-primary/10 font-medium text-brand-primary",
              !isDisabled && value !== option.path && "text-foreground hover:bg-muted"
            )}
          >
            <Folder className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
