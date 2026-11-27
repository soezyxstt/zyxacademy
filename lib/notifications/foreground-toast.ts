import type { toast as SonnerToast } from "sonner";

export const FOREGROUND_NOTIFICATION_DURATION_MS = 5000;

type ToastId = string | number;

/** Passive inbox notices must expire even when Sonner pauses on hover or focus. */
export function createForegroundNotificationToasts(toast: typeof SonnerToast) {
  const timers = new Map<ToastId, ReturnType<typeof setTimeout>>();

  const clear = (id: ToastId) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  };

  return {
    show(title: string, body?: string) {
      const id = toast(title, {
        description: body,
        duration: FOREGROUND_NOTIFICATION_DURATION_MS,
        onDismiss: notice => clear(notice.id),
        onAutoClose: notice => clear(notice.id),
      });
      timers.set(id, setTimeout(() => {
        clear(id);
        toast.dismiss(id);
      }, FOREGROUND_NOTIFICATION_DURATION_MS));
      return id;
    },
    dispose() {
      for (const id of timers.keys()) {
        clear(id);
        toast.dismiss(id);
      }
    },
  };
}
