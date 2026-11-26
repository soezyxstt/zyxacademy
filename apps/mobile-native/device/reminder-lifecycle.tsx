import { usePathname } from "expo-router";
import { useEffect, useLayoutEffect } from "react";

import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { isStudyReminderAccount, isStudyReminderPath } from "./reminder-eligibility";
import { expoReminders } from "./reminders";

function StudentReminderRefresh() {
  const { transport } = useNativeSession();
  const { context } = useNativeAccountContext();

  useEffect(() => {
    if (!transport || !context || !transport.isCurrent()) return;
    if (!isStudyReminderAccount(context)) return;
    const { locale } = context;
    let disposed = false;
    void (async () => {
      await expoReminders.clearOtherSessions(transport);
      if (disposed || !transport.isCurrent()) return;
      await expoReminders.syncStudy(transport, locale);
      if (disposed || !transport.isCurrent()) return;
      await expoReminders.refreshTutorSessions(transport, locale);
    })().catch(() => {});
    return () => { disposed = true; };
  }, [transport, context]);

  return null;
}

export function LocalReminderLifecycle() {
  const pathname = usePathname();
  const { context, denied } = useNativeAccountContext();
  const { state, transport, revalidating, subscribeBeforeLocalLogout } = useNativeSession();

  useLayoutEffect(() => {
    if (!expoReminders.isSupported) return;
    return subscribeBeforeLocalLogout(expoReminders.clearSession);
  }, [subscribeBeforeLocalLogout]);

  useEffect(() => {
    if (!expoReminders.isSupported) return;
    if (transport && !revalidating) {
      void expoReminders.clearOtherSessions(transport).catch(() => {});
      if (denied || (context && !isStudyReminderAccount(context))) {
        void expoReminders.clearSession(transport.scope).catch(() => {});
      }
    }
    else if (state.status === "signed-out") void expoReminders.clearOtherSessions(null).catch(() => {});
  }, [transport, state.status, revalidating, context, denied]);

  // The native session provider revalidates on foreground. Only Student routes
  // reschedule after the shared account context confirms eligibility.
  return expoReminders.isSupported && isStudyReminderPath(pathname) ? <StudentReminderRefresh /> : null;
}
