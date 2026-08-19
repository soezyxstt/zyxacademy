"use client";

import * as React from "react";

export const ZYRA_PET_VISIBILITY_KEY = "zyx-zyra-pet-visible-v1";
export const ZYRA_PET_VISIBILITY_EVENT = "zyx-zyra-pet-visibility-change";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export function getZyraPetVisible(): boolean {
  const storage = getStorage();
  if (!storage) return true;
  try {
    return storage.getItem(ZYRA_PET_VISIBILITY_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setZyraPetVisible(visible: boolean) {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ZYRA_PET_VISIBILITY_KEY, visible ? "1" : "0");
    } catch {}
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(ZYRA_PET_VISIBILITY_EVENT, { detail: visible }));
    } catch {}
  } else if (typeof globalThis !== "undefined" && typeof globalThis.dispatchEvent === "function") {
    try {
      globalThis.dispatchEvent(new CustomEvent(ZYRA_PET_VISIBILITY_EVENT, { detail: visible }));
    } catch {}
  }
}

export function toggleZyraPetVisible(): boolean {
  const next = !getZyraPetVisible();
  setZyraPetVisible(next);
  return next;
}

export function useZyraPetVisibility() {
  const [visible, setVisibleState] = React.useState<boolean>(true);

  React.useEffect(() => {
    setVisibleState(getZyraPetVisible());

    const handleCustomEvent = (event: Event) => {
      const custom = event as CustomEvent<boolean>;
      if (typeof custom.detail === "boolean") {
        setVisibleState(custom.detail);
      } else {
        setVisibleState(getZyraPetVisible());
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ZYRA_PET_VISIBILITY_KEY) {
        setVisibleState(event.newValue !== "0");
      }
    };

    window.addEventListener(ZYRA_PET_VISIBILITY_EVENT, handleCustomEvent);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(ZYRA_PET_VISIBILITY_EVENT, handleCustomEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setVisible = React.useCallback((next: boolean) => {
    setZyraPetVisible(next);
  }, []);

  const toggleVisible = React.useCallback(() => {
    return toggleZyraPetVisible();
  }, []);

  return {
    visible,
    setVisible,
    toggleVisible,
  };
}
