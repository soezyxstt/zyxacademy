import { resolvePublicShareUrl, type PublicLinkInput, type PublicLinkResult } from "../../../device/share-links";
import type { MeetingSpace } from "../../../../../packages/native-parity/operations/management-contract";

export function respondentLink(slug: string | undefined): string | null {
  return slug && /^[A-Za-z0-9_-]{1,256}$/.test(slug) ? `/f/${slug}` : null;
}

export function meetingLinks(space: Pick<MeetingSpace, "slug" | "meetingUri" | "hostEmail">) {
  const short = respondentLink(space.slug);
  const resolved = space.meetingUri && resolvePublicShareUrl(space.meetingUri);
  if (!resolved) return { short, host: null, publicUrl: null };
  const meeting = new URL(resolved);
  // A provisioned host identity belongs only on the official Google Meet destination.
  if (meeting.origin !== "https://meet.google.com") return { short, host: null, publicUrl: null };
  for (const name of Array.from(meeting.searchParams.keys())) {
    if (name.toLowerCase() === "authuser") meeting.searchParams.delete(name);
  }
  const publicUrl = meeting.href;
  if (space.hostEmail) meeting.searchParams.set("authuser", space.hostEmail);
  return { short, host: meeting.href, publicUrl };
}

type LinkAction = { kind: "open" | "share"; url: string; title?: string };
type LinkDevice = {
  open(url: string): Promise<{ type: string }>;
  share(input: PublicLinkInput): Promise<PublicLinkResult>;
};

export async function performManagementLink(action: LinkAction, origin: string, device: LinkDevice, isCurrent: () => boolean) {
  if (!isCurrent()) return "stale";
  const url = resolvePublicShareUrl(action.url, origin);
  if (!url) return "error";
  try {
    if (action.kind === "share") {
      const result = await device.share({ url, title: action.title ?? "Zyx Academy" });
      if (!isCurrent()) return "stale";
      return result.status === "finished" || result.status === "cancelled" ? result.status : "error";
    }
    const { type } = await device.open(url);
    if (!isCurrent()) return "stale";
    if (type === "cancel" || type === "dismiss") return "cancelled";
    return type === "opened" ? "finished" : "error";
  } catch {
    return isCurrent() ? "error" : "stale";
  }
}
