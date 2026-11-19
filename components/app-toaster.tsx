"use client";

import { useAppearancePreferences } from "@/components/appearance-preferences";
import { Toaster } from "@/components/ui/sonner";

export function AppToaster() {
  const { preferences } = useAppearancePreferences();
  return <Toaster position={preferences.toastPosition} closeButton />;
}
