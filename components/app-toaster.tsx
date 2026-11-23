"use client";

import { useTranslations } from "next-intl";
import { useAppearancePreferences } from "@/components/appearance-preferences";
import { Toaster } from "@/components/ui/sonner";

export function AppToaster() {
  const { preferences } = useAppearancePreferences();
  const t = useTranslations("ui");

  return (
    <Toaster
      position={preferences.toastPosition}
      closeButton
      toastOptions={{ closeButtonAriaLabel: t("close") }}
    />
  );
}
