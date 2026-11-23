"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface MobileTopNavConfig {
  title?: string;
  subtitle?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  fallbackBackHref?: string;
  fallbackBackLabel?: string;
  leftSlot?: ReactNode;
  pageActions?: ReactNode;
  rightActions?: ReactNode;
  hideTopNav?: boolean;
}

export interface MobileTopNavStackEntry {
  id: string;
  config: MobileTopNavConfig;
}

export interface MobileChromeState {
  topNavStack: MobileTopNavStackEntry[];
  hideBottomNavTokens: string[];
}

export function createMobileChromeState(): MobileChromeState {
  return {
    topNavStack: [],
    hideBottomNavTokens: [],
  };
}

export function upsertTopNavEntry(
  state: MobileChromeState,
  id: string,
  config: MobileTopNavConfig
): MobileChromeState {
  const existingIndex = state.topNavStack.findIndex((entry) => entry.id === id);
  if (existingIndex === -1) {
    return {
      ...state,
      topNavStack: [...state.topNavStack, { id, config }],
    };
  }

  const nextStack = state.topNavStack.slice();
  nextStack[existingIndex] = { id, config };
  return {
    ...state,
    topNavStack: nextStack,
  };
}

export function removeTopNavEntry(
  state: MobileChromeState,
  id: string
): MobileChromeState {
  if (!state.topNavStack.some((entry) => entry.id === id)) {
    return state;
  }
  return {
    ...state,
    topNavStack: state.topNavStack.filter((entry) => entry.id !== id),
  };
}

export function resolveTopNavConfig(
  stack: MobileTopNavStackEntry[]
): MobileTopNavConfig {
  const merged: MobileTopNavConfig = {};
  for (const entry of stack) {
    const { config } = entry;
    if (config.title !== undefined) merged.title = config.title;
    if (config.subtitle !== undefined) merged.subtitle = config.subtitle;
    if (config.backHref !== undefined) merged.backHref = config.backHref;
    if (config.onBack !== undefined) merged.onBack = config.onBack;
    if (config.backLabel !== undefined) merged.backLabel = config.backLabel;
    if (config.fallbackBackHref !== undefined) merged.fallbackBackHref = config.fallbackBackHref;
    if (config.fallbackBackLabel !== undefined) merged.fallbackBackLabel = config.fallbackBackLabel;
    if (config.leftSlot !== undefined) merged.leftSlot = config.leftSlot;
    if (config.pageActions !== undefined) merged.pageActions = config.pageActions;
    if (config.rightActions !== undefined) merged.rightActions = config.rightActions;
    if (config.hideTopNav !== undefined) merged.hideTopNav = config.hideTopNav;
  }
  return merged;
}

export function addHideBottomNavToken(
  state: MobileChromeState,
  token: string
): MobileChromeState {
  if (state.hideBottomNavTokens.includes(token)) {
    return state;
  }
  return {
    ...state,
    hideBottomNavTokens: [...state.hideBottomNavTokens, token],
  };
}

export function removeHideBottomNavToken(
  state: MobileChromeState,
  token: string
): MobileChromeState {
  if (!state.hideBottomNavTokens.includes(token)) {
    return state;
  }
  return {
    ...state,
    hideBottomNavTokens: state.hideBottomNavTokens.filter((item) => item !== token),
  };
}

export interface MobileChromeContextValue {
  topNav: MobileTopNavConfig;
  hideBottomNav: boolean;
  hiddenBottomNavCount: number;
  registerTopNav: (id: string, config: MobileTopNavConfig) => void;
  unregisterTopNav: (id: string) => void;
  acquireHideBottomNav: (token: string) => void;
  releaseHideBottomNav: (token: string) => void;
}

const DEFAULT_MOBILE_CHROME_VALUE: MobileChromeContextValue = {
  topNav: {},
  hideBottomNav: false,
  hiddenBottomNavCount: 0,
  registerTopNav: () => {},
  unregisterTopNav: () => {},
  acquireHideBottomNav: () => {},
  releaseHideBottomNav: () => {},
};

