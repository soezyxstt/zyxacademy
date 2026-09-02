"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import {
  calculateOpsAiMaxWidth,
  clampOpsAiWidth,
  loadOpsAiOpenPreference,
  saveOpsAiOpenPreference,
  loadOpsAiWidthPreference,
  saveOpsAiWidthPreference,
} from "./ops-ai-storage";

interface OpsAiContextValue {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  width: number;
  setWidth: (width: number | ((prev: number) => number)) => void;
  isDesktop: boolean;
  maxWidth: number;
  toggleOpen: () => void;
  openPanel: (triggerElement?: HTMLElement | null) => void;
  closePanel: () => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
}

const OpsAiContext = createContext<OpsAiContextValue | null>(null);

export function useOptionalOpsAiContext(): OpsAiContextValue | null {
  return useContext(OpsAiContext);
}

export function useOpsAiContext(): OpsAiContextValue {
  const ctx = useContext(OpsAiContext);
  if (!ctx) {
    throw new Error("useOpsAiContext must be used within an OpsAiProvider");
  }
  return ctx;
}

export function OpsAiProvider({
  children,
  initialOpen,
  initialWidth,
}: {
  children: ReactNode;
  initialOpen?: boolean;
  initialWidth?: number;
}) {
  const [isOpen, setIsOpenState] = useState<boolean>(() => {
    if (typeof initialOpen === "boolean") return initialOpen;
    return loadOpsAiOpenPreference(false);
  });

  const [width, setWidthState] = useState<number>(() => {
    if (typeof initialWidth === "number") return initialWidth;
    return loadOpsAiWidthPreference();
  });

  // Default to desktop-compatible SSR baseline; handleResize in useEffect syncs client dimensions
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const [maxWidth, setMaxWidth] = useState<number>(720);

  const triggerRef = useRef<HTMLElement | null>(null);

  // Synchronize width setting with boundary clamping and storage
  const setWidth = useCallback((value: number | ((prev: number) => number)) => {
    setWidthState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      const clamped = clampOpsAiWidth(next, typeof window !== "undefined" ? window.innerWidth : 1440);
      saveOpsAiWidthPreference(clamped);
      return clamped;
    });
  }, []);

  // Synchronize open state with storage
  const setIsOpen = useCallback((value: React.SetStateAction<boolean>) => {
    setIsOpenState((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      saveOpsAiOpenPreference(next);
      return next;
    });
  }, []);

  // Handle responsive resize and viewport boundary adjustments
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => {
      const w = window.innerWidth;
      const desktop = w >= 1024;
      setIsDesktop(desktop);
      const computedMax = calculateOpsAiMaxWidth(w);
      setMaxWidth(computedMax);

      setWidthState((prev) => {
        const clamped = clampOpsAiWidth(prev, w);
        return clamped;
      });
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Body scroll lock on mobile when panel is active
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (isOpen && !isDesktop) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, isDesktop]);

  const openPanel = useCallback((triggerElement?: HTMLElement | null) => {
    if (triggerElement) {
      triggerRef.current = triggerElement;
    } else if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    setIsOpen(true);
  }, [setIsOpen]);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Focus return without scroll jumping
    if (triggerRef.current && typeof triggerRef.current.focus === "function") {
      setTimeout(() => {
        triggerRef.current?.focus({ preventScroll: true });
      }, 50);
    }
  }, [setIsOpen]);

  const toggleOpen = useCallback(() => {
    setIsOpenState((prev) => {
      const next = !prev;
      saveOpsAiOpenPreference(next);
      if (!next && triggerRef.current && typeof triggerRef.current.focus === "function") {
        setTimeout(() => {
          triggerRef.current?.focus({ preventScroll: true });
        }, 50);
      }
      return next;
    });
  }, []);

  // Window event listeners for cross-component triggers and Cmd+/ shortcut
  useEffect(() => {
    const handleToggleEvent = () => toggleOpen();
    const handleOpenEvent = () => openPanel();
    const handleCloseEvent = () => closePanel();

    window.addEventListener("zyx:toggle-ops-ai", handleToggleEvent);
    window.addEventListener("zyx:open-ops-ai", handleOpenEvent);
    window.addEventListener("zyx:close-ops-ai", handleCloseEvent);

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        toggleOpen();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        closePanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("zyx:toggle-ops-ai", handleToggleEvent);
      window.removeEventListener("zyx:open-ops-ai", handleOpenEvent);
      window.removeEventListener("zyx:close-ops-ai", handleCloseEvent);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, toggleOpen, openPanel, closePanel]);

  return (
    <OpsAiContext.Provider
      value={{
        isOpen,
        setIsOpen,
        width,
        setWidth,
        isDesktop,
        maxWidth,
        toggleOpen,
        openPanel,
        closePanel,
        triggerRef,
      }}
    >
      {children}
    </OpsAiContext.Provider>
  );
}
