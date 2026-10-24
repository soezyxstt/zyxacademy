import { describe, expect, test } from "bun:test";
import { normalizeLocale, resolveLocale } from "@/lib/i18n/locale";
import { localizedPublicPath } from "@/lib/public-locale-routes";
import { APP_MANIFEST_ID, APP_MANIFEST_SCOPE, getLocalizedManifestStartUrl } from "@/lib/i18n/manifest";

describe("locale resolution", () => {
  test("normalizes supported language tags only", () => {
    expect(normalizeLocale("id-ID")).toBe("id");
    expect(normalizeLocale("en_US")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });

  test("uses account, cookie, browser, then Indonesian fallback", () => {
    expect(resolveLocale({ accountPreference: "en", cookieLocale: "id", acceptLanguage: "id-ID" })).toBe("en");
    expect(resolveLocale({ cookieLocale: "id", acceptLanguage: "en-US" })).toBe("id");
    expect(resolveLocale({ acceptLanguage: "fr-FR, en-US;q=0.8" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "en;q=0, id;q=1.2" })).toBe("id");
    expect(resolveLocale({ acceptLanguage: "en;q=0" })).toBe("id");
    expect(resolveLocale({})).toBe("id");
  });

  test("explicit public URL language takes precedence", () => {
    expect(resolveLocale({ explicitUrlLocale: "en", accountPreference: "id", cookieLocale: "id" })).toBe("en");
    expect(resolveLocale({ explicitUrlLocale: "fr", accountPreference: "id" })).toBe("id");
  });

  test("localized app start URLs stay on the finite public locale routes", () => {
    expect(getLocalizedManifestStartUrl("id")).toBe("/");
    expect(getLocalizedManifestStartUrl("en")).toBe("/en");
    expect(localizedPublicPath("en", "/admin")).toBeNull();
    expect(APP_MANIFEST_ID).toBe("/");
    expect(APP_MANIFEST_SCOPE).toBe("/");
  });
});
