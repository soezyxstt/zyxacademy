import type { Locale } from "@/lib/i18n/locale";

export interface ZyraResponseLanguageState {
  interfaceLocale: Locale;
  conversationKey: string;
  stickyOverride: Locale | null;
}

export function createZyraResponseLanguageState(
  locale: Locale,
  conversationKey: string,
  stickyOverride: Locale | null = null,
): ZyraResponseLanguageState {
  return { interfaceLocale: locale, conversationKey, stickyOverride };
}

export function zyraRequestResponseLanguage(
  state: ZyraResponseLanguageState,
  currentInterfaceLocale: Locale,
  currentConversationKey: string,
): Locale {
  if (
    state.interfaceLocale !== currentInterfaceLocale ||
    state.conversationKey !== currentConversationKey
  ) {
    return currentInterfaceLocale;
  }
  return state.stickyOverride ?? currentInterfaceLocale;
}

export function zyraResponseLanguageResolved(
  state: ZyraResponseLanguageState,
  responseLanguage: Locale,
): ZyraResponseLanguageState {
  return { ...state, stickyOverride: responseLanguage };
}

export function zyraInterfaceLocaleChanged(
  state: ZyraResponseLanguageState,
  interfaceLocale: Locale,
): ZyraResponseLanguageState {
  if (state.interfaceLocale === interfaceLocale) return state;
  return { ...state, interfaceLocale, stickyOverride: null };
}

export function zyraResponseLanguageConversationChanged(
  state: ZyraResponseLanguageState,
  conversationKey: string,
  rememberedOverride: Locale | null = null,
): ZyraResponseLanguageState {
  if (state.conversationKey === conversationKey) return state;
  return { ...state, conversationKey, stickyOverride: rememberedOverride };
}

export function withZyraResponseLanguage<T extends Record<string, unknown>>(
  payload: T,
  state: ZyraResponseLanguageState,
  currentInterfaceLocale: Locale,
  currentConversationKey: string,
): T & { responseLanguage: Locale } {
  return {
    ...payload,
    responseLanguage: zyraRequestResponseLanguage(state, currentInterfaceLocale, currentConversationKey),
  };
}
