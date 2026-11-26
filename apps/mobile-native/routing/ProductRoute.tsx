import { Redirect, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation, useRoute, useRouter, type Href } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useMemo, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSafeRedirectPath } from "../../../packages/native-session/auth-redirect";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { AuthSessionStatus } from "../auth/auth-continuation";
import { authCopy, authLocale } from "../auth/auth-copy";
import { AuthPage, AuthStatus } from "../auth/auth-page";
import { authEntryHref } from "../auth/login-intent";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { useNativeRouteAccountContext } from "../auth/use-account-context";
import { useNativeSession } from "../auth/session-provider";
import { nativeUiLocale } from "../auth/ui-locale";
import { Button } from "../components/Button";
import { useDevicePreferences } from "../device/preferences-provider";
import { AcademicLiveScreen, bindAcademicSession, createAcademicClient } from "../features/academic";
import { AdminOperationsScreen, PublicOperationsScreen } from "../features/operations";
import { academicRouteCanRead, productLocation, productQueryUpdate } from "./product-location";
import { expoRouteHistory } from "./route-history-expo";
import { createDeferredSessionNavigation, nativeSessionNavigationStatus } from "./session-stack";
import { StaffChrome } from "./staff-chrome";

type Owner = "public" | "student" | "academic" | "operations";

export type StudentRouteProps = {
  href: string; pattern: string; locale: "id" | "en"; theme: "light" | "dark"; showChrome: boolean;
  context: NativeAccountContext | null;
  devicePreferences: ReturnType<typeof useDevicePreferences>;
  navigate(path: string): void; replace(path: string): void; visit(path: string): void; back(fallback?: string): void;
};

export function productRoute(pattern: string, owner: Owner, StudentScreen?: ComponentType<StudentRouteProps>) {
  return function InstalledProductRoute() {
    const params = useLocalSearchParams();
    const route = useRoute();
    // SDK 58 decodes useLocalSearchParams values again. Product filters can
    // contain literal percent sequences, so take the entry's decoded query as stored.
    const local = owner === "public" ? params : { ...params, ...route.params, "#": params["#"] };
    const href = productLocation(pattern, local);
    if (!href) return <Redirect href="/" />;
    return <ProductRoute href={href} pattern={pattern} owner={owner} StudentScreen={StudentScreen} />;
  };
}

