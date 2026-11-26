import type { NativeAccountContext } from "../../../packages/native-session/context";
import commonEn from "../../../messages/en/common.json";
import commonId from "../../../messages/id/common.json";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "../auth/login-intent";

const common = { en: commonEn, id: commonId };
const routes = [
  ["profile", "/profile"], ["preferences", "/settings"], ["studentDashboard", "/dashboard"],
  ["tutorPanel", "/tutor"], ["adminPanel", "/admin"],
] as const;

export function accountMenuEntries(account: NativeAccountContext, sitemap: NativeRouteNode | null) {
  const { locale } = account;
  return routes.flatMap(([id, path]) => {
    const destination = resolveNativeProtectedDestination(path, account, sitemap);
    const label = id === "profile" ? (locale === "id" ? "Profil" : "Profile") : common[locale][id];
    return destination ? [{ id, label, href: destination.href }] : [];
  });
}

export function accountMenuCopy(locale: NativeAccountContext["locale"]) {
  return {
    ...common[locale], account: locale === "id" ? "Akun" : "Account", close: locale === "id" ? "Tutup" : "Close",
    haptics: locale === "id" ? "Getaran" : "Haptics", devicePreferences: locale === "id" ? "Preferensi perangkat" : "Device preferences",
  };
}
