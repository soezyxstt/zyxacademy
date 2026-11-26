import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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
    attempt: number;
    denied: boolean;
    context: NativeAccountContext | null;
  } | null>(null);
  useEffect(() => {
    if (!transport || revalidating) return;
    const request = new AbortController();
    const finish = (context: NativeAccountContext | null, denied = false) => {
      if (request.signal.aborted || !transport.isCurrent()) return;
      if (context || denied) void rememberAccountAccess(context, transport).catch(() => {});
      setResult({ state, attempt, context, denied });
    };
    void loadNativeAccountContext(transport, request.signal).then(finish, error => finish(null, error instanceof NativeAccountAccessDenied));
    return () => request.abort();
  }, [attempt, transport, state, revalidating, rememberAccountAccess]);
  const current = transport && !revalidating && result?.state === state && result.attempt === attempt ? result : null;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return <AccountContext.Provider value={{ context: current?.context ?? null,
    failed: current !== null && !current.context, denied: current?.denied ?? false, retry,
  }}>{children}</AccountContext.Provider>;
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
