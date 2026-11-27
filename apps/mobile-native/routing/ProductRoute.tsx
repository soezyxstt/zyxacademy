import { randomUUID } from "expo-crypto";
import { Redirect, useFocusEffect, useIsFocused, useLocalSearchParams, useNavigation, useRoute, useRouter, type Href } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { openBrowserAsync } from "expo-web-browser";
import { useCallback, useMemo, useRef, useState, type ComponentProps, type ComponentType, type ReactNode } from "react";
import { ActivityIndicator, Text, View, useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSafeRedirectPath } from "../../../packages/native-session/auth-redirect";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { isPersonalAccountRoute, StaffAccountScreen } from "./personal-account-entry";
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
import { connectTutorDiscussionImages, TutorDiscussionImages } from "../features/academic/tutor/discussion-images";
import { AdminOperationsScreen } from "../features/operations/AdminOperationsScreen";
import { academicRouteCanRead, productLocation, productNavigationHref, productQueryUpdate } from "./product-location";
import { legacyLiveHostPattern, tutorLiveDestination } from "./live-host-alias";
import { ProtectedInteractionContext } from "./protected-interaction";
import { publicWebsiteUrl } from "./public-website";
import { expoRouteHistory } from "./route-history-expo";
import { createDeferredSessionNavigation, nativeSessionNavigationStatus } from "./session-stack";
import { StaffChrome } from "./staff-chrome";

type Owner = "student" | "academic" | "operations";

