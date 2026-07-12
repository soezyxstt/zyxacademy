"use client";

/**
 * components/notifications/push-permission-init.tsx
 *
 * Client component that initialises FCM push notification permission
 * and token registration on the user's first authenticated page load.
 *
 * Renders a custom Dialog to ask for consent before triggering the native prompt.
 *
 * Consent persistence strategy:
 * - "fcm_consent" in localStorage stores "granted" | "denied".
 * - If already set, this component does nothing (no re-prompts).
 * - On permission granted, obtains an FCM token and registers it with the server.
 * - On permission denied, stores "denied" so we stop prompting.
 *
 * Placed in the root layout so it runs on every page for authenticated users.
 * The component checks for a session before doing anything.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellIcon } from "lucide-react";

const CONSENT_KEY = "fcm_consent";

export function PushPermissionInit() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only run in a real browser with service worker support
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    // If we already have a stored consent decision, respect it
    const storedConsent = localStorage.getItem(CONSENT_KEY);
    if (storedConsent === "denied") return;

    // If permission is already granted (e.g. returning user, no localStorage yet),
    // skip the prompt and just ensure the token is registered.
    const currentPermission = Notification.permission;

    if (currentPermission === "denied") {
      localStorage.setItem(CONSENT_KEY, "denied");
      return;
    }

    if (currentPermission === "granted") {
      initFCM(false);
      return;
    }

    // If granted or default ; proceed (will prompt only if "default")
    // Delay slightly to avoid competing with the critical render path
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  const initFCM = async (requestPermission: boolean) => {
    try {
      // Lazy-import the client FCM helpers to avoid bundling them in the
      // server-side render path. These modules use browser APIs.
      const { requestNotificationPermission, getFCMToken, registerTokenToServer } =
        await import("@/lib/firebase/messaging");

      let permission = Notification.permission;
      if (requestPermission) {
        permission = await requestNotificationPermission();
        localStorage.setItem(CONSENT_KEY, permission);
      }

      if (permission !== "granted") return;

      const token = await getFCMToken();
      if (!token) return;

      await registerTokenToServer(token);
    } catch (err) {
      // Non-fatal ; push notifications are enhancement, not core functionality
      console.warn("[FCM] Init error:", err);
    }
  };

  const handleAccept = async () => {
    setShowPrompt(false);
    await initFCM(true);
  };

  const handleDecline = () => {
"use client";

/**
 * components/notifications/push-permission-init.tsx
 *
 * Client component that initialises FCM push notification permission
 * and token registration on the user's first authenticated page load.
 *
 * Renders a custom Dialog to ask for consent before triggering the native prompt.
 *
 * Consent persistence strategy:
 * - "fcm_consent" in localStorage stores "granted" | "denied".
 * - If already set, this component does nothing (no re-prompts).
 * - On permission granted, obtains an FCM token and registers it with the server.
 * - On permission denied, stores "denied" so we stop prompting.
 *
 * Placed in the root layout so it runs on every page for authenticated users.
 * The component checks for a session before doing anything.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BellIcon } from "lucide-react";

const CONSENT_KEY = "fcm_consent";

export function PushPermissionInit() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Only run in a real browser with service worker support
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    // If we already have a stored consent decision, respect it
    const storedConsent = localStorage.getItem(CONSENT_KEY);
    if (storedConsent === "denied") return;

    // If permission is already granted (e.g. returning user, no localStorage yet),
    // skip the prompt and just ensure the token is registered.
    const currentPermission = Notification.permission;

    if (currentPermission === "denied") {
      localStorage.setItem(CONSENT_KEY, "denied");
      return;
    }

    if (currentPermission === "granted") {
      initFCM(false);
      return;
    }

    // If granted or default ; proceed (will prompt only if "default")
    // Delay slightly to avoid competing with the critical render path
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []); // Run once on mount

  const initFCM = async (requestPermission: boolean) => {
    try {
      // Lazy-import the client FCM helpers to avoid bundling them in the
      // server-side render path. These modules use browser APIs.
      const { requestNotificationPermission, getFCMToken, registerTokenToServer } =
        await import("@/lib/firebase/messaging");

      let permission = Notification.permission;
      if (requestPermission) {
        permission = await requestNotificationPermission();
        localStorage.setItem(CONSENT_KEY, permission);
      }

      if (permission !== "granted") return;

      const token = await getFCMToken();
      if (!token) return;

      await registerTokenToServer(token);
    } catch (err) {
      // Non-fatal ; push notifications are enhancement, not core functionality
      console.warn("[FCM] Init error:", err);
    }
  };

  const handleAccept = async () => {
    setShowPrompt(false);
    await initFCM(true);
  };

  const handleDecline = () => {
    setShowPrompt(false);
    localStorage.setItem(CONSENT_KEY, "denied");
  };

  if (!showPrompt) return null;

  return (
    <Dialog
      open={showPrompt}
      onOpenChange={(open) => {
        if (!open) {
          handleDecline();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="gap-3 sm:pr-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <BellIcon className="size-6 text-primary" />
          </div>
          <DialogTitle>Aktifkan Notifikasi</DialogTitle>
          <DialogDescription className="space-y-2 text-body-base">
            <p>Dapatkan info terbaru seputar belajarmu dengan mengaktifkan notifikasi push. Kami akan memberitahumu tentang:</p>
            <ul className="list-disc pl-5 space-y-1 text-body-sm text-foreground">
              <li>Pengumuman baru dan pembaruan materi</li>
              <li>Kuis dan tugas yang akan datang</li>
              <li>Pengingat untuk menjaga *streak* belajarmu</li>
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 sm:justify-end">
          <Button variant="ghost" onClick={handleDecline}>
            Nanti Saja
          </Button>
          <Button onClick={handleAccept}>
            Izinkan Notifikasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
