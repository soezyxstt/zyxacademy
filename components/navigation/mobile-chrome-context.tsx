"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useViewportMode } from "@/hooks/use-viewport-mode";

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

export interface MobileTopNavSearchConfig {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  ariaLabel?: string;
  isLoading?: boolean;
}

export interface MobileTopNavStackEntry {
  id: string;
  config: MobileTopNavConfig;
}

export interface MobileTopNavSearchStackEntry {
  id: string;
  config: MobileTopNavSearchConfig;
}

export interface MobileChromeState {
  topNavStack: MobileTopNavStackEntry[];
  pageSearchStack: MobileTopNavSearchStackEntry[];
  hideBottomNavTokens: string[];
}

export function createMobileChromeState(): MobileChromeState {
  return {
    topNavStack: [],
    pageSearchStack: [],
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

export function upsertPageSearchEntry(
  state: MobileChromeState,
  id: string,
  config: MobileTopNavSearchConfig
): MobileChromeState {
  const existingIndex = state.pageSearchStack.findIndex(
    (entry) => entry.id === id
  );
  if (existingIndex === -1) {
    return {
      ...state,
      pageSearchStack: [...state.pageSearchStack, { id, config }],
    };
  }

  const nextStack = state.pageSearchStack.slice();
  nextStack[existingIndex] = { id, config };
  return {
    ...state,
    pageSearchStack: nextStack,
  };
}

export function removePageSearchEntry(
  state: MobileChromeState,
  id: string
): MobileChromeState {
  if (!state.pageSearchStack.some((entry) => entry.id === id)) {
    return state;
  }
  return {
    ...state,
    pageSearchStack: state.pageSearchStack.filter((entry) => entry.id !== id),
  };
}

export function resolvePageSearchConfig(
  stack: MobileTopNavSearchStackEntry[]
): MobileTopNavSearchConfig | null {
  if (stack.length === 0) return null;
  return stack[stack.length - 1]?.config ?? null;
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
  pageSearch: MobileTopNavSearchConfig | null;
  isTopNavActive: boolean;
  hideBottomNav: boolean;
  hiddenBottomNavCount: number;
  registerTopNav: (id: string, config: MobileTopNavConfig) => void;
  unregisterTopNav: (id: string) => void;
  registerPageSearch: (id: string, config: MobileTopNavSearchConfig) => void;
  unregisterPageSearch: (id: string) => void;
  acquireHideBottomNav: (token: string) => void;
  releaseHideBottomNav: (token: string) => void;
}

const DEFAULT_MOBILE_CHROME_VALUE: MobileChromeContextValue = {
  topNav: {},
  pageSearch: null,
  isTopNavActive: false,
  hideBottomNav: false,
  hiddenBottomNavCount: 0,
  registerTopNav: () => {},
  unregisterTopNav: () => {},
  registerPageSearch: () => {},
  unregisterPageSearch: () => {},
  acquireHideBottomNav: () => {},
  releaseHideBottomNav: () => {},
};

const MobileChromeContext = createContext<MobileChromeContextValue>(
  DEFAULT_MOBILE_CHROME_VALUE
);

const MobileSearchInlineContext = createContext<boolean>(false);

/**
 * Marks a subtree (such as Dialog, Sheet, or Popover) so SearchBar instances
 * inside it remain inline instead of delegating to the mobile top navbar.
 */
export function MobileSearchInlineProvider({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <MobileSearchInlineContext.Provider value={true}>
      {children}
    </MobileSearchInlineContext.Provider>
  );
}

export function useIsMobileSearchInline(): boolean {
  return useContext(MobileSearchInlineContext);
}

export function MobileChromeProvider({
  children,
  hasTopNav = true,
}: {
  children: ReactNode;
  hasTopNav?: boolean;
}) {
  const [state, setState] = useState<MobileChromeState>(createMobileChromeState);

  const registerTopNav = useCallback((id: string, config: MobileTopNavConfig) => {
    setState((prev) => upsertTopNavEntry(prev, id, config));
  }, []);

  const unregisterTopNav = useCallback((id: string) => {
    setState((prev) => removeTopNavEntry(prev, id));
  }, []);

  const registerPageSearch = useCallback(
    (id: string, config: MobileTopNavSearchConfig) => {
      setState((prev) => upsertPageSearchEntry(prev, id, config));
    },
    []
  );

  const unregisterPageSearch = useCallback((id: string) => {
    setState((prev) => removePageSearchEntry(prev, id));
  }, []);

  const acquireHideBottomNav = useCallback((token: string) => {
    setState((prev) => addHideBottomNavToken(prev, token));
  }, []);

  const releaseHideBottomNav = useCallback((token: string) => {
    setState((prev) => removeHideBottomNavToken(prev, token));
  }, []);

  const value = useMemo<MobileChromeContextValue>(() => {
    const resolvedTopNav = resolveTopNavConfig(state.topNavStack);
    return {
      topNav: resolvedTopNav,
      pageSearch: resolvePageSearchConfig(state.pageSearchStack),
      isTopNavActive: hasTopNav && !resolvedTopNav.hideTopNav,
      hideBottomNav: state.hideBottomNavTokens.length > 0,
      hiddenBottomNavCount: state.hideBottomNavTokens.length,
      registerTopNav,
      unregisterTopNav,
      registerPageSearch,
      unregisterPageSearch,
      acquireHideBottomNav,
      releaseHideBottomNav,
    };
  }, [
    acquireHideBottomNav,
    hasTopNav,
    registerPageSearch,
    registerTopNav,
    releaseHideBottomNav,
    state.hideBottomNavTokens.length,
    state.pageSearchStack,
    state.topNavStack,
    unregisterPageSearch,
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

/** Registers page actions only when a mobile navbar is available. */
export function useMobilePageActions(pageActions: ReactNode): boolean {
  const { isTopNavActive } = useMobileChrome();
  const viewport = useViewportMode();
  const inNavbar = Boolean(pageActions) && isTopNavActive && viewport === "mobile";
  useMobileTopNav(inNavbar ? { pageActions } : null);
  return inNavbar;
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

  useEffect(() => {
    return () => {
      unregisterTopNav(id);
    };
  }, [id, unregisterTopNav]);
}

/**
 * Declaratively binds a page-level search input to the unified mobile top navbar.
 * Uses refs for callbacks so inline handlers never trigger effect loops.
 */
export function useMobileTopNavSearch(config: MobileTopNavSearchConfig | null) {
  const id = useId();
  const { registerPageSearch, unregisterPageSearch } = useMobileChrome();
  const onChangeRef = useRef(config?.onChange);
  const onClearRef = useRef(config?.onClear);

  useEffect(() => {
    onChangeRef.current = config?.onChange;
    onClearRef.current = config?.onClear;
  });

  const enabled = config !== null;
  const value = config?.value ?? "";
  const placeholder = config?.placeholder;
  const ariaLabel = config?.ariaLabel;
  const isLoading = config?.isLoading;

  useEffect(() => {
    if (!enabled) {
      unregisterPageSearch(id);
      return;
    }

    registerPageSearch(id, {
      value,
      onChange: (next) => onChangeRef.current?.(next),
      onClear: () => {
        if (onClearRef.current) {
          onClearRef.current();
        } else {
          onChangeRef.current?.("");
        }
      },
      placeholder,
      ariaLabel,
      isLoading,
    });
  }, [
    ariaLabel,
    enabled,
    id,
    isLoading,
    placeholder,
    registerPageSearch,
    unregisterPageSearch,
    value,
  ]);

  useEffect(() => {
    return () => {
      unregisterPageSearch(id);
    };
  }, [id, unregisterPageSearch]);
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
