import type { NativeSessionScope } from "../network/transport";

export const LOCAL_REMINDER_PREFIX = "zyx-reminder-v1.";

export async function localReminderSessionPrefix(scope: NativeSessionScope, digest: (value: string) => Promise<string>) {
  const identity = await digest(JSON.stringify([scope.origin, scope.accountId, scope.sessionId]));
  return `${LOCAL_REMINDER_PREFIX}${identity}.`;
}
