import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { loadNativeAccountContext, NativeAccountAccessDenied } from "../network/account-context";
import { authLocale } from "./auth-copy";
import { useNativeSession } from "./session-provider";
import { nativeUiLocale } from "./ui-locale";

type AccountContextValue = {
  context: NativeAccountContext | null;
  failed: boolean;
  denied: boolean;
  retry(): void;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function NativeAccountContextProvider({ children }: { children: ReactNode }) {
  const { transport, state, revalidating, rememberAccountAccess } = useNativeSession();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    state: typeof state;
    transport: typeof transport;
    attempt: number;
    denied: boolean;
    context: NativeAccountContext | null;
  } | null>(null);
  useEffect(() => {
    if (!transport || revalidating) return;
    const request = new AbortController();
    const finish = (context: NativeAccountContext | null, denied = false) => {
      if (request.signal.aborted || !transport.isCurrent()) return;
      if (context || denied) void rememberAccountAccess(context, transport, state).catch(() => {});
      setResult({ state, transport, attempt, context, denied });
    };
    void loadNativeAccountContext(transport, request.signal).then(finish, error => finish(null, error instanceof NativeAccountAccessDenied));
    return () => request.abort();
  }, [attempt, transport, state, revalidating, rememberAccountAccess]);
  const sameTransport = !!result && result.transport === transport && transport?.isCurrent() && result.attempt === attempt;
  const current = sameTransport && !revalidating && result.state === state ? result : null;
  const rechecking = sameTransport && !current && state.status === "signed-in" && state.expiresAt > Date.now() &&
    result.context?.accountId === state.accountId && result.context.sessionId === state.sessionId ? result.context : null;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return <RecheckingAccountContext.Provider value={rechecking}>
    <AccountContext.Provider value={{ context: current?.context ?? null,
      failed: current !== null && !current.context, denied: current?.denied ?? false, retry,
    }}>{children}</AccountContext.Provider>
  </RecheckingAccountContext.Provider>;
}

const RecheckingAccountContext = createContext<NativeAccountContext | null>(null);

// Used only by an existing product screen. New routes still wait for verified
// account context, and a failed check or different transport retires this view.
export function useNativeRouteAccountContext(retainDuringRefresh: boolean) {
  const access = useNativeAccountContext();
  const rechecking = useContext(RecheckingAccountContext);
  const mounted = useRef<NativeAccountContext | null>(null);
  const retained = retainDuringRefresh && !access.context && rechecking === mounted.current ? rechecking : null;
  const context = access.context ?? retained;
  useLayoutEffect(() => { mounted.current = retainDuringRefresh ? context : null; }, [context, retainDuringRefresh]);
  return { ...access, context, retaining: retained !== null };
}

export function NativeRouteAccountContext({ context, children }: { context: NativeAccountContext | null; children: ReactNode }) {
  const access = useNativeAccountContext();
  return <AccountContext.Provider value={{ ...access, context }}>{children}</AccountContext.Provider>;
}

export function useNativeAccountContext() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("Provider akses akun belum dipasang.");
  return value;
}

export function useNativeUiLocale() {
  const { state } = useNativeSession();
  const { context } = useNativeAccountContext();
  return nativeUiLocale(state, context, authLocale());
}
