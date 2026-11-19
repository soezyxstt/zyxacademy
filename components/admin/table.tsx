import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminTableProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className }: AdminTableProps) {
  return (
    <div
      className={cn(
        "admin-table overflow-x-auto border-y border-border/40 divide-border/30 [&_table]:w-full [&_tbody]:divide-y [&_tbody]:divide-border/30 [&_tbody_tr]:border-border/30 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/35",
        className,
      )}
    >
      {children}
    </div>
  );
}


export type AdminTableHeadProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableHead({ children, className }: AdminTableHeadProps) {
  return (
    <thead
      className={cn(
        "border-b border-border/40 bg-muted/30 [&_th]:text-body-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground",
        className,
      )}
    >
      {children}
    </thead>
  );
}
