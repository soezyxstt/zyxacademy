import type {
  UnifiedNotificationDeliveryStatus,
  UnifiedNotificationPermission,
} from "@/lib/native/notifications";

export type TourNotificationState =
  | "checking"
  | "permission_required"
  | "requesting"
  | "registering"
  | "ready"
  | "denied"
  | "unsupported"
  | "registration_failed"
  | "transport_inactive"
  | "request_failed";

export type TourNotificationBridge = {
  requestPermission: () => Promise<UnifiedNotificationPermission>;
  readStatus: () => Promise<UnifiedNotificationDeliveryStatus>;
  registerToken: (userId: string, isCurrent: () => boolean) => Promise<boolean>;
};

function permissionState(permission: UnifiedNotificationPermission): TourNotificationState | null {
  if (permission === "unsupported") return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "default") return "permission_required";
  return null;
}

function deliveryState(status: UnifiedNotificationDeliveryStatus): TourNotificationState {
  const permission = permissionState(status.osPermission === "prompt" ? "default" : status.osPermission);
  if (permission) return permission;
  if (!status.registered) return "registration_failed";
  return status.transportActive ? "ready" : "transport_inactive";
}

/** No permission prompt occurs during a status check. Enable calls the bridge before any await. */
export async function runTourNotificationSetup(input: {
  action: "enable" | "recheck";
  userId: string;
  isCurrent: () => boolean;
  bridge: TourNotificationBridge;
  onState: (state: TourNotificationState) => void;
}): Promise<TourNotificationState | null> {
  const { action, userId, isCurrent, bridge, onState } = input;
  const publish = (state: TourNotificationState) => {
    if (!isCurrent()) return null;
    onState(state);
    return state;
  };
  if (!isCurrent()) return null;

  let granted = false;
  try {
    let permission: UnifiedNotificationPermission;
    if (action === "enable") {
      publish("requesting");
      // Keep this in the originating click stack, including on Safari and native wrappers.
      permission = await bridge.requestPermission();
    } else {
      publish("checking");
      const status = await bridge.readStatus();
      permission = status.osPermission === "prompt" ? "default" : status.osPermission;
    }
    if (!isCurrent()) return null;
    const permissionResult = permissionState(permission);
    if (permissionResult) return publish(permissionResult);

    granted = true;
    publish("registering");
    // A permission grant alone does not prove that this device can receive push messages.
    const registered = await bridge.registerToken(userId, isCurrent);
    if (!isCurrent()) return null;
    if (!registered) return publish("registration_failed");
    const status = await bridge.readStatus();
    return publish(deliveryState(status));
  } catch {
    return publish(granted ? "registration_failed" : "request_failed");
  }
}

/** Reuse the existing consent cooldown when the user skips this optional setup. */
export function deferTourNotifications(
  storage?: Pick<Storage, "setItem">,
  now = Date.now(),
): void {
  try {
    const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
    target?.setItem("fcm_consent", "later");
    target?.setItem("fcm_later_at", String(now));
  } catch {
    // Restricted browser storage must not prevent the user from leaving the tour.
  }
}