function canOpenPath(path: string) {
  return getSafeRedirectPath(path) === path || publicWebsiteUrl(path) !== null;
}

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
    const local = { ...params, ...route.params, "#": params["#"] };
    if (pattern === legacyLiveHostPattern) {
      const id = "id" in local ? local.id : undefined;
      const destination = typeof id === "string" ? tutorLiveDestination(id) : null;
      return <Redirect href={(destination ?? "/") as Href} />;
    }
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
  const adminCourseFiles = owner === "academic" && (
    pattern === "/admin/courses/[slug]/videos" || pattern === "/admin/courses/[slug]/documents" || pattern === "/admin/courses/[slug]/review"
  );
  const studentAssessment = owner === "student" && (
    pattern === "/courses/[id]/quiz/[quizId]" || pattern === "/courses/[id]/tryout/[tryoutId]" ||
    pattern === "/courses/tutorial-pka/simulasi/[subject]/[stage]"
  );
  const studentReading = owner === "student" && (
    pattern === "/courses/[id]/material/[materialId]" || pattern === "/courses/tutorial-pka/material/[materialId]"
  );
  const personalAccount = owner === "student" && isPersonalAccountRoute(pattern);
  const access = useNativeRouteAccountContext(studentAssessment || studentReading || tutor || adminCourseFiles || personalAccount);
  const context = access.context;
  const devicePreferences = useDevicePreferences();
  const scheme = useColorScheme();
  const theme = devicePreferences.theme === "system" ? (scheme === "dark" ? "dark" : "light") : devicePreferences.theme;
  const locale = nativeUiLocale(state, context, authLocale());
  const navigationStatus = useCallback(() => {
    if (!screenNavigation.isFocused()) return "blocked";
    return nativeSessionNavigationStatus(state, transport, getSnapshot());
  }, [getSnapshot, screenNavigation, state, transport]);
  const canInteract = useCallback(() => !access.retaining && getSnapshot().state === state &&
    navigationStatus() === "ready", [access.retaining, getSnapshot, navigationStatus, state]);
  useFocusEffect(useCallback(() => deferredNavigation.cancel, [deferredNavigation]));
  const commitPath = useCallback((path: string, action: "push" | "replace" | "navigate" = "push") => {
    const target = productNavigationHref(path, randomUUID);
    if (!target) return;
    // A web handoff is transient. Preserve the native screen that opened it.
    router[target.website ? "push" : action](target.href as Href);
  }, [router]);
  const navigate = useCallback((path: string) => {
    if (!canOpenPath(path)) return;
    deferredNavigation.run(() => commitPath(path), navigationStatus);
  }, [commitPath, deferredNavigation, navigationStatus]);
  const back = useCallback((fallback = "/") => {
    deferredNavigation.run(() => {
      if (router.canGoBack()) router.back();
      else commitPath(fallback, "replace");
    }, navigationStatus);
  }, [commitPath, deferredNavigation, navigationStatus, router]);
  const navigateInScreen = useCallback((path: string, options?: { replace?: boolean }) => {
    if (!canOpenPath(path)) return;
    const update = publicWebsiteUrl(path) ? null : productQueryUpdate(pattern, href, path);
    if (update !== null && !Object.keys(update).length) return;
    // A Student submission may finish while the same session is being reverified.
    const waitForRefresh = studentAssessment && options?.replace;
    deferredNavigation.run(() => {
      if (update === null) commitPath(path, options?.replace ? "replace" : "push");
      else screenNavigation.dispatch(CommonActions.setParams(update));
    }, navigationStatus, waitForRefresh ? getPendingRefresh : undefined);
  }, [commitPath, deferredNavigation, getPendingRefresh, href, navigationStatus, pattern, screenNavigation, studentAssessment]);
  const replaceInScreen = useCallback((path: string) => navigateInScreen(path, { replace: true }), [navigateInScreen]);
  const visit = useCallback((path: string) => {
    if (!canOpenPath(path) || path === href.split(/[?#]/, 1)[0]) return;
    // The Tutor course picker can automatically open the only course after loading.
    deferredNavigation.run(() => commitPath(path, "navigate"), navigationStatus, tutor ? getPendingRefresh : undefined);
  }, [commitPath, deferredNavigation, getPendingRefresh, href, navigationStatus, tutor]);
  const loadTutorCourses = useCallback(async (signal: AbortSignal) => {
    if (!transport?.isCurrent() || !context?.roles.includes("tutor")) return [];
    const dashboard = await createAcademicClient(bindAcademicSession(transport, locale, "tutor")).tutor.dashboard(signal);
    if (!Array.isArray(dashboard.courses)) throw new Error("Invalid tutor course list");
    return dashboard.courses.filter(course => typeof course?.courseId === "string" && typeof course.title === "string");
  }, [context, locale, transport]);

  useFocusEffect(useCallback(() => {
    if (access.retaining || state.status !== "signed-in" || !transport || !context) return;
    expoRouteHistory.remember(transport.scope, context, href, () => navigationStatus() === "ready");
  }, [access.retaining, context, href, navigationStatus, owner, state, transport]));

  if (state.status === "signed-out") {
    return isFocused ? <Redirect href={authEntryHref({ entry: "sign-in", locale, next: href })} /> : null;
  }
  const learnerEntry = !personalAccount
    ? state.status === "signed-in" || (state.status === "unavailable" && state.offlineIdentity)
    : state.status === "signed-in" && context?.dashboard === "/dashboard" && context.roles.includes("murid") &&
      transport?.isCurrent() && context.accountId === transport.scope.accountId && context.sessionId === transport.scope.sessionId;
  if (owner === "student" && StudentScreen && learnerEntry) {
    const identity = state.status === "signed-in" ? state : state.status === "unavailable" ? state.offlineIdentity : null;
    return <RecheckingRoute enabled={studentAssessment || studentReading || personalAccount} checking={access.retaining} canInteract={canInteract}>
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
  const role = personalAccount
    ? context.dashboard === "/admin" ? "admin" : context.dashboard === "/tutor" ? "tutor" : "murid"
    : owner === "student" ? "murid" : tutor ? "tutor" : "admin";
  if (context.accountId !== transport.scope.accountId || context.sessionId !== transport.scope.sessionId ||
    !context.roles.includes(role)) return <SafeAreaView><Text accessibilityRole="alert">
    {locale === "en" ? "Access denied." : "Akses ditolak."}
  </Text><Button onPress={() => back()}>{locale === "en" ? "Back" : "Kembali"}</Button></SafeAreaView>;
  const accountKey = JSON.stringify([context.accountId, context.sessionId, locale]);
  if (role === "murid") return isFocused ? <StudentBrowserPage key={accountKey} locale={locale} href={href}
    canNavigate={() => navigationStatus() === "ready"} signOut={() => navigate("/sign-out")} /> : null;
  return <RecheckingRoute enabled={tutor || adminCourseFiles || personalAccount} checking={access.retaining} canInteract={canInteract}>
    <StaffChrome key={accountKey} role={role} href={href} theme={theme} focused={isFocused} context={context}
      checkingAccess={access.retaining} session={transport} visit={visit} back={back} loadTutorCourses={loadTutorCourses}>
      {personalAccount ? <StaffAccountScreen href={href} theme={theme} role={role} session={transport} context={context}
        canInteract={canInteract} focused={isFocused} devicePreferences={devicePreferences}
        navigate={navigateInScreen} replace={replaceInScreen} back={back} /> :
        owner === "academic" ? <AcademicRoute href={href} session={transport} accountId={context.accountId}
        role={role} locale={locale} navigate={navigateInScreen} replace={replaceInScreen}
        back={() => back(role === "admin" ? "/admin" : "/tutor")} theme={theme} /> :
        <AdminOperationsScreen href={href} session={transport} context={context} navigate={navigateInScreen} theme={theme} />}
    </StaffChrome>
  </RecheckingRoute>;
}

function RecheckingRoute({ enabled, checking, canInteract, children }: {
  enabled: boolean; checking: boolean; canInteract(): boolean; children: ReactNode;
}) {
  if (!enabled) return children;
  return <>
    <ProtectedInteractionContext.Provider value={{ suspended: checking, canInteract }}>
      <View style={checking ? { display: "none" } : { flex: 1 }}>{children}</View>
    </ProtectedInteractionContext.Provider>
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
  const transport = useMemo(() => bindAcademicSession(session, locale, role === "tutor" ? role : undefined), [session, locale, role]);
  const discussionImages = useMemo(() => role === "tutor" ? connectTutorDiscussionImages(session, locale) : null, [session, locale, role]);

  // Keep list filters on Back. Other Academic screens recheck their protected
  // resource from a fresh mount before displaying any previous result.
  if (!academicRouteCanRead(props.href, focused, focusedOnce.current)) return null;
  return <TutorDiscussionImages.Provider value={discussionImages}>
    <AcademicLiveScreen {...props} transport={transport} actor={{ id: accountId, role }} refresh={refresh} />
  </TutorDiscussionImages.Provider>;
}

function StudentBrowserPage({ locale, href, canNavigate, signOut }: {
  locale: "id" | "en"; href: string; canNavigate(): boolean; signOut(): void;
}) {
  const copy = authCopy[locale];
  const catalog = href.split(/[?#]/, 1)[0] === "/courses";
  const opening = useRef(false);
  const [status, setStatus] = useState<"idle" | "opening" | "failed">("idle");
  const open = async () => {
    if (opening.current || !canNavigate()) return;
    opening.current = true;
    setStatus("opening");
    try {
      await openBrowserAsync(new URL(href, NATIVE_STAGING_ORIGIN).href);
      setStatus("idle");
    } catch {
      setStatus("failed");
    } finally {
      opening.current = false;
    }
  };

  return <AuthPage title={copy.native.signedIn}>
    <AuthStatus>{copy.native.destinationUnavailable}</AuthStatus>
    {status === "failed" && <AuthStatus error>{catalog ? copy.native.catalogFailed : copy.native.dashboardFailed}</AuthStatus>}
    <Button isLoading={status === "opening"} onPress={() => void open()}>
      {catalog ? copy.native.openCatalog : copy.native.openDashboard}
    </Button>
    <Button variant="outline" disabled={status === "opening"} onPress={signOut}>{copy.signOut.title}</Button>
  </AuthPage>;
}
