import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminTableProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTable({ children, className }: AdminTableProps) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card shadow-sm", className)}>
      {children}
    </div>
  );
}


export type AdminTableHeadProps = {
  children: ReactNode;
  className?: string;
};

export function AdminTableHead({ children, className }: AdminTableHeadProps) {
  return <thead className={cn("bg-muted/50 border-b border-border", className)}>{children}</thead>;
}
