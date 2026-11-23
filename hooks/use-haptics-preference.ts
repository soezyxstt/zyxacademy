"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_HAPTICS_ENABLED,
  getHapticsEnabled,
  setHapticsEnabled,
  subscribeHapticsPreference,
} from "@/lib/native/haptics";

function getServerSnapshot(): boolean {
  return DEFAULT_HAPTICS_ENABLED;
}

export function useHapticsPreference() {
  const enabled = useSyncExternalStore(
    subscribeHapticsPreference,
    getHapticsEnabled,
    getServerSnapshot,
  );
  return { enabled, setEnabled: setHapticsEnabled };
}
