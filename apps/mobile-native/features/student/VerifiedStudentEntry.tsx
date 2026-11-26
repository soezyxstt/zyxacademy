import { useMemo } from "react";
import { Alert, Text, View } from "react-native";
import { openBrowserAsync } from "expo-web-browser";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { useDeviceNotificationSettings } from "../../device/notifications-provider";
import { useOfflineCourseMetadata } from "../../offline/lifecycle-provider";
import { matchStudentRoute } from "./routes";
import { useAssessmentPhotos } from "./assessment/device";
import { useAssessmentDrafts } from "./assessment-drafts";
import { StudentEntry, type StudentEntryProps } from "./StudentEntry";

type VerifiedEntryProps = Omit<StudentEntryProps, "session" | "request" | "devicePush">;

/** Mount below the application's session and notification providers, inside its route shell. */
export function VerifiedStudentEntry(props: VerifiedEntryProps) {
  const { state, transport } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const push = useDeviceNotificationSettings();
  const courseIds = useMemo(() => {
    const route = matchStudentRoute(props.path);
    if (route?.params.id) return [route.params.id];
    return route?.pattern.startsWith("/courses/tutorial-pka") ? ["tutorial-pka"] : [];
  }, [props.path]);
  const metadata = useOfflineCourseMetadata(courseIds, context?.locale ?? "id");
  const assessmentPhotos = useAssessmentPhotos(context?.roles.includes("murid") ? transport : null, context?.locale ?? "id");
  const drafts = useAssessmentDrafts(context?.roles.includes("murid") ? transport : null, context?.locale ?? "id");
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
  return <StudentEntry {...props} openExternal={props.openExternal ?? openExternal} request={transport.request} devicePush={push} assessmentPhotos={props.assessmentPhotos ?? assessmentPhotos} drafts={props.drafts ?? drafts}
    offlineCourse={{ status: metadata.status, course: metadata.snapshot?.courses.find(course => course.id === courseIds[0]) ?? null, retry: metadata.retry }}
    session={{ role: "student", userId: accountId, origin, sessionId, locale: context.locale }}
    onLocaleChanged={locale => { props.onLocaleChanged?.(locale); retry(); }} />;
}
