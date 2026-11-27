type NetworkObservation = { type?: string; isConnected?: boolean; isInternetReachable?: boolean };
type VerificationReason = "foreground" | "first-online" | "reconnect";
type ConnectivitySnapshot = { foreground: boolean; online: boolean | undefined };
export const initialConnectivity: ConnectivitySnapshot = { foreground: false, online: undefined };

export function observedConnectivity({ type, isConnected, isInternetReachable }: NetworkObservation) {
  if (!type || type === "UNKNOWN") return undefined;
  if (type === "NONE" || isConnected === false || isInternetReachable === false) return false;
  if (isConnected === true || isInternetReachable === true) return true;
  return undefined;
}

export function createNativeConnectivity({ reverify }: { reverify: (reason: VerificationReason) => void }) {
  let snapshot = initialConnectivity;
  const listeners = new Set<() => void>();

  function publish(next: ConnectivitySnapshot, reason?: VerificationReason) {
    snapshot = next;
    // Mark session revalidation before subscribers can initiate foreground work.
    if (reason) reverify(reason);
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    updateNetwork(network: NetworkObservation) {
      const online = observedConnectivity(network);
      if (online === undefined || online === snapshot.online) return;
      const reason = online && snapshot.foreground ? (snapshot.online === false ? "reconnect" : "first-online") : undefined;
      publish({ ...snapshot, online }, reason);
    },
    updateForeground(foreground: boolean) {
      if (foreground === snapshot.foreground) return;
      publish({ ...snapshot, foreground }, foreground ? "foreground" : undefined);
    },
  };
}
