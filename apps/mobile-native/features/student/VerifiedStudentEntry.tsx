import { useLayoutEffect, useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import { authLocale } from "../../auth/auth-copy";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { useDeviceNotificationSettings } from "../../device/notifications-provider";
import { useOfflineReadingSession } from "../../offline/use-reading-session";
import type { NativeOfflineLocale } from "../../offline/sync-contract";
import { useOfflineCourseMetadata } from "../../offline/lifecycle-provider";
import { matchStudentRoute } from "./routes";
import { useAssessmentPhotos } from "./assessment/device";
import { useAssessmentDrafts } from "./assessment-drafts";
import { StudentEntry, type StudentEntryProps } from "./StudentEntry";
import { OfflineCourseScreen } from "./courses";
import { offlineCourseTarget, type AuthorizedOfflineMaterial } from "./offline-courses";
import { useOpenAuthorizedOfflineMaterial, useStudentOfflineCourses } from "./use-offline-courses";

export type VerifiedEntryProps = Omit<StudentEntryProps, "session" | "request" | "devicePush" | "openOfflineMaterial"> & {
  offlineLocale?: NativeOfflineLocale;
  openOfflineMaterial?: (material: AuthorizedOfflineMaterial) => void | Promise<void>;
};

/** Mount below the application's session and notification providers, inside its route shell. */
export function VerifiedStudentEntry({ offlineLocale, openOfflineMaterial, ...props }: VerifiedEntryProps) {
  const { state, transport, refresh } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const push = useDeviceNotificationSettings();
  const courseIds = useMemo(() => {
    const route = matchStudentRoute(props.path);
    if (route?.params.id) return [route.params.id];
    return route?.pattern.startsWith("/courses/tutorial-pka") ? ["tutorial-pka"] : [];
  }, [props.path]);
  const locale = context?.locale ?? offlineLocale ?? authLocale();
  const metadata = useOfflineCourseMetadata(courseIds, locale);
  const reading = useOfflineReadingSession(locale);
  const identity = transport?.scope ?? reading.scope;
  const identityKey = identity ? JSON.stringify([identity.origin, identity.accountId, identity.sessionId]) : "";
  const [revokedSession, setRevokedSession] = useState("");
  useLayoutEffect(() => {
    if (!identityKey) return;
    if (metadata.status === "revoked") setRevokedSession(identityKey);
    else if (metadata.status === "ready") setRevokedSession(current => current === identityKey ? "" : current);
  }, [identityKey, metadata.status]);
  const revoked = metadata.status === "revoked" || Boolean(identityKey && revokedSession === identityKey && metadata.status !== "ready");
  const readingScope = revoked ? null : reading.scope;
  const target = useMemo(() => offlineCourseTarget(props.path), [props.path]);
  const saved = useStudentOfflineCourses({ scope: reading.offline ? readingScope : null, verifiedUntil: reading.verifiedUntil });
  const visibleCourses = reading.offline ? saved.courses : metadata.snapshot?.courses ?? [];
  const visibleMaterial = target.kind === "material" && visibleCourses.some(course => course.id === target.courseId
    && course.materials.filter(material => material.id === target.materialId).length === 1);
  const openSaved = useOpenAuthorizedOfflineMaterial({
    scope: visibleMaterial ? readingScope : null, verifiedUntil: reading.verifiedUntil, target, open: openOfflineMaterial,
    onUnavailable: () => {
      Alert.alert(locale === "en" ? "The saved material is unavailable." : "Materi tersimpan tidak tersedia.");
      if (reading.offline) void saved.retry();
      else void metadata.retry();
    },
  });
  const assessmentPhotos = useAssessmentPhotos(context?.roles.includes("murid") ? transport : null, context?.locale ?? "id");
  const drafts = useAssessmentDrafts(context?.roles.includes("murid") ? transport : null, context?.locale ?? "id");
  if (reading.offline) {
    if (!readingScope) return <View>
      <Text accessibilityLiveRegion="polite">{locale === "en" ? "No verified offline access." : "Akses offline belum dapat diverifikasi."}</Text>
      <Button onPress={() => void refresh()}>{locale === "en" ? "Try again" : "Coba lagi"}</Button>
    </View>;

    return <OfflineCourseScreen
      key={JSON.stringify([identityKey, locale, props.entryKey])}
      {...props}
      target={target}
      courses={saved.courses}
      status={saved.status}
      locale={locale}
      openOfflineMaterial={openSaved}
      retry={() => { void saved.retry(); void refresh(); }}
    />;
  }
  if (state.status !== "signed-in" || !transport?.isCurrent()) {
    return <Text accessibilityLiveRegion="polite">{state.status === "loading" ? "Memeriksa sesi…" : "Masuk untuk membuka kursus."}</Text>;
  }
  if (failed) return <View><Text accessibilityRole="alert">Akses belum dapat diperiksa.</Text><Button onPress={retry}>Coba lagi</Button></View>;
  if (!context) return <Text accessibilityRole="progressbar">Memeriksa akses…</Text>;
  if (!context.roles.includes("murid")) return <Text accessibilityRole="alert">
    {context.locale === "en" ? "Sign in with a student account." : "Masuk dengan akun peserta."}
  </Text>;
  const { origin, accountId, sessionId } = transport.scope;
  function openExternal(path: string) {
    const showError = () => {
      if (transport?.isCurrent()) Alert.alert(context?.locale === "en" ? "Unable to open this link." : "Tautan belum dapat dibuka.");
    };
    try {
      const url = new URL(path, origin);
      if (url.protocol !== "https:" || url.username || url.password) { showError(); return; }
      if (transport?.isCurrent()) void openBrowserAsync(url.href).catch(showError);
    } catch { showError(); }
  }
  return <StudentEntry {...props} openExternal={props.openExternal ?? openExternal} openOfflineMaterial={openSaved} request={transport.request} devicePush={push} assessmentPhotos={props.assessmentPhotos ?? assessmentPhotos} drafts={props.drafts ?? drafts}
    offlineCourse={{ status: revoked ? "revoked" : metadata.status, course: revoked ? null : metadata.snapshot?.courses.find(course => course.id === courseIds[0]) ?? null, retry: metadata.retry }}
    session={{ role: "student", userId: accountId, origin, sessionId, locale: context.locale }}
    onLocaleChanged={locale => { props.onLocaleChanged?.(locale); retry(); }} />;
}
