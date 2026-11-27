import { publicMeetingPath } from "../../../../packages/meet/public-destination";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";

export type PublicMeeting = { status: "available"; title: string } | { status: "unavailable" } | { status: "error" };

export async function loadPublicMeeting(
  slug: string,
  signal: AbortSignal,
  send: (url: string, init: RequestInit) => Promise<Pick<Response, "status" | "headers" | "redirected" | "json">>,
): Promise<PublicMeeting> {
  const path = publicMeetingPath(slug);
  if (!path) return { status: "unavailable" };
  const request = new AbortController();
  const cancel = () => request.abort();
  if (signal.aborted) return { status: "error" };
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 12_000);
  try {
    const response = await send(NATIVE_STAGING_ORIGIN + "/api" + path, {
      signal: request.signal, credentials: "omit", redirect: "error", headers: { Accept: "application/json" },
    });
    if (response.redirected || response.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") {
      return { status: "error" };
    }
    const value: unknown = await response.json();
    if (request.signal.aborted || !value || typeof value !== "object") return { status: "error" };
    if (response.status === 404 && "error" in value && value.error === "meeting-unavailable") return { status: "unavailable" };
    if (response.status === 200 && "title" in value && typeof value.title === "string" && value.title.trim()) {
      return { status: "available", title: value.title };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
}
