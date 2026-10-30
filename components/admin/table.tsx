import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminTableProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className }: AdminTableProps) {
  return (
    <div className={cn("admin-table overflow-x-auto rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  );
}


export type AdminTableHeadProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableHead({ children, className }: AdminTableHeadProps) {
  return <thead className={cn("border-b border-border bg-muted/40", className)}>{children}</thead>;
}
