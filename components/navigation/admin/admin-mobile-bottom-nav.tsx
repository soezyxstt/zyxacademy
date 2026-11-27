"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Users,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { AdminMoreSheet } from "./admin-more-sheet";
import {
  adminMobileHrefs,
  getActiveAdminBottomTab,
  isAdminFocusEditorRoute,
} from "./admin-nav-model";

export function AdminMobileBottomNav() {
  const pathname = usePathname();
  const viewportMode = useViewportMode();
  const tMobile = useTranslations("admin.mobile");

  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const activeTab = getActiveAdminBottomTab(pathname);
  const isFocusEditor = isAdminFocusEditorRoute(pathname);

  const items = useMemo<MobileBottomNavItem[]>(
    () => [
      {
        id: "home",
        label: tMobile("home"),
        icon: LayoutDashboard,
        href: adminMobileHrefs.home,
        active: activeTab === "home",
      },
      {
        id: "courses",
        label: tMobile("courses"),
        icon: GraduationCap,
        href: adminMobileHrefs.courses,
        active: activeTab === "courses",
      },
      {
        id: "people",
        label: tMobile("people"),
        icon: Users,
        href: adminMobileHrefs.people,
        active: activeTab === "people",
      },
      {
        id: "ops",
        label: tMobile("ops"),
        icon: Gauge,
        href: adminMobileHrefs.ops,
        active: activeTab === "ops",
      },
      {
        id: "more",
        label: tMobile("more"),
        icon: LayoutGrid,
        onClick: () => setMoreSheetOpen(true),
        active: activeTab === "more" || moreSheetOpen,
      },
    ],
    [activeTab, moreSheetOpen, tMobile]
  );

  if (viewportMode === "desktop") {
    return null;
  }

  return (
    <>
      <MobileBottomNav
        items={items}
        ariaLabel={tMobile("bottomNavLabel")}
        hidden={isFocusEditor}
      />

      <AdminMoreSheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen} />
    </>
  );
}
