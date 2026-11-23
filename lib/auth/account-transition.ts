import { AccountSwitchError, accountSwitchError } from "./account-switch-contract";
import { announceAccountTransitionCommitted, isAccountTransitionPending, setAccountTransitionPending } from "./account-transition-state";

export interface AccountTransitionDependencies {
  isOnline: () => boolean;
  hasPendingChanges: () => boolean;
  currentUserId: () => Promise<string | null>;
  rememberCurrent: () => Promise<void>;
  cancelRequests: () => Promise<void>;
  detachPush: (userId: string | null) => Promise<() => Promise<void>>;
  commit: (userId: string | null) => Promise<void>;
  resume: () => void;
  reload: () => void;
}

/** A successful transition keeps writers paused until the caller loads the new account. */
export async function prepareAccountTransition(deps: AccountTransitionDependencies) {
  if (isAccountTransitionPending()) throw new AccountSwitchError("BUSY");
  if (!deps.isOnline()) throw new AccountSwitchError("OFFLINE");
  if (deps.hasPendingChanges()) throw new AccountSwitchError("PENDING_CHANGES");
  setAccountTransitionPending(true);
  let previousUserId: string | null = null;
  let restorePush: (() => Promise<void>) | undefined;
  try {
    previousUserId = await deps.currentUserId();
    await deps.rememberCurrent();
    await deps.cancelRequests();
    restorePush = await deps.detachPush(previousUserId);
  } catch (error) {
    setAccountTransitionPending(false);
    deps.resume();
    throw accountSwitchError(error);
  }

  return {
    previousUserId,
    async depart() {
      await deps.commit(previousUserId);
    },
    async complete(userId: string | null) {
      announceAccountTransitionCommitted();
      try {
        await deps.commit(userId);
      } catch {
        deps.reload();
        throw new AccountSwitchError("SWITCH_FAILED");
      }
    },
    async fail(error: unknown, operationStarted = true): Promise<string> {
      if (operationStarted) {
        let actualUserId: string | null;
        try {
          actualUserId = await deps.currentUserId();
        } catch {
          // An interrupted response may already have changed HttpOnly cookies. Keep
          // writers paused and reload so stale identity cannot write as another user.
          announceAccountTransitionCommitted();
          deps.reload();
          throw accountSwitchError(error);
        }
        if (actualUserId !== previousUserId) {
          announceAccountTransitionCommitted();
          try {
            await deps.commit(actualUserId);
          } catch {
            deps.reload();
            throw new AccountSwitchError("SWITCH_FAILED");
          }
          if (actualUserId) return actualUserId;
          deps.reload();
          throw new AccountSwitchError("SESSION_EXPIRED");
        }
      }
      await restorePush?.().catch(() => {});
      setAccountTransitionPending(false);
      deps.resume();
      throw accountSwitchError(error);
    },
  };
}

export async function runAccountTransition(
  operation: () => Promise<string>,
  deps: AccountTransitionDependencies,
): Promise<string> {
  const transition = await prepareAccountTransition(deps);
  let userId: string;
  try {
    userId = await operation();
    if (!userId) throw new AccountSwitchError("SWITCH_FAILED");
  } catch (error) {
    return transition.fail(error);
  }
  await transition.complete(userId);
  return userId;
}
