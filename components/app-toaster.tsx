"use client";

import { useTranslations } from "next-intl";
import { useAppearancePreferences } from "@/components/appearance-preferences";
import { Toaster } from "@/components/ui/sonner";
import { useViewportMode } from "@/hooks/use-viewport-mode";

export function AppToaster() {
  const { preferences } = useAppearancePreferences();
  const viewportMode = useViewportMode();
  const t = useTranslations("ui");

  return (
    <Toaster
      position={viewportMode === "mobile" ? "top-right" : preferences.toastPosition}
      mobileOffset={{
        top: "calc(var(--mobile-navbar-height, 0px) + 8px)",
        right: "12px",
        left: "12px",
      }}
      closeButton
      toastOptions={{ closeButtonAriaLabel: t("close") }}
    />
  );
}
