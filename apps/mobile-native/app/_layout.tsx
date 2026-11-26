import { useFonts } from "expo-font";
import { Stack, type NavigationAction, type NavigationState } from "expo-router";
import { CommonActions } from "expo-router/react-navigation";
import { StatusBar } from "expo-status-bar";
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";

import { NativeAccountContextProvider, useNativeUiLocale } from "../auth/use-account-context";
import { NativeSessionProvider, useNativeSession } from "../auth/session-provider";
import { NATIVE_STAGING_ORIGIN } from "../auth/session-api";
import { startNativeFileCacheLifecycle } from "../device/files";
import { NotificationsProvider } from "../device/notifications-provider";
import { LocalReminderResponseLifecycle } from "../device/notification-response";
import { FormPhotoLifecycle } from "../device/photo-lifecycle";
import { LocalReminderLifecycle } from "../device/reminder-lifecycle";
import { DevicePreferencesProvider } from "../device/preferences-provider";
import { OfflineMetadataProvider } from "../offline/lifecycle-provider";
import { RouteHistoryLifecycle } from "../routing/route-history-expo";
import { isSessionRoute, navigationSessionKey, resetSessionStack } from "../routing/session-stack";
import { AssessmentDraftCleanup } from "../features/student/assessment-drafts";
import { nativeFontSources } from "../typography";

const RetiringStack = createContext(false);

function SessionStackLayout({ state, navigation, children }: {
  state: NavigationState;
  navigation: { dispatchSync(action: NavigationAction): void };
  children: ReactNode;
}) {
  const { state: session } = useNativeSession();
  const observed = navigationSessionKey(session);
  const [accepted, setAccepted] = useState(observed ?? null);
  const retiring = accepted !== null && observed !== undefined && accepted !== observed;

  useLayoutEffect(() => {
    if (observed === undefined || accepted === observed) return;
    if (retiring) {
      const reset = resetSessionStack(state, session.status === "logout-pending");
      if (reset) {
        navigation.dispatchSync({ ...CommonActions.reset(reset), target: state.key });
        return;
      }
    }
    setAccepted(observed);
  }, [accepted, navigation, observed, retiring, session.status, state]);

  return <RetiringStack.Provider value={retiring}>{children}</RetiringStack.Provider>;
}

function SessionStackEntry({ routeName, children }: { routeName: string; children: ReactNode }) {
  const retiring = useContext(RetiringStack);
  return retiring && isSessionRoute(routeName) ? null : children;
}

function AccountNotificationsProvider({ children }: { children: ReactNode }) {
  return <NotificationsProvider locale={useNativeUiLocale()}>{children}</NotificationsProvider>;
}

export default function RootLayout() {
  return <DevicePreferencesProvider><NativeAppLayout /></DevicePreferencesProvider>;
}

function NativeAppLayout() {
  const [fontsLoaded, fontError] = useFonts(nativeFontSources);
  useEffect(startNativeFileCacheLifecycle, []);

  if (fontError) {
    throw new Error("Font galeri tidak dapat dimuat.", { cause: fontError });
  }
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style="auto" />
      <NativeSessionProvider origin={NATIVE_STAGING_ORIGIN}>
        <FormPhotoLifecycle />
        <NativeAccountContextProvider>
          <AssessmentDraftCleanup />
          <LocalReminderLifecycle />
          <LocalReminderResponseLifecycle />
          <RouteHistoryLifecycle />
          <AccountNotificationsProvider>
            <OfflineMetadataProvider>
              <Stack screenOptions={{ headerShown: false, animation: "none" }}
                layout={props => <SessionStackLayout {...props} />}
                screenLayout={({ route, children }) => <SessionStackEntry routeName={route.name}>{children}</SessionStackEntry>} />
            </OfflineMetadataProvider>
          </AccountNotificationsProvider>
        </NativeAccountContextProvider>
      </NativeSessionProvider>
    </SafeAreaProvider>
  );
}
