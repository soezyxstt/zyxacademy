"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/client";
import { isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";
import {
  getClientPushRegistrationMeta,
  getUnifiedNotificationDeliveryStatus,
  registerUnifiedPushToken,
  requestUnifiedNotificationPermission,
} from "@/lib/native/notifications";
import {
  runTourNotificationSetup,
  type TourNotificationState,
} from "@/lib/onboarding/tour-notifications";
import { cn } from "@/lib/utils";

const bridge = {
  requestPermission: requestUnifiedNotificationPermission,
  readStatus: getUnifiedNotificationDeliveryStatus,
  registerToken: registerUnifiedPushToken,
};

export function TourNotificationSetup({
  userId,
  disabled = false,
  onComplete,
}: {
  userId: string | null;
  disabled?: boolean;
  onComplete: () => void;
}) {
  const t = useTranslations("onboarding.notifications");
  const eligibleUserId = disabled ? null : userId;
  const identityRef = useRef({ userId: eligibleUserId, active: false });
  if (identityRef.current.userId !== eligibleUserId) {
    identityRef.current = { userId: eligibleUserId, active: false };
  }
  const inFlight = useRef<object | null>(null);
  const [state, setState] = useState<TourNotificationState>("checking");
  const platform = getClientPushRegistrationMeta().platform;

  const run = useCallback(async (action: "enable" | "recheck") => {
    const identity = identityRef.current;
    if (!identity.active || !identity.userId || inFlight.current || isAccountTransitionPending()) return;
    const operation = {};
    inFlight.current = operation;
    const isCurrent = () => identity.active && identityRef.current === identity &&
      inFlight.current === operation && !isAccountTransitionPending();
    try {
      await runTourNotificationSetup({ action, userId: identity.userId, isCurrent, bridge, onState: setState });
    } finally {
      if (inFlight.current === operation) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    const identity = identityRef.current;
    identity.active = true;
    inFlight.current = null;
    void run("recheck");
    const unsubscribe = subscribeAccountTransition((pending) => {
      if (!identity.active || identityRef.current !== identity) return;
      // Invalidate the old request even if an account switch later gets cancelled.
      inFlight.current = null;
      if (!pending) void run("recheck");
    });
    return () => {
      identity.active = false;
      unsubscribe();
    };
  }, [eligibleUserId, run]);

  const busy = state === "checking" || state === "requesting" || state === "registering";
  const canComplete = state === "ready" || state === "denied" || state === "unsupported" || state === "transport_inactive";
  const canRecheck = state === "denied" || state === "transport_inactive" || state === "registration_failed" || state === "request_failed";
  const statusKey = {
    checking: "checking",
    permission_required: platform === "web" ? "permissionRequiredBrowser" : "permissionRequiredDevice",
    requesting: "requesting",
    registering: "registering",
    ready: "ready",
    denied: platform === "web" ? "deniedBrowser" : "deniedDevice",
    unsupported: "unsupported",
    registration_failed: "registrationFailed",
    transport_inactive: "transportInactive",
    request_failed: "requestFailed",
  }[state];
  const enableLabel = busy ? statusKey : state === "registration_failed" || state === "transport_inactive"
    ? "retryRegistration" : state === "denied" ? "enableAgain" : "enable";

  return (
    <section
      data-tour="notification-permission"
      data-tour-notification-state={state}
      aria-label={t("statusLabel")}
      aria-busy={busy}
      className="py-2"
    >
      <div role="status" className="flex items-start gap-2">
        {busy ? (
          <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
        ) : (
          <BellRing aria-hidden className={cn("mt-0.5 size-4 shrink-0", state === "ready" ? "text-status-success" : "text-muted-foreground")} />
        )}
        <p className={cn("text-body-sm", state === "ready" ? "text-status-success" : "text-foreground")}>
          {t(statusKey)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {state !== "ready" && state !== "unsupported" && !(state === "denied" && platform === "web") ? <Button
          type="button"
          data-tour-notification-action="enable"
          variant={canComplete ? "outline" : "default"}
          className="h-auto min-h-10 whitespace-normal text-body-sm"
          disabled={busy || disabled || !userId}
          onClick={() => void run("enable")}
        >
          {t(enableLabel)}
        </Button> : null}
        {canRecheck ? (
          <Button
            type="button"
            data-tour-notification-action="recheck"
            variant="outline"
            className="h-auto min-h-10 whitespace-normal text-body-sm"
            disabled={disabled || !userId}
            onClick={() => void run("recheck")}
          >
            {t("recheck")}
          </Button>
        ) : null}
        {canComplete ? (
          <Button
            type="button"
            data-tour-notification-action="complete"
            className="h-auto min-h-10 whitespace-normal text-body-sm"
            disabled={disabled || !userId}
            onClick={() => {
              if (identityRef.current.active && !inFlight.current && !isAccountTransitionPending()) onComplete();
            }}
          >
            {t("done")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
