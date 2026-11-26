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
    if (!isStudyReminderAccount(context)) {
      void expoReminders.clearSession(transport.scope).catch(() => {});
      return;
    }
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
  const { state, transport, revalidating, subscribeBeforeLocalLogout } = useNativeSession();

  useLayoutEffect(() => {
    if (!expoReminders.isSupported) return;
    return subscribeBeforeLocalLogout(expoReminders.clearSession);
  }, [subscribeBeforeLocalLogout]);

  useEffect(() => {
    if (!expoReminders.isSupported) return;
    if (transport && !revalidating) void expoReminders.clearOtherSessions(transport).catch(() => {});
    else if (state.status === "signed-out") void expoReminders.clearOtherSessions(null).catch(() => {});
  }, [transport, state.status, revalidating]);

  // The native session provider revalidates on foreground. Only Student routes
  // need a role lookup and then reschedule when that verified context changes.
  return expoReminders.isSupported && isStudyReminderPath(pathname) ? <StudentReminderRefresh /> : null;
}
