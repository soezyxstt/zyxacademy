import { useCallback, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Redirect, useIsFocused, useNavigation, useRouter } from "expo-router";
import { Alert, Linking, Platform, Text, View } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import { authLocale } from "../../auth/auth-copy";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { scopedFiles } from "../../device/files";
import { useDeviceNotificationSettings } from "../../device/notifications-provider";
import { offlineDocumentHref } from "../../offline/library-model";
import { subscribeOfflineReadingChanges } from "../../offline/reading-events";
import { offlineReadingSessionBlocked } from "../../offline/reading-session-storage";
import { useOfflineReadingPackages } from "../../offline/reading-hooks";
import { useOfflineReadingSession } from "../../offline/use-reading-session";
import type { NativeOfflineLocale } from "../../offline/sync-contract";
import { useOfflineCourseMetadata } from "../../offline/lifecycle-provider";
import { studentBrowserNotificationsAction } from "./browser-handoff";
import { matchStudentRoute } from "./routes";
import { useAssessmentPhotos } from "./assessment/device";
import { useAssessmentDrafts } from "./assessment-drafts";
import { StudentEntry, type StudentEntryProps } from "./StudentEntry";
import { OfflineCourseScreen } from "./courses";
import { offlineCourseTarget, offlineLibraryHref, type OfflineLibraryTarget, type VerifiedOfflineMaterial } from "./offline-courses";
import { useOpenAuthorizedOfflineMaterial, useStudentOfflineCourses } from "./use-offline-courses";

const notBlocked = () => false;
const diktatPdfPolicy = { mimeTypes: ["application/pdf"], maxBytes: 50 * 1024 * 1024 } as const;
const discussionImagePolicy = { mimeTypes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 8 * 1024 * 1024 } as const;

export type VerifiedEntryProps = Omit<StudentEntryProps, "session" | "request" | "devicePush" | "openOfflineMaterial" | "saveDiktatPdf" | "shareDiscussionImage" | "pdfReader" | "focused" | "resultsTimeZone"> & {
  offlineLocale?: NativeOfflineLocale;
  openOfflineMaterial?: (material: VerifiedOfflineMaterial) => void | Promise<void>;
};

