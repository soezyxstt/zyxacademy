"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { NextIntlClientProvider } from "next-intl";
import { mirrorResolvedAccountLocaleCookie, saveLocaleSelection } from "@/lib/i18n/actions";
import { loadMessages } from "@/lib/i18n/catalogs";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import type { MessageCatalog } from "@/lib/i18n/catalogs";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<boolean>;
  isPending: boolean;
  error: string | null;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const CROSS_TAB_LOCALE_KEY = "zyx-locale-selection";

export function LocaleProvider({
  children,
  initialLocale,
  initialMessages,
  accountPreference = null,
  persistLocale = saveLocaleSelection,
}: {
  children: React.ReactNode;
  initialLocale: Locale;
  initialMessages: Record<string, MessageCatalog>;
  accountPreference?: Locale | null;
  persistLocale?: (locale: Locale) => Promise<{ success: boolean }>;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const [isTransitionPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const requestInProgress = useRef(false);
  const lastServerProps = useRef({ locale: initialLocale, messages: initialMessages });

  useEffect(() => {
    const propsChanged = lastServerProps.current.locale !== initialLocale
      || lastServerProps.current.messages !== initialMessages;
    if (!propsChanged) return;
    lastServerProps.current = { locale: initialLocale, messages: initialMessages };
    if (initialLocale !== locale) {
      setLocaleState(initialLocale);
      document.documentElement.lang = initialLocale;
      setError(null);
    }
    setMessages(initialMessages);
  }, [initialLocale, initialMessages, locale]);

  useEffect(() => {
    if (!accountPreference) return;
    const currentCookie = document.cookie.split(";").map((item) => item.trim())
      .find((item) => item.startsWith("zyx_locale="))?.split("=", 2)[1];
    if (currentCookie === accountPreference) return;
    void mirrorResolvedAccountLocaleCookie(accountPreference);
  }, [accountPreference]);

  const applyLocale = useCallback(async (nextLocale: Locale, suppliedMessages?: Record<string, MessageCatalog>) => {
    const nextMessages = suppliedMessages ?? await loadMessages(nextLocale);
    startTransition(() => {
      setMessages(nextMessages);
      setLocaleState(nextLocale);
    });
    document.documentElement.lang = nextLocale;
  }, []);

  const setLocale = useCallback(async (nextLocale: Locale) => {
    if (nextLocale === locale || requestInProgress.current) return nextLocale === locale;
    setError(null);
    requestInProgress.current = true;
    setIsSaving(true);
    try {
      const nextMessages = await loadMessages(nextLocale);
      const result = await persistLocale(nextLocale);
      if (!result.success) {
        setError(locale === "en" ? "Your language was not saved. Try again." : "Bahasa belum tersimpan. Coba lagi.");
        return false;
      }
      await applyLocale(nextLocale, nextMessages);
      try {
        localStorage.setItem(CROSS_TAB_LOCALE_KEY, `${nextLocale}:${Date.now()}`);
      } catch {
        // Cross-tab updates are a convenience; the current tab is already consistent.
      }
      return true;
    } catch {
      setError(locale === "en" ? "Your language was not saved. Try again." : "Bahasa belum tersimpan. Coba lagi.");
      return false;
    } finally {
      requestInProgress.current = false;
      setIsSaving(false);
    }
  }, [applyLocale, locale, persistLocale]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CROSS_TAB_LOCALE_KEY || !event.newValue) return;
      const nextLocale = event.newValue.split(":", 1)[0];
      if (nextLocale === "id" || nextLocale === "en") void applyLocale(nextLocale);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyLocale]);

  const contextValue = useMemo(() => ({
    locale,
    setLocale,
    isPending: isSaving || isTransitionPending,
    error,
  }), [locale, setLocale, isSaving, isTransitionPending, error]);

  return (
    <LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function useAppLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: async () => false,
      isPending: false,
      error: null,
    };
  }
  return context;
}
