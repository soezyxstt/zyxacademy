import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useNativeSession } from "../auth/session-provider";
import type { NativePushStatus } from "./notifications-controller";
import { createExpoNotificationController } from "./notifications";

type DeviceNotificationSettings = {
  status: NativePushStatus | null;
  requestPermission(): Promise<NativePushStatus | null>;
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
  const [status, setStatus] = useState<NativePushStatus | null>(null);
  const activeTransport = state.status === "signed-in" ? transport : null;
  const loggingOut = state.status === "logout-pending";

  useEffect(() => {
    currentLocale.current = locale;
  }, [locale]);

  useEffect(() => {
    const instance = createExpoNotificationController({
      getLocale: () => currentLocale.current,
      onStatusChange: setStatus,
    });
    controller.current = instance;
    return () => {
      controller.current = null;
      instance.dispose();
    };
  }, []);

  useEffect(() => {
    if (!loggingOut) void controller.current?.setAccount(activeTransport);
  }, [activeTransport, loggingOut]);

  useEffect(() => subscribeBeforeLogout(async cleanupTransport => {
    await controller.current?.setAccount(null, cleanupTransport);
  }), [subscribeBeforeLogout]);

  return (
    <NotificationsContext.Provider value={{
      status: activeTransport ? status : null,
      requestPermission: () => activeTransport?.isCurrent()
        ? controller.current?.requestPermission() ?? Promise.resolve(null)
        : Promise.resolve(null),
      refresh: () => activeTransport?.isCurrent()
        ? controller.current?.sync() ?? Promise.resolve(null)
        : Promise.resolve(null),
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