/** Mount below the application's session and notification providers, inside its route shell. */
export function VerifiedStudentEntry({ offlineLocale, openOfflineMaterial, ...props }: VerifiedEntryProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { state, transport, getSnapshot, refresh } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const push = useDeviceNotificationSettings();
  const courseIds = useMemo(() => {
    const route = matchStudentRoute(props.path);
    if (route?.params.id) return [route.params.id];
    return route?.pattern.startsWith("/courses/tutorial-pka") ? ["tutorial-pka"] : [];
  }, [props.path]);
  const storedLocale = state.status === "unavailable" ? state.offlineIdentity?.locale : undefined;
  const locale = context?.locale ?? storedLocale ?? offlineLocale ?? authLocale();
  const metadata = useOfflineCourseMetadata(courseIds, locale);
  const reading = useOfflineReadingSession(locale);
  const packages = useOfflineReadingPackages(locale);
  const openLibrary = props.openOfflineLibrary ?? ((target?: OfflineLibraryTarget) => router.push(offlineLibraryHref(locale, target)));
  const identity = transport?.scope ?? reading.scope;
  const identityKey = identity ? JSON.stringify([identity.origin, identity.accountId, identity.sessionId]) : "";
  const [revokedSession, setRevokedSession] = useState("");
  useLayoutEffect(() => {
    if (!identityKey) return;
    if (metadata.status === "revoked") setRevokedSession(identityKey);
    else if (metadata.status === "ready") setRevokedSession(current => current === identityKey ? "" : current);
  }, [identityKey, metadata.status]);
  const readBlocked = useCallback(() => Boolean(identity && offlineReadingSessionBlocked(identity)), [identity]);
  const blocked = useSyncExternalStore(subscribeOfflineReadingChanges, readBlocked, notBlocked);
  const revoked = blocked || metadata.status === "revoked" || Boolean(identityKey && revokedSession === identityKey && metadata.status !== "ready");
  const readingScope = revoked ? null : reading.scope;
  const target = useMemo(() => offlineCourseTarget(props.path), [props.path]);
  const saved = useStudentOfflineCourses({ scope: reading.offline ? readingScope : null, verifiedUntil: reading.verifiedUntil });
  const visibleCourses = reading.offline ? saved.courses : metadata.snapshot?.courses ?? [];
  const visibleMaterial = target.kind === "material" && visibleCourses.some(course => course.id === target.courseId
    && course.materials.filter(material => material.id === target.materialId).length === 1);
  const openSaved = useOpenAuthorizedOfflineMaterial({
    scope: visibleMaterial && packages.available ? readingScope : null,
    verifiedUntil: reading.verifiedUntil,
    target,
    readPackage: packages.read,
    open: openOfflineMaterial ?? (material => {
      if (navigation.isFocused()) router.push(offlineDocumentHref(locale, material.resource, material.section));
    }),
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

    if (target.kind === "library") return <Redirect href={offlineLibraryHref(locale)} />;

    return <OfflineCourseScreen
      key={JSON.stringify([identityKey, locale, props.entryKey])}
      {...props}
      target={target}
      courses={saved.courses}
      status={saved.status}
      locale={locale}
      openOfflineMaterial={openSaved}
      openOfflineLibrary={openLibrary}
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
  const showExternalError = () => {
    if (transport?.isCurrent()) Alert.alert(context.locale === "en" ? "Unable to open this link." : "Tautan belum dapat dibuka.");
  };
  const isTargetCurrent = () => {
    const current = getSnapshot();
    return navigation.isFocused() && current.state === state && current.transport === transport && !current.revalidating &&
      state.expiresAt > Date.now() && context.accountId === accountId && context.sessionId === sessionId;
  };
  const saveDiktatPdf: StudentEntryProps["saveDiktatPdf"] = (courseId, diktatId, signal) => scopedFiles.shareAuthorizedDownload({
    session: transport, target: { kind: "diktat-pdf", courseId, diktatId }, policy: diktatPdfPolicy, signal, isTargetCurrent,
  });
  const shareDiscussionImage: StudentEntryProps["shareDiscussionImage"] = (attachmentId, signal) => scopedFiles.shareAuthorizedDownload({
    session: transport, target: { kind: "discussion-image", attachmentId }, policy: discussionImagePolicy, signal, isTargetCurrent,
  });
  const pdfReader: StudentEntryProps["pdfReader"] = (Platform.OS === "android" || Platform.OS === "ios") ? {
    open: (target, signal) => scopedFiles.prepareMaterialPdf({ session: transport, target, signal, sessionExpiresAt: state.expiresAt, isTargetCurrent }),
    renew: (target, revision, signal) => scopedFiles.renewMaterialPdf({ session: transport, target, signal, sessionExpiresAt: state.expiresAt, isTargetCurrent }, revision),
  } : undefined;
  function openExternal(path: string) {
    try {
      const url = new URL(path, origin);
      if (url.protocol !== "https:" || url.username || url.password) { showExternalError(); return; }
      if (transport?.isCurrent()) void openBrowserAsync(url.href).catch(showExternalError);
    } catch { showExternalError(); }
  }
  const openBrowserNotifications = studentBrowserNotificationsAction({
    origin,
    platform: Platform.OS,
    isCurrent: () => transport.isCurrent(),
    openDefault: url => Linking.openURL(url),
    openExternal: props.openExternal,
    openProfile: props.openBrowserNotifications,
    onError: showExternalError,
  });
  return <StudentEntry {...props} focused={focused} openExternal={props.openExternal ?? openExternal} openBrowserNotifications={openBrowserNotifications} openOfflineMaterial={openSaved} openOfflineLibrary={target.kind === "course" || target.kind === "material" ? openLibrary : undefined} request={transport.request} devicePush={push} assessmentPhotos={props.assessmentPhotos ?? assessmentPhotos} drafts={props.drafts ?? drafts}
    pdfReader={pdfReader}
    saveDiktatPdf={Platform.OS === "android" || Platform.OS === "ios" ? saveDiktatPdf : undefined}
    shareDiscussionImage={Platform.OS === "android" || Platform.OS === "ios" ? shareDiscussionImage : undefined}
    offlineCourse={{ status: revoked ? "revoked" : metadata.status, course: revoked ? null : metadata.snapshot?.courses.find(course => course.id === courseIds[0]) ?? null, retry: metadata.retry }}
    session={{ role: "student", userId: accountId, origin, sessionId, locale: context.locale }}
    onLocaleChanged={locale => { props.onLocaleChanged?.(locale); retry(); }} />;
}
