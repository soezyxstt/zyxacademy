import { isValidHttpUrl } from "../../../../lib/links";
import type { PublicLink } from "../../../../packages/public-links/directory";
import { NATIVE_STAGING_ORIGIN } from "../../auth/session-api";

function isPublicLink(value: unknown): value is PublicLink {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.title === "string" &&
    typeof row.url === "string" && ["category", "description", "icon", "color"]
      .every(key => row[key] === null || typeof row[key] === "string");
}

export async function loadPublicLinks(signal: AbortSignal, send: (input: string, init: RequestInit) => Promise<Response> = fetch): Promise<PublicLink[]> {
  const response = await send(NATIVE_STAGING_ORIGIN + "/api/tautan", {
    signal, headers: { Accept: "application/json" }, credentials: "omit", redirect: "error",
  });
  if (!response.ok) throw new Error("Public directory unavailable");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("links" in payload) || !Array.isArray(payload.links)
    || !payload.links.every(isPublicLink)) throw new Error("Invalid public directory response");
  return payload.links;
}

export async function openPublicLink(url: string, open: (url: string) => Promise<unknown>) {
  if (!isValidHttpUrl(url)) return false;
  try {
    await open(url);
    return true;
  } catch {
    return false;
  }
}
