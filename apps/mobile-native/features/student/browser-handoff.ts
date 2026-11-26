import { courseHref } from "../../../../packages/native-parity/student/learning/contracts";

export const studentBrowserNotificationsPath = "/settings/notifications/browser";

export function studentBrowserNotificationsUrl(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return new URL(studentBrowserNotificationsPath, url.origin).href;
  } catch {
    return null;
  }
}

export function studentBrowserNotificationsAction({
  origin, platform, isCurrent, openDefault, openProfile, openExternal, onError,
}: {
  origin: string;
  platform: string;
  isCurrent(): boolean;
  openDefault(url: string): Promise<unknown>;
  openProfile?: () => void;
  openExternal?: (path: string) => void;
  onError(): void;
}): (() => void) | undefined {
  const url = studentBrowserNotificationsUrl(origin);
  // Android HTTPS handlers may route the URL back into an installed app.
  if (!url || (!openProfile && !openExternal && platform !== "ios")) return undefined;
  return () => {
    if (!isCurrent()) return;
    try {
      if (openProfile) openProfile();
      else if (openExternal) openExternal(studentBrowserNotificationsPath);
      else void openDefault(url).catch(() => { if (isCurrent()) onError(); });
    } catch {
      if (isCurrent()) onError();
    }
  };
}

export function studentLiveBrowserPath(courseId: string): string {
  return courseHref(courseId, "/live");
}
