import { randomUUID } from "expo-crypto";
import { useFocusEffect, useNavigation, useRouter, useSitemap, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { Button } from "../components/Button";
import { productNavigationHref } from "../routing/product-location";
import { publicWebsiteUrl } from "../routing/public-website";
import { resolveExpoEntryRoute } from "../routing/route-history";
import { expoRouteHistory } from "../routing/route-history-expo";
import { authCopy } from "./auth-copy";
import { AuthPage, AuthStatus } from "./auth-page";
import { resolveNativeLoginReturn, type NativeAuthLocale } from "./login-intent";
import { useNativeSession } from "./session-provider";
import { useNativeAccountContext } from "./use-account-context";

export function AuthSessionStatus({ locale }: { locale: NativeAuthLocale }) {
  const { state, refresh, logout } = useNativeSession();
  const copy = authCopy[locale];
  if (state.status === "loading") {
    return <AuthPage title={copy.native.finishing}><AuthStatus busy center>{copy.native.preparing}</AuthStatus></AuthPage>;
  }
  if (state.status === "unavailable") {
    return <AuthPage title={copy.native.unavailable}>
      <AuthStatus error>{copy.native.sessionUnavailable}</AuthStatus>
      <Button onPress={() => void refresh()}>{copy.native.retry}</Button>
    </AuthPage>;
  }
  if (state.status === "logout-pending") {
    return <AuthPage title={copy.signOut.title}>
      <AuthStatus busy={!state.retry} error={state.retry} center={!state.retry}>
        {state.retry ? copy.signOut.error : copy.signOut.pending}
      </AuthStatus>
      {state.retry && <Button onPress={() => void logout()}>{copy.signOut.retry}</Button>}
    </AuthPage>;
  }
  return null;
}

export function AuthContinuation({ fallbackLocale, next }: { fallbackLocale: NativeAuthLocale; next?: string }) {
  const { state, transport, loginIntent, clearLoginIntent, getSnapshot } = useNativeSession();
  const { context, failed, denied, retry } = useNativeAccountContext();
  const sitemap = useSitemap();
  const router = useRouter();
  const screen = useNavigation();
  const navigating = useRef(false);
  const [openingDashboard, setOpeningDashboard] = useState(false);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [websiteFailed, setWebsiteFailed] = useState(false);
  const [clearingWebsiteIntent, setClearingWebsiteIntent] = useState(false);
  const [pendingWebsite, setPendingWebsite] = useState<{ href: string; transport: typeof transport } | null>(null);
  const currentAccount = state.status === "signed-in" && context?.accountId === state.accountId &&
    context.sessionId === state.sessionId ? context : null;
  const explicit = next ?? loginIntent?.next ?? (pendingWebsite?.transport === transport ? pendingWebsite?.href : undefined);
  const destination = currentAccount && sitemap ? resolveNativeLoginReturn(explicit, currentAccount, sitemap) : null;

  useFocusEffect(useCallback(() => {
    if (state.status !== "signed-in" || !transport || !currentAccount || !sitemap || navigating.current ||
      websiteFailed || clearingWebsiteIntent) return;
    const isCurrent = () => {
      const snapshot = getSnapshot();
      return snapshot.state === state && snapshot.transport === transport && !snapshot.revalidating
        && transport.isCurrent() && state.expiresAt > Date.now() && screen.isFocused();
    };
    if (!isCurrent()) return;
    const target = resolveExpoEntryRoute(explicit, currentAccount, sitemap,
      () => expoRouteHistory.restore(transport.scope, currentAccount, sitemap, isCurrent));
    if (target.status !== "ready" || !isCurrent()) return;
    if (publicWebsiteUrl(target.href)) {
      navigating.current = true;
      setPendingWebsite({ href: target.href, transport });
      setClearingWebsiteIntent(true);
      void clearLoginIntent(state).then(() => {
        const route = isCurrent() && productNavigationHref(target.href, randomUUID);
        if (route) {
          setPendingWebsite(null);
          router.replace(route.href as Href);
        }
        else navigating.current = false;
        setClearingWebsiteIntent(false);
      }, () => {
        navigating.current = false;
        setClearingWebsiteIntent(false);
        if (isCurrent()) setWebsiteFailed(true);
      });
      return;
    }
    navigating.current = true;
    router.replace(target.href as Href);
    void clearLoginIntent(state).catch(() => {});
  }, [clearLoginIntent, clearingWebsiteIntent, currentAccount, explicit, getSnapshot, router, screen, sitemap, state, transport, websiteFailed]));

  if (state.status !== "signed-in") return null;
  const locale = loginIntent?.locale ?? currentAccount?.locale ?? fallbackLocale;
  const copy = authCopy[locale];
  const signOut = () => router.replace({ pathname: "/sign-out", params: { locale } });

  const openDashboard = async (dashboard: string) => {
    if (!transport?.isCurrent() || navigating.current) return;
    navigating.current = true;
    setOpeningDashboard(true);
    setDashboardFailed(false);
    try {
      await clearLoginIntent(state);
      if (transport.isCurrent()) {
        router.replace(dashboard as Href);
        return;
      }
    } catch {
      setDashboardFailed(true);
    }
    navigating.current = false;
    setOpeningDashboard(false);
  };

  if (failed) {
    return <AuthPage title={copy.native.unavailable}>
      <AuthStatus error>{denied ? copy.native.accountDenied : copy.native.accountUnavailable}</AuthStatus>
      {!denied && <Button onPress={retry}>{copy.native.retry}</Button>}
      <Button variant="outline" onPress={signOut}>{copy.signOut.title}</Button>
    </AuthPage>;
  }

  if (websiteFailed) {
    return <AuthPage title={copy.native.signedIn}>
      <AuthStatus error>{locale === "en" ? "Could not open the requested page." : "Halaman yang diminta belum dapat dibuka."}</AuthStatus>
      <Button onPress={() => setWebsiteFailed(false)}>{copy.native.retry}</Button>
      <Button variant="outline" onPress={signOut}>{copy.signOut.title}</Button>
    </AuthPage>;
  }

  if (!destination || destination.status === "ready") {
    return <AuthPage title={copy.native.finishing}><AuthStatus busy center>{copy.native.preparing}</AuthStatus></AuthPage>;
  }

  const dashboard = destination.dashboard;
  return <AuthPage title={copy.native.signedIn}>
    <AuthStatus>{destination.status === "denied" ? copy.native.destinationDenied : copy.native.destinationUnavailable}</AuthStatus>
    {dashboardFailed && <AuthStatus error>{copy.native.dashboardFailed}</AuthStatus>}
    {dashboard && <Button isLoading={openingDashboard} onPress={() => void openDashboard(dashboard)}>{copy.native.dashboard}</Button>}
    <Button variant="outline" disabled={openingDashboard} onPress={signOut}>{copy.signOut.title}</Button>
  </AuthPage>;
}
