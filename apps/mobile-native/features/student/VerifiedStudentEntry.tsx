import { Text, View } from "react-native";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { useNativeSession } from "../../auth/session-provider";
import { Button } from "../../components/Button";
import { useDeviceNotificationSettings } from "../../device/notifications-provider";
import { useAssessmentDrafts } from "./assessment-drafts";
import { StudentEntry, type StudentEntryProps } from "./StudentEntry";

type VerifiedEntryProps = Omit<StudentEntryProps, "session" | "request" | "devicePush">;

/** Mount below the application's session and notification providers, inside its route shell. */
export function VerifiedStudentEntry(props: VerifiedEntryProps) {
  const { state, transport } = useNativeSession();
  const { context, failed, retry } = useNativeAccountContext();
  const push = useDeviceNotificationSettings();
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
  return <StudentEntry {...props} request={transport.request} devicePush={push} drafts={props.drafts ?? drafts}
    session={{ role: "student", userId: accountId, origin, sessionId, locale: context.locale }}
    onLocaleChanged={locale => { props.onLocaleChanged?.(locale); retry(); }} />;
}
