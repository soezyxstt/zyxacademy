import { useCallback, useEffect, useState } from "react";
import type { NativeAccountContext } from "../../../packages/native-session/context";
import { loadNativeAccountContext } from "../network/account-context";
import { useNativeSession } from "./session-provider";

export function useNativeAccountContext() {
  const { transport } = useNativeSession();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    transport: typeof transport;
    attempt: number;
    context: NativeAccountContext | null;
  } | null>(null);
  useEffect(() => {
    if (!transport) return;
    const request = new AbortController();
    const finish = (context: NativeAccountContext | null) => {
      if (!request.signal.aborted && transport.isCurrent()) setResult({ transport, attempt, context });
    };
    void loadNativeAccountContext(transport, request.signal).then(finish, () => finish(null));
    return () => request.abort();
  }, [attempt, transport]);
  const current = transport && result?.transport === transport && result.attempt === attempt ? result : null;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { context: current?.context ?? null, failed: current !== null && !current.context, retry };
}
