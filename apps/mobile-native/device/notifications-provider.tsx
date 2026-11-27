import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useNativeSession } from "../auth/session-provider";
import type { NativeSessionTransport } from "../network/transport";
import type { NativePushStatus } from "./notifications-controller";
import { createExpoNotificationController } from "./notifications";

type DeviceNotificationSettings = {
  status: NativePushStatus | null;
  requestPermission(canPrompt?: () => boolean): Promise<NativePushStatus | null>;
  refresh(): Promise<NativePushStatus | null>;
};

const NotificationsContext = createContext<DeviceNotificationSettings | null>(null);

export function NotificationsProvider({
  children,
  locale = "id",
}: {
  children: ReactNode;
  locale?: "id" | "en";
}) {
  const { state, transport, subscribeBeforeLogout } = useNativeSession();
  const controller = useRef<ReturnType<typeof createExpoNotificationController> | null>(null);
  const currentLocale = useRef(locale);
  const attached = useRef<NativeSessionTransport | null>(null);
  const [observation, setObservation] = useState<{
    transport: NativeSessionTransport | null;
    status: NativePushStatus | null;
  } | null>(null);
  const activeTransport = state.status === "signed-in" ? transport : null;
  const loggingOut = state.status === "logout-pending";

  useEffect(() => {
    currentLocale.current = locale;
  }, [locale]);

  useEffect(() => {
    const instance = createExpoNotificationController({
      getLocale: () => currentLocale.current,
      onStatusChange: status => setObservation({ transport: attached.current, status }),
    });
    controller.current = instance;
    return () => {
      controller.current = null;
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    if (!loggingOut) {
      attached.current = activeTransport;
      void controller.current?.setAccount(activeTransport);
    }
  }, [activeTransport, loggingOut]);

  useEffect(() => subscribeBeforeLogout(async cleanupTransport => {
    attached.current = null;
    if (await controller.current?.setAccount(null, cleanupTransport) === false) {
      throw new Error("Pendaftaran notifikasi akun sebelumnya belum dapat dilepas.");
    }
  }), [subscribeBeforeLogout]);

  const currentController = () => activeTransport?.isCurrent() && attached.current === activeTransport
    ? controller.current : null;
  return (
    <NotificationsContext.Provider value={{
      status: activeTransport && observation?.transport === activeTransport ? observation.status : null,
      requestPermission: canPrompt => currentController()?.requestPermission(canPrompt) ?? Promise.resolve(null),
      refresh: () => currentController()?.sync() ?? Promise.resolve(null),
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useDeviceNotificationSettings() {
  const settings = useContext(NotificationsContext);
  if (!settings) throw new Error("NotificationsProvider is required for device notification settings.");
  return settings;
}