function ProductRoute({ href, pattern, owner, StudentScreen }: {
  href: string; pattern: string; owner: Owner; StudentScreen?: ComponentType<StudentRouteProps>;
}) {
  const router = useRouter();
  const screenNavigation = useNavigation();
  const isFocused = useIsFocused();
  const { state, transport, getSnapshot, getPendingRefresh } = useNativeSession();
  const [deferredNavigation] = useState(createDeferredSessionNavigation);
  const tutor = owner === "academic" && href.startsWith("/tutor");
  const studentAssessment = owner === "student" && (
    pattern === "/courses/[id]/quiz/[quizId]" || pattern === "/courses/[id]/tryout/[tryoutId]" ||
    pattern === "/courses/tutorial-pka/simulasi/[subject]/[stage]"
  );
  const access = useNativeRouteAccountContext(studentAssessment || tutor);
  const context = access.context;
  const devicePreferences = useDevicePreferences();
  const scheme = useColorScheme();
  const theme = devicePreferences.theme === "system" ? (scheme === "dark" ? "dark" : "light") : devicePreferences.theme;
  const locale = nativeUiLocale(state, context, authLocale());
  const navigationStatus = useCallback(() => {
    if (owner === "public") return "ready";
    if (!screenNavigation.isFocused()) return "blocked";
    return nativeSessionNavigationStatus(state, transport, getSnapshot());
  }, [getSnapshot, owner, screenNavigation, state, transport]);
  useFocusEffect(useCallback(() => deferredNavigation.cancel, [deferredNavigation]));
  const commitPath = useCallback((path: string, replace?: boolean) => {
    if (replace) router.replace(path as Href);
    else router.push(path as Href);
  }, [router]);
  const navigate = useCallback((path: string) => {
    if (getSafeRedirectPath(path) !== path) return;
    deferredNavigation.run(() => commitPath(path), navigationStatus);
  }, [commitPath, deferredNavigation, navigationStatus]);
  const back = useCallback((fallback = "/") => {
    deferredNavigation.run(() => {
      if (router.canGoBack()) router.back();
      else if (getSafeRedirectPath(fallback) === fallback) commitPath(fallback, true);
    }, navigationStatus);
  }, [commitPath, deferredNavigation, navigationStatus, router]);
  const navigateInScreen = useCallback((path: string, options?: { replace?: boolean }) => {
    if (getSafeRedirectPath(path) !== path) return;
    const update = productQueryUpdate(pattern, href, path);
    if (update !== null && !Object.keys(update).length) return;
    // A Student submission may finish while the same session is being reverified.
    const waitForRefresh = studentAssessment && options?.replace;
    deferredNavigation.run(() => {
      if (update === null) commitPath(path, options?.replace);
      else screenNavigation.dispatch(CommonActions.setParams(update));
    }, navigationStatus, waitForRefresh ? getPendingRefresh : undefined);
  }, [commitPath, deferredNavigation, getPendingRefresh, href, navigationStatus, pattern, screenNavigation, studentAssessment]);
  const replaceInScreen = useCallback((path: string) => navigateInScreen(path, { replace: true }), [navigateInScreen]);
  const visit = useCallback((path: string) => {
    if (getSafeRedirectPath(path) !== path || path === href.split(/[?#]/, 1)[0]) return;
    // The Tutor course picker can automatically open the only course after loading.
    deferredNavigation.run(() => router.navigate(path as Href), navigationStatus, tutor ? getPendingRefresh : undefined);
  }, [deferredNavigation, getPendingRefresh, href, navigationStatus, router, tutor]);
  const loadTutorCourses = useCallback(async (signal: AbortSignal) => {
    if (!transport?.isCurrent() || !context?.roles.includes("tutor")) return [];
    const dashboard = await createAcademicClient(bindAcademicSession(transport, locale)).tutor.dashboard(signal);
    if (!Array.isArray(dashboard.courses)) throw new Error("Invalid tutor course list");
    return dashboard.courses.filter(course => typeof course?.courseId === "string" && typeof course.title === "string");
  }, [context, locale, transport]);

  useFocusEffect(useCallback(() => {
    if (owner === "public" || access.retaining || state.status !== "signed-in" || !transport || !context) return;
    expoRouteHistory.remember(transport.scope, context, href, () => navigationStatus() === "ready");
  }, [access.retaining, context, href, navigationStatus, owner, state, transport]));

  if (owner === "public") return <SafeAreaView testID={pattern === "/" ? "product-landing" : undefined} style={{ flex: 1 }}>
    <PublicOperationsScreen href={href} origin={NATIVE_STAGING_ORIGIN} locale={locale} theme={theme} onNavigate={navigate} onBack={back} />
  </SafeAreaView>;
  if (state.status === "signed-out") {
    return isFocused ? <Redirect href={authEntryHref({ entry: "sign-in", locale, next: href })} /> : null;
  }
  if (owner === "student" && StudentScreen && (state.status === "signed-in" || (state.status === "unavailable" && state.offlineIdentity))) {
    const identity = state.status === "signed-in" ? state : state.offlineIdentity;
    return <RecheckingRoute enabled={studentAssessment} checking={access.retaining}>
      <StudentScreen key={JSON.stringify([identity?.accountId, identity?.sessionId])} href={href} pattern={pattern}
        locale={locale} theme={theme} showChrome={!access.retaining && context?.roles.includes("murid") === true}
        context={context} devicePreferences={devicePreferences}
        navigate={navigate} replace={replaceInScreen} visit={visit} back={back} />
    </RecheckingRoute>;
  }
  if (state.status !== "signed-in") return <AuthSessionStatus locale={locale} />;
  if (access.failed) return <SafeAreaView><Text accessibilityRole="alert">
    {access.denied ? (locale === "en" ? "Access denied." : "Akses ditolak.") :
      (locale === "en" ? "Could not check account access." : "Akses akun belum dapat diperiksa.")}
  </Text><Button onPress={access.retry}>{locale === "en" ? "Try again" : "Coba lagi"}</Button>
    <Button onPress={() => back()}>{locale === "en" ? "Back" : "Kembali"}</Button></SafeAreaView>;
  if (!context || !transport?.isCurrent()) return <ActivityIndicator />;
  const role = owner === "student" ? "murid" : tutor ? "tutor" : "admin";
  if (context.accountId !== transport.scope.accountId || context.sessionId !== transport.scope.sessionId ||
    !context.roles.includes(role)) return <SafeAreaView><Text accessibilityRole="alert">
    {locale === "en" ? "Access denied." : "Akses ditolak."}
  </Text><Button onPress={() => back()}>{locale === "en" ? "Back" : "Kembali"}</Button></SafeAreaView>;
  const accountKey = JSON.stringify([context.accountId, context.sessionId, locale]);
  if (role === "murid") return isFocused ? <BrowserDashboard key={accountKey} locale={locale}
    canNavigate={() => navigationStatus() === "ready"} signOut={() => navigate("/sign-out")} /> : null;
  return <RecheckingRoute enabled={tutor} checking={access.retaining}>
    <StaffChrome key={accountKey} role={role} href={href} theme={theme} focused={isFocused} context={context}
      checkingAccess={access.retaining} session={transport} visit={visit} back={back} loadTutorCourses={loadTutorCourses}>
      {owner === "academic" ? <AcademicRoute href={href} session={transport} accountId={context.accountId}
        role={role} locale={locale} navigate={navigateInScreen} replace={replaceInScreen}
        back={() => back(role === "admin" ? "/admin" : "/tutor")} theme={theme} /> :
        <AdminOperationsScreen href={href} session={transport} context={context} navigate={navigateInScreen} theme={theme} />}
    </StaffChrome>
  </RecheckingRoute>;
}

function RecheckingRoute({ enabled, checking, children }: { enabled: boolean; checking: boolean; children: ReactNode }) {
  if (!enabled) return children;
  return <>
    <View style={checking ? { display: "none" } : { flex: 1 }}>{children}</View>
    {checking && <ActivityIndicator />}
  </>;
}

function AcademicRoute({ session, locale, accountId, role, ...props }: {
  session: Parameters<typeof bindAcademicSession>[0]; locale: "id" | "en"; accountId: string; role: "admin" | "tutor";
} & Pick<ComponentProps<typeof AcademicLiveScreen>, "href" | "navigate" | "replace" | "back" | "theme">) {
  const focused = useIsFocused();
  const focusedOnce = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const preserveList = academicRouteCanRead(props.href, false, true);
  useFocusEffect(useCallback(() => {
    if (preserveList && focusedOnce.current) setRefresh(value => value + 1);
    focusedOnce.current = true;
  }, [preserveList]));
  const transport = useMemo(() => bindAcademicSession(session, locale), [session, locale]);

  // Keep list filters on Back. Other Academic screens recheck their protected
  // resource from a fresh mount before displaying any previous result.
  if (!academicRouteCanRead(props.href, focused, focusedOnce.current)) return null;
  return <AcademicLiveScreen {...props} transport={transport} actor={{ id: accountId, role }} refresh={refresh} />;
}

function BrowserDashboard({ locale, canNavigate, signOut }: {
  locale: "id" | "en"; canNavigate(): boolean; signOut(): void;
}) {
  const copy = authCopy[locale];
  const opening = useRef(false);
  const [status, setStatus] = useState<"idle" | "opening" | "failed">("idle");
  const open = async () => {
    if (opening.current || !canNavigate()) return;
    opening.current = true;
    setStatus("opening");
    try {
      await openBrowserAsync(new URL("/dashboard", NATIVE_STAGING_ORIGIN).href);
      setStatus("idle");
    } catch {
      setStatus("failed");
    } finally {
      opening.current = false;
    }
  };

  return <AuthPage title={copy.native.signedIn}>
    <AuthStatus>{copy.native.destinationUnavailable}</AuthStatus>
    {status === "failed" && <AuthStatus error>{copy.native.dashboardFailed}</AuthStatus>}
    <Button isLoading={status === "opening"} onPress={() => void open()}>
      {locale === "en" ? "Open dashboard in browser" : "Buka dashboard di browser"}
    </Button>
    <Button variant="outline" disabled={status === "opening"} onPress={signOut}>{copy.signOut.title}</Button>
  </AuthPage>;
}
