import { useMemo } from "react";
import { Alert, Linking, Platform } from "react-native";
import type { NativeAccountContext } from "../../../../../packages/native-session/context";
import { isPersonalAccountRoute } from "../../../../../packages/student-community/account-access";
import { useNativeAccountContext } from "../../../auth/use-account-context";
import { useDeviceNotificationSettings } from "../../../device/notifications-provider";
import type { NativeSessionTransport } from "../../../network/transport";
import type { StudentRouteProps } from "../../../routing/ProductRoute";
import { studentBrowserNotificationsAction } from "../browser-handoff";
import { matchStudentRoute } from "../routes";
import { bindStudentRequest } from "../transport";
import { CommunityScreen } from ".";
import { StudentAlerts } from "./alerts";

export function StaffAccountScreen({ href, theme, role, session, context, canInteract, focused, devicePreferences,
  navigate, replace, back }: Pick<StudentRouteProps, "href" | "theme" | "devicePreferences" | "navigate" | "replace" | "back"> & {
  role: "admin" | "tutor";
  session: NativeSessionTransport;
  context: NativeAccountContext;
  canInteract(): boolean;
  focused: boolean;
}) {
  const { retry } = useNativeAccountContext();
  const push = useDeviceNotificationSettings();
  const route = matchStudentRoute(href);
  const account = useMemo(() => ({
    role, origin: session.scope.origin, userId: context.accountId, sessionId: context.sessionId, locale: context.locale,
  }), [role, session, context.accountId, context.sessionId, context.locale]);
  const request = useMemo(() => bindStudentRequest(account, (path, init) => {
    if (!session.isCurrent() || (init?.method !== undefined && init.method !== "GET" && !canInteract())) {
      return Promise.reject(new Error("Account session changed"));
    }
    return session.request(path, { ...init, requiredRole: role });
  }), [account, session, canInteract, role]);
  if (!route || !isPersonalAccountRoute(route.pattern)) return null;
  const openBrowserNotifications = studentBrowserNotificationsAction({
    origin: account.origin, platform: Platform.OS, isCurrent: canInteract, openDefault: url => Linking.openURL(url),
    onError: () => Alert.alert(context.locale === "id" ? "Tautan belum dapat dibuka." : "Unable to open the link."),
  });
  return <StudentAlerts theme={theme}>
    <CommunityScreen route={route} session={account} request={request} focused={focused}
      initialScrollY={0} onScrollY={() => {}} devicePreferences={devicePreferences}
      navigate={navigate} replace={replace} back={() => back(context.dashboard)} onLocaleChanged={retry}
      openBrowserNotifications={openBrowserNotifications}
      devicePush={role === "tutor" ? {
        status: push.status, requestPermission: () => push.requestPermission(canInteract),
        refresh: () => canInteract() ? push.refresh() : Promise.resolve(null),
      } : undefined} />
  </StudentAlerts>;
}
