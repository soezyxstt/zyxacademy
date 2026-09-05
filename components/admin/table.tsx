import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminTableProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className }: AdminTableProps) {
  return (
    <div className={cn("admin-table overflow-x-auto rounded-xl border border-border/70 bg-card/75 backdrop-blur-md shadow-xs", className)}>
      {children}
    </div>
  );
}


export type AdminTableHeadProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableHead({ children, className }: AdminTableHeadProps) {
  return <thead className={cn("bg-muted/40 border-b border-border/70", className)}>{children}</thead>;
}
