import type { NativeSessionTransport } from "../../network/transport";

export type InboxRow = { id: string; title: string; body: string; type: string | null; read: boolean; createdAt: string; href: string | null };
export type InboxPage = { unread: number; rows: InboxRow[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseInbox(value: unknown): InboxPage {
  if (!isObject(value) || typeof value.unreadCount !== "number" || !Number.isSafeInteger(value.unreadCount) ||
    value.unreadCount < 0 || !Array.isArray(value.notifications) || value.notifications.length > 20) {
    throw new Error("Invalid notification history");
  }
  const rows = value.notifications.map((row: unknown): InboxRow => {
    if (!isObject(row) || typeof row.id !== "string" || !row.id || typeof row.read !== "boolean" ||
      typeof row.title !== "string" || typeof row.body !== "string" || typeof row.createdAt !== "string") {
      throw new Error("Invalid notification record");
    }
    return {
      id: row.id, title: row.title, body: row.body, type: typeof row.type === "string" ? row.type : null,
      read: row.read, createdAt: row.createdAt,
      href: isObject(row.metadata) && typeof row.metadata.url === "string" ? row.metadata.url : null,
    };
  });
  return { unread: value.unreadCount, rows };
}

export async function loadInbox(session: NativeSessionTransport, open: boolean, signal: AbortSignal): Promise<InboxPage> {
  const query = open ? "limit=20" : "countOnly=true";
  const response = await session.request("/api/notifications/history?" + query, { signal, retry: "transient-read" });
  try {
    if (!response.ok) throw new Error("Notification history unavailable");
    const data = await response.json();
    session.assertCurrent();
    return parseInbox(data);
  } finally {
    response.dispose();
  }
}

export async function markInboxRead(session: NativeSessionTransport, selection: { id: string } | { all: true }, signal: AbortSignal) {
  const response = await session.request("/api/notifications/read", {
    method: "PATCH", signal, headers: { "Content-Type": "application/json" },
    body: JSON.stringify("id" in selection ? { ids: [selection.id] } : { all: true }),
  });
  try {
    if (!response.ok) throw new Error("Notification update unavailable");
    const result = await response.json();
    session.assertCurrent();
    if (!isObject(result) || result.success !== true) throw new Error("Notification update unconfirmed");
  } finally {
    response.dispose();
  }
}