const MobileChromeContext = createContext<MobileChromeContextValue>(
  DEFAULT_MOBILE_CHROME_VALUE
);

export function MobileChromeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MobileChromeState>(createMobileChromeState);

  const registerTopNav = useCallback((id: string, config: MobileTopNavConfig) => {
    setState((prev) => upsertTopNavEntry(prev, id, config));
  }, []);

  const unregisterTopNav = useCallback((id: string) => {
    setState((prev) => removeTopNavEntry(prev, id));
  }, []);

  const acquireHideBottomNav = useCallback((token: string) => {
    setState((prev) => addHideBottomNavToken(prev, token));
  }, []);

  const releaseHideBottomNav = useCallback((token: string) => {
    setState((prev) => removeHideBottomNavToken(prev, token));
  }, []);

  const value = useMemo<MobileChromeContextValue>(() => {
    return {
      topNav: resolveTopNavConfig(state.topNavStack),
      hideBottomNav: state.hideBottomNavTokens.length > 0,
      hiddenBottomNavCount: state.hideBottomNavTokens.length,
      registerTopNav,
      unregisterTopNav,
      acquireHideBottomNav,
      releaseHideBottomNav,
    };
  }, [
    acquireHideBottomNav,
    registerTopNav,
    releaseHideBottomNav,
    state.hideBottomNavTokens.length,
    state.topNavStack,
    unregisterTopNav,
  ]);

  return (
    <MobileChromeContext.Provider value={value}>
      {children}
    </MobileChromeContext.Provider>
  );
}

export function useMobileChrome(): MobileChromeContextValue {
  return useContext(MobileChromeContext);
}

/**
 * Declaratively overrides mobile top navbar title, back navigation, or actions
 * while the calling screen is mounted. Restores parent overrides on unmount.
 */
export function useMobileTopNav(config: MobileTopNavConfig | null) {
  const id = useId();
  const { registerTopNav, unregisterTopNav } = useMobileChrome();

  const title = config?.title;
  const subtitle = config?.subtitle;
  const backHref = config?.backHref;
  const onBack = config?.onBack;
  const backLabel = config?.backLabel;
  const fallbackBackHref = config?.fallbackBackHref;
  const fallbackBackLabel = config?.fallbackBackLabel;
  const leftSlot = config?.leftSlot;
  const pageActions = config?.pageActions;
  const rightActions = config?.rightActions;
  const hideTopNav = config?.hideTopNav;
  const enabled = config !== null;

  useEffect(() => {
    if (!enabled) {
      unregisterTopNav(id);
      return;
    }

    registerTopNav(id, {
      title,
      subtitle,
      backHref,
      onBack,
      backLabel,
      fallbackBackHref,
      fallbackBackLabel,
      leftSlot,
      pageActions,
      rightActions,
      hideTopNav,
    });

    return () => {
      unregisterTopNav(id);
    };
  }, [
    backHref,
    backLabel,
    enabled,
    fallbackBackHref,
    fallbackBackLabel,
    hideTopNav,
    id,
    leftSlot,
    onBack,
    pageActions,
    registerTopNav,
    rightActions,
    subtitle,
    title,
    unregisterTopNav,
  ]);
}

/**
 * Declaratively hides the mobile bottom navigation bar while active.
 * Ref-counted by unique token so nested immersive screens never clobber each other.
 */
export function useHideMobileBottomNav(hidden = true) {
  const token = useId();
  const { acquireHideBottomNav, releaseHideBottomNav } = useMobileChrome();

  useEffect(() => {
    if (!hidden) {
      releaseHideBottomNav(token);
      return;
    }

    acquireHideBottomNav(token);
    return () => {
      releaseHideBottomNav(token);
    };
  }, [acquireHideBottomNav, hidden, releaseHideBottomNav, token]);
}
