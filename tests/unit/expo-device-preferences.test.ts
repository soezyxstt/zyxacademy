import { readingDensityScales, readingFontScales, scaleReadingText } from "../../apps/mobile-native/device/reading-scales";
import { DEFAULT_APPEARANCE_PREFERENCES } from "../../lib/appearance-preferences";
import { expect, test } from "bun:test";

import type { NativeAccountContext } from "../../packages/native-session/context";
import { nativeUiLocale } from "../../apps/mobile-native/auth/ui-locale";
import { createDevicePreferences, type NativeDeviceTheme } from "../../apps/mobile-native/device/preferences";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";

test("restores a device theme and controls the same haptic preference across shell mounts", () => {
  let storedTheme: NativeDeviceTheme = "dark";
  let enabled = true;
  const applied: string[] = [];
  const adapters = {
    readTheme: () => storedTheme,
    saveTheme: (theme: NativeDeviceTheme) => { storedTheme = theme; },
    applyAppearance: (appearance: string) => { applied.push(appearance); },
    readHaptics: () => enabled,
    saveHaptics: (value: boolean) => { enabled = value; },
  };
  const preferences = createDevicePreferences(adapters);
  let updates = 0;
  const stop = preferences.subscribe(() => { updates++; });
  preferences.applyTheme();
  preferences.setTheme("system");
  preferences.setHaptics(false);
  preferences.setHaptics(false);
  expect(preferences.getSnapshot()).toEqual({ theme: "system", haptics: false, appearance: DEFAULT_APPEARANCE_PREFERENCES });
  expect(updates).toBe(2);
  expect(applied).toEqual(["dark", "auto"]);
  stop();
  preferences.setTheme("light");
  expect(updates).toBe(2);
  expect(createDevicePreferences(adapters).getSnapshot()).toEqual({ theme: "light", haptics: false, appearance: DEFAULT_APPEARANCE_PREFERENCES });
});

test("falls back to system appearance for unreadable or invalid storage and still honors current changes", () => {
  const applied: string[] = [];
  const adapters = {
    readTheme: () => "legacy",
    saveTheme: () => { throw new Error("storage unavailable"); },
    applyAppearance: (appearance: string) => { applied.push(appearance); },
    readHaptics: () => true,
    saveHaptics: () => {},
  };
  const preferences = createDevicePreferences(adapters);
  preferences.applyTheme();
  preferences.setTheme("dark");
  expect(preferences.getSnapshot()).toEqual({ theme: "dark", haptics: true, appearance: DEFAULT_APPEARANCE_PREFERENCES });
  expect(applied).toEqual(["auto", "dark"]);
  const unreadable = createDevicePreferences({ ...adapters, readTheme: () => { throw new Error("unreadable"); } });
  expect(unreadable.getSnapshot().theme).toBe("system");
});

test("uses only the active account and session locale, then the offline or device locale", () => {
  const context: NativeAccountContext = { accountId: "student", sessionId: "verified", roles: ["murid"], locale: "en", dashboard: "/dashboard" };
  const identity = { accountId: context.accountId, sessionId: context.sessionId, expiresAt: Date.now() + 10_000 };
  const signedIn = { ...identity, status: "signed-in" } as const;
  expect(nativeUiLocale(signedIn, context, "id")).toBe("en");
  expect(nativeUiLocale({ ...signedIn, sessionId: "new-session" }, context, "id")).toBe("id");
  expect(nativeUiLocale({ ...signedIn, accountId: "other" }, context, "id")).toBe("id");
  expect(nativeUiLocale({ status: "loading" }, context, "id")).toBe("id");
  expect(nativeUiLocale({ status: "signed-out" }, context, "id")).toBe("id");
  expect(nativeUiLocale({ status: "unavailable", offlineIdentity: { ...identity, locale: "id" } }, context, "en")).toBe("id");
  expect(nativeUiLocale({ status: "unavailable" }, context, "id")).toBe("id");
});

test("device theme and haptics are local operations", () => {
  const entry = operationsCatalog.find(item => item.source === "apps/mobile-native/device/preferences.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.actions).toEqual(["setTheme", "setHaptics", "setAppearance", "restoreDisplay"]);
  expect(entry?.tools).toEqual([]);
});

test("device appearance survives a remount and display reset preserves alerts and haptics", () => {
  let display = JSON.stringify({ fontSize: "invalid", density: "tight", background: "solid" });
  const adapters = { readTheme: () => "system", saveTheme() {}, applyAppearance() {}, readHaptics: () => false, saveHaptics() {},
    readDisplay: () => display, saveDisplay: (next: string) => { display = next; } };
  const initial = createDevicePreferences(adapters);
  expect(initial.getSnapshot().appearance).toEqual({ ...DEFAULT_APPEARANCE_PREFERENCES, density: "tight", background: "solid" });
  initial.setAppearance("fontSize", "large");
  initial.setAppearance("toastPosition", "bottom-left");
  initial.setAppearance("animations", false);
  const restored = createDevicePreferences(adapters);
  expect(restored.getSnapshot().appearance).toEqual(initial.getSnapshot().appearance);
  restored.restoreDisplay();
  expect(restored.getSnapshot()).toEqual({ theme: "system", haptics: false, appearance: { ...DEFAULT_APPEARANCE_PREFERENCES, toastPosition: "bottom-left" } });
});

test("native reading type and spacing use the exact web preference scales and reset semantics", async () => {
  const css = await Bun.file("app/appearance-preferences.css").text();
  for (const [attribute, token, scales, defaultName] of [
    ["font-size", "font", readingFontScales, DEFAULT_APPEARANCE_PREFERENCES.fontSize],
    ["density", "spacing", readingDensityScales, DEFAULT_APPEARANCE_PREFERENCES.density],
  ] as const) {
    for (const [name, scale] of Object.entries(scales)) {
      if (name === defaultName) expect(scale).toBe(1);
      else expect(css).toContain(`:root[data-preference-${attribute}="${name}"]:has([data-personalized-surface]) {\n  --user-${token}-scale: ${scale};`);
    }
  }
  const ordinary = { fontSize: 14, lineHeight: 20 };
  const base = { readTheme: () => "system", saveTheme() {}, applyAppearance() {}, readHaptics: () => true, saveHaptics() {} };
  const prefs = createDevicePreferences(base);
  prefs.setAppearance("fontSize", "large");
  prefs.setAppearance("density", "tightest");
  expect(scaleReadingText(readingFontScales[prefs.getSnapshot().appearance.fontSize], ordinary)).toEqual({ fontSize: 17.5, lineHeight: 25 });
  expect(scaleReadingText(1.25, ordinary, { fontSize: 12, lineHeight: 16 })).toEqual({ fontSize: 15, lineHeight: 20 });
  expect(16 * readingDensityScales[prefs.getSnapshot().appearance.density]).toBe(12);
  prefs.restoreDisplay();
  expect(scaleReadingText(readingFontScales[prefs.getSnapshot().appearance.fontSize], ordinary)).toEqual(ordinary);
  expect(16 * readingDensityScales[prefs.getSnapshot().appearance.density]).toBe(16);
});
