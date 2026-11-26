export type PublicLinkInput = { url: string; origin?: string; title: string; text?: string; dialogTitle?: string };
export type PublicLinkResult = { status: "finished" | "cancelled" | "unavailable" }
  | { status: "error"; issue: "invalid-url" | "share" };

type PublicLinkDevice = {
  platform: "ios" | "android" | "unavailable";
  dismissedAction: string;
  share(content: { url?: string; title: string; message?: string }, dialogTitle: string): Promise<{ action: string }>;
};

export function resolvePublicShareUrl(input: string, origin?: string): string | null {
  const value = input.trim();
  if (!value || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = value.startsWith("/") ? new URL(value, origin) : new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function createPublicLinkSharer(device: PublicLinkDevice) {
  return async ({ url: input, origin, title: rawTitle, text, dialogTitle }: PublicLinkInput): Promise<PublicLinkResult> => {
    const url = resolvePublicShareUrl(input, origin);
    if (!url) return { status: "error", issue: "invalid-url" };
    if (device.platform === "unavailable") return { status: "unavailable" };
    const title = rawTitle.trim() || "Zyx Academy";
    const message = text?.trim();
    const content = device.platform === "ios"
      ? { title, message, url }
      : { title, message: [message, url].filter(Boolean).join("\n") };
    try {
      const result = await device.share(content, dialogTitle?.trim() || title);
      return { status: result.action === device.dismissedAction ? "cancelled" : "finished" };
    } catch {
      return { status: "error", issue: "share" };
    }
  };
}
