type DrivePermission = { id?: string; emailAddress?: string; type?: string; role?: string };
const editRoles = new Set(["owner", "organizer", "fileOrganizer", "writer"]);
const safeId = /^[A-Za-z0-9_-]{10,180}$/;

export function meetDriveArtifactId(value: string | undefined) {
  const raw = value?.trim() ?? "";
  const resource = raw.replace(/^(?:files|documents)\//, "");
  if (safeId.test(resource)) return resource;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const match = url.hostname === "drive.google.com" ? url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1] ?? (url.pathname === "/open" ? url.searchParams.get("id") : null)
      : url.hostname === "docs.google.com" ? url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([^/]+)/)?.[1] : null;
    return match && safeId.test(match) ? match : null;
  } catch {
    return null;
  }
}

export async function ensureMeetDriveEditors(file: string, emails: readonly string[], token: string, signal: AbortSignal, request: (input: string, init?: RequestInit) => Promise<Response> = fetch) {
  if (!safeId.test(file)) return false;
  const path = `https://www.googleapis.com/drive/v3/files/${file}/permissions`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const permissions: DrivePermission[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const query = new URLSearchParams({ supportsAllDrives: "true", pageSize: "100", fields: "nextPageToken,permissions(id,emailAddress,type,role)" });
    if (cursor) query.set("pageToken", cursor);
    const response = await request(`${path}?${query}`, { headers, signal });
    if (!response.ok) return false;
    const page: { permissions?: DrivePermission[]; nextPageToken?: string } = await response.json();
    permissions.push(...(page.permissions ?? []));
    cursor = page.nextPageToken;
    if (!cursor) break;
  }
  if (cursor) return false;

  let completed = true;
  for (const email of new Set(emails.map(value => value.toLowerCase().trim()).filter(Boolean))) {
    const entries = permissions.filter(permission => permission.type === "user" && permission.emailAddress?.toLowerCase() === email);
    if (entries.some(permission => editRoles.has(permission.role ?? ""))) continue;
    const current = entries.find(entry => entry.id);
    const response = current
      ? await request(`${path}/${encodeURIComponent(current.id!)}?supportsAllDrives=true`, {
        method: "PATCH", headers, signal, body: JSON.stringify({ role: "writer" }),
      })
      : await request(`${path}?supportsAllDrives=true&sendNotificationEmail=false`, {
        method: "POST", headers, signal, body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
      });
    if (!response.ok) completed = false;
  }
  return completed;
}
