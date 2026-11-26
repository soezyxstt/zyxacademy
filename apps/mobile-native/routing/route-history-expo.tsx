import Storage from "expo-sqlite/kv-store";
import { useLayoutEffect } from "react";

import { useNativeSession } from "../auth/session-provider";
import { useNativeAccountContext } from "../auth/use-account-context";
import { createExpoRouteHistory } from "./route-history";

const key = "zyx-native-last-product-route-v1";
export const expoRouteHistory = createExpoRouteHistory({
  read: () => Storage.getItemSync(key),
  write: value => Storage.setItemSync(key, value),
  remove: () => Storage.removeItemSync(key),
});

export function RouteHistoryLifecycle() {
  const { transport, subscribeBeforeLocalLogout } = useNativeSession();
  const { denied } = useNativeAccountContext();
  useLayoutEffect(() => subscribeBeforeLocalLogout(scope => { expoRouteHistory.clear(scope); }), [subscribeBeforeLocalLogout]);
  useLayoutEffect(() => {
    if (denied && transport?.isCurrent()) expoRouteHistory.clear(transport.scope);
  }, [denied, transport]);
  return null;
}
