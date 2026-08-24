"use client";

/**
 * components/notifications/push-permission-init.tsx
 *
 * Client component that initialises FCM push notification permission
 * and token registration for authenticated users.
 *
 * Renders a custom Dialog to ask for consent before triggering the native prompt.
 *
 * Consent persistence strategy:
 * - localStorage "fcm_consent":
 *   - "granted"  -> FCM token is registered; never prompt again.
 *   - "denied"   -> the browser blocked notifications; never prompt again
 *                   (browsers do not allow re-prompting after a deny).
 *   - "later"    -> the user deferred; re-prompt after a cooldown (7 days).
 * - "fcm_later_at" stores the timestamp of the last deferral.
 *
 * Placed in the root layout so it runs on every page for authenticated users.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
import { useSession } from "@/lib/auth-client";

const CONSENT_KEY = "fcm_consent";
const LATER_AT_KEY = "fcm_later_at";
const LATER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export function PushPermissionInit() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (isPending || !session?.user) return;

    // Student-facing modal must never mount on admin surfaces or for admin users
    if (pathname.startsWith("/admin") || (session.user as { role?: string }).role === "admin") {
      return;
    }

    // Only run in a real browser with service worker support
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    const currentPermission = Notification.permission;

    if (currentPermission === "denied") {
      localStorage.setItem(CONSENT_KEY, "denied");
      return;
    }

    const storedConsent = localStorage.getItem(CONSENT_KEY);

    if (currentPermission === "granted") {
      // Returning user who already allowed it (or localStorage was cleared).
      localStorage.setItem(CONSENT_KEY, "granted");
      void initFCM(false);
      return;
    }

    // Permission is "default": only prompt if not in the "later" cooldown.
    if (storedConsent === "denied") return;

    if (storedConsent === "later") {
      const lastLater = Number(localStorage.getItem(LATER_AT_KEY) ?? 0);
      if (Date.now() - lastLater < LATER_COOLDOWN_MS) return;
    }

    // Delay slightly to avoid competing with the critical render path.
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isPending, session?.user]); // Re-run when the session loads

  const initFCM = async (requestPermission: boolean) => {
    try {
      // Lazy-import the client FCM helpers to avoid bundling them in the
      // server-side render path. These modules use browser APIs.
      const { requestNotificationPermission, getFCMToken, registerTokenToServer } =
        await import("@/lib/firebase/messaging");

      let permission = Notification.permission;
      if (requestPermission) {
        permission = await requestNotificationPermission();
        if (permission === "denied") {
          localStorage.setItem(CONSENT_KEY, "denied");
          return;
        }
        if (permission === "granted") {
          localStorage.setItem(CONSENT_KEY, "granted");
        }
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

  const handleLater = () => {
    setShowPrompt(false);
    localStorage.setItem(CONSENT_KEY, "later");
    localStorage.setItem(LATER_AT_KEY, String(Date.now()));
  };

  if (!showPrompt) return null;

  return (
    <Dialog
      open={showPrompt}
      onOpenChange={(open) => {
        if (!open) {
          handleLater();
        }
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader className="gap-3 sm:pr-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
            <BellIcon className="size-6 text-primary" />
          </div>
          <DialogTitle>Aktifkan Notifikasi</DialogTitle>
          <DialogDescription className="space-y-2 text-body-xs">
            <p>Dapatkan info terbaru seputar belajarmu dengan mengaktifkan notifikasi push. Kami akan memberitahumu tentang:</p>
            <ul className="list-disc pl-5 space-y-1 text-body-sm text-foreground">
              <li>Kuis baru yang siap dikerjakan</li>
              <li>Pengumuman dan jadwal sesi live</li>
              <li>Pembaruan materi di kelasmu</li>
            </ul>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 sm:justify-end">
          <Button variant="ghost" onClick={handleLater}>
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
