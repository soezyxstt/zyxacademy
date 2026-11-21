import { createHash } from "node:crypto";

export type CalendarEntry = { key: string; summary: string; description: string; location?: string; start: Date; end: Date };
export class CalendarApiError extends Error {
  constructor(public status: number, public reasons: string[] = []) { super(`Calendar request failed (${status})`); }
  get requiresReconnect() {
    const quota = this.reasons.some(reason => ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded", "dailyLimitExceeded", "RESOURCE_EXHAUSTED"].includes(reason));
    return this.status === 401 || (this.status === 403 && !quota);
  }
}
export function calendarEventId(key: string) {
  return createHash("sha256").update(`zyx-calendar-v1:${key}`).digest("hex");
}

async function calendarFailure(response: Response) {
  const body = await response.json().catch(() => null) as { error?: { errors?: Array<{ reason?: string }>; status?: string } } | null;
  const reasons = (body?.error?.errors ?? []).flatMap(error => typeof error.reason === "string" ? [error.reason] : []);
  if (typeof body?.error?.status === "string") reasons.push(body.error.status);
  return new CalendarApiError(response.status, reasons);
}

// A complete source snapshot is required before deleting stale managed events.
export async function reconcileCalendar(token: string, calendarId: string, owner: string, entries: CalendarEntry[], now = new Date()) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  async function request(url: string, method = "GET", body?: unknown) {
    const response = await fetch(url, {
      method, redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return response;
  }
  const remote = new Map<string, { id: string; status?: string }>();
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ privateExtendedProperty: `zyxOwner=${owner}`, timeMin: now.toISOString(), maxResults: "2500" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await request(`${base}?${query}`);
    if (!response.ok) throw await calendarFailure(response);
    const page = await response.json() as { items?: Array<{ id: string; status?: string }>; nextPageToken?: string };
    for (const event of page.items ?? []) remote.set(event.id, event);
    pageToken = page.nextPageToken;
  } while (pageToken);
  const desired = new Set<string>();
  for (const entry of entries) {
    if (entry.end <= now) continue;
    const id = calendarEventId(`${owner}:${entry.key}`);
    desired.add(id);
    const body = {
      status: "confirmed",
      summary: entry.summary, description: entry.description, location: entry.location ?? "",
      start: { dateTime: entry.start.toISOString(), timeZone: "Asia/Jakarta" },
      end: { dateTime: entry.end.toISOString(), timeZone: "Asia/Jakarta" },
      extendedProperties: { private: { zyxOwner: owner } },
    };
    let response = remote.has(id)
      ? await request(`${base}/${id}`, "PATCH", body)
      : await request(base, "POST", { id, ...body });
    // Stable IDs also cover a retry after an ambiguous insert response.
    if (response.status === 409) response = await request(`${base}/${id}`, "PATCH", body);
    if (!response.ok) throw await calendarFailure(response);
  }
  for (const id of remote.keys()) {
    if (desired.has(id)) continue;
    const response = await request(`${base}/${id}`, "DELETE");
    if (!response.ok && response.status !== 404 && response.status !== 410) throw await calendarFailure(response);
  }
}
