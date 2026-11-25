"use client";

import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bell,
  Calculator,
  CalendarDays,
  FileText,
  Flag,
  GraduationCap,
  Image,
  KeyRound,
  Library,
  LineChart,
  Link as LinkIcon,
  MousePointerClick,
  Newspaper,
  Trophy,
  Video,
  Zap,
} from "lucide-react";
import { LayoutDashboard } from "lucide-react";
import { ALL_ADMIN_TABS } from "@/lib/admin-navigation";
import type { AdminHomeIconKey } from "@/features/admin-home/model/types";

const ADMIN_HOME_ICON_MAP: Record<string, LucideIcon> = {
  "graduation-cap": GraduationCap,
  "calendar-days": CalendarDays,
  library: Library,
  trophy: Trophy,
  zap: Zap,
  calculator: Calculator,
  newspaper: Newspaper,
  "file-text": FileText,
  video: Video,
  image: Image,
  link: LinkIcon,
  "key-round": KeyRound,
  bell: Bell,
  activity: Activity,
  flag: Flag,
  "line-chart": LineChart,
  "mouse-pointer-click": MousePointerClick,
};

export function AdminHomeItemIcon({
  iconKey,
  className,
}: {
  iconKey: AdminHomeIconKey;
  className?: string;
}) {
  const Icon =
    ADMIN_HOME_ICON_MAP[iconKey] ??
    (ALL_ADMIN_TABS.find((tab) => tab.id === iconKey)?.icon as LucideIcon | undefined) ??
    LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}
