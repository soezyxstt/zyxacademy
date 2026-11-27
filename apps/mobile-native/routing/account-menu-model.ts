import type { NativeAccountContext } from "../../../packages/native-session/context";
import consentEn from "../../../messages/en/consent.json";
import consentId from "../../../messages/id/consent.json";
import commonEn from "../../../messages/en/common.json";
import commonId from "../../../messages/id/common.json";
import { resolveNativeProtectedDestination, type NativeRouteNode } from "../auth/login-intent";

const common = { en: commonEn, id: commonId };
const routes = [
  ["profile", "/profile"], ["preferences", "/settings"], ["studentDashboard", "/dashboard"],
  ["tutorPanel", "/tutor"], ["adminPanel", "/admin"], ["connections", "/mcp/connections"],
] as const;

export function accountMenuEntries(account: NativeAccountContext, sitemap: NativeRouteNode | null) {
  const { locale } = account;
  const labels = { ...common[locale], profile: locale === "id" ? "Profil" : "Profile",
    connections: (locale === "id" ? consentId : consentEn).authorize.manageConnections };
  return routes.flatMap(([id, path]) => {
    const destination = resolveNativeProtectedDestination(path, account, sitemap);
    return destination ? [{ id, label: labels[id], href: destination.href }] : [];
  });
}

export function accountMenuCopy(locale: NativeAccountContext["locale"]) {
  return {
    ...common[locale], account: locale === "id" ? "Akun" : "Account", close: locale === "id" ? "Tutup" : "Close",
  };
}
