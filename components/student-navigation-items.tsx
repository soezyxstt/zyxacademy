"use client";
import type { ElementType, ReactNode } from "react";
import { NavItem } from "@/components/sidebar-shell";
export type StudentNavigationItem = { href: string; icon: ElementType; label: string; active?: boolean; badge?: ReactNode };
export function StudentNavigationItems({ items, collapsed }: { items: StudentNavigationItem[]; collapsed: boolean }) {
  return <>{items.map((item) => <NavItem key={item.href} {...item} collapsed={collapsed} />)}</>;
}
