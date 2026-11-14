import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import type { Locale } from "@/lib/i18n/locale";

// Match React's server request dispatcher and replace its store between requests.
const serverReact = require(path.resolve("node_modules/react/react.react-server.js"));
const internals = serverReact.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const previousDispatcher = internals.A;
let store = new Map();
internals.A = { getCacheForType(factory: () => unknown) {
  if (!store.has(factory)) store.set(factory, factory());
  return store.get(factory);
} };

const catalogs = await import("@/lib/i18n/catalogs");
const originalLoadCatalog = catalogs.loadCatalog;
const originalLoadMessages = catalogs.loadMessages;
const namespaces = catalogs.DEFAULT_NAMESPACES;
const loads: string[] = [];
mock.module("react", () => ({ ...React, cache: serverReact.cache }));
mock.module("@/lib/i18n/catalogs", () => ({
  DEFAULT_NAMESPACES: namespaces,
  loadMessages: originalLoadMessages,
  loadCatalog: async (locale: Locale, namespace: string) => {
    loads.push(`${locale}:${namespace}`);
    return originalLoadCatalog(locale, namespace);
  },
}));

let explicitLocale: Locale | null = "id";
let cookieLocale: Locale | null = "id";
let accountLocale: Locale | null = null;
let signedIn = false;
mock.module("next/headers", () => ({
  headers: async () => new Headers(explicitLocale ? { "x-app-locale": explicitLocale, "accept-language": "en" } : { "accept-language": "en" }),
  cookies: async () => ({ get: () => cookieLocale ? { value: cookieLocale } : undefined }),
}));
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => signedIn ? { user: { id: "fixture" } } : null }));
mock.module("@/lib/i18n/preferences", () => ({ getUserLocalePreference: async () => accountLocale }));

const { getAppLocaleResolution, getAppMessages, getTranslations } = await import("@/lib/i18n/server");

beforeEach(() => {
  store = new Map();
  loads.length = 0;
  explicitLocale = "id";
  cookieLocale = "id";
  accountLocale = null;
  signedIn = false;
});
afterAll(() => { internals.A = previousDispatcher; mock.restore(); });

test("root catalogs and nested demo translators share each namespace within a request", async () => {
  const [messages, marketing, views, core] = await Promise.all([
    getAppMessages("id"),
    getTranslations("marketing"),
    getTranslations("marketing.demo.views"),
    getTranslations("core"),
  ]);

  expect(views("article")).toBe("Artikel");
  expect(marketing("demo.views.article")).toBe("Artikel");
  expect(core("skipToMain")).toBe("Langsung ke isi utama");
  expect(loads).toHaveLength(namespaces.length);
  expect(loads.filter((key) => key === "id:marketing")).toHaveLength(1);
  expect(loads.filter((key) => key === "id:core")).toHaveLength(1);

  await getAppMessages("id");
  expect(loads).toHaveLength(namespaces.length);
  await getAppMessages("en");
  expect(loads).toHaveLength(namespaces.length * 2);

  store = new Map();
  await getAppMessages("id");
  expect(loads.filter((key) => key === "id:marketing")).toHaveLength(2);
  expect(messages).toEqual(await originalLoadMessages("id"));
});

test("both root catalogs include every registered file for cross-surface navigation", async () => {
  for (const locale of ["id", "en"] as const) {
    const files = readdirSync(path.resolve(`messages/${locale}`))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .sort();
    const messages = await getAppMessages(locale);
    expect(Object.keys(messages).sort()).toEqual(files);
    expect(messages).toEqual(await originalLoadMessages(locale));
  }
});

test("explicit, account, cookie and browser locale precedence is unchanged", async () => {
  signedIn = true;
  accountLocale = "en";
  expect(await getAppLocaleResolution()).toEqual({ locale: "id", accountPreference: null });

  explicitLocale = null;
  store = new Map();
  expect(await getAppLocaleResolution()).toEqual({ locale: "en", accountPreference: "en" });

  accountLocale = null;
  store = new Map();
  expect(await getAppLocaleResolution()).toEqual({ locale: "id", accountPreference: null });

  cookieLocale = null;
  store = new Map();
  expect(await getAppLocaleResolution()).toEqual({ locale: "en", accountPreference: null });
});
