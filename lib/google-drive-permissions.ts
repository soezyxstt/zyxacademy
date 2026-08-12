import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { user, pengguna, peran, penggunaPeran } from "@/db/schema";
import { getGoogleMeetAccessToken } from "@/lib/google-meet";

export async function getAllAdminEmails(): Promise<string[]> {
  const [domainRows, legacyRows] = await Promise.all([
    db
      .select({ email: user.email })
      .from(penggunaPeran)
      .innerJoin(pengguna, eq(penggunaPeran.penggunaId, pengguna.id))
      .innerJoin(user, eq(pengguna.id, user.id))
      .innerJoin(peran, eq(penggunaPeran.peranId, peran.id))
      .where(and(eq(pengguna.status, "active"), eq(peran.code, "admin"))),
    db.select({ email: user.email }).from(user).where(eq(user.role, "admin")),
  ]);

  return [
    ...new Set(
      [...domainRows, ...legacyRows]
        .map((row) => row.email.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

export function extractDriveFileId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fileMatch = trimmed.match(/\/(?:file|document)\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const genericMatch = trimmed.match(/\/(?:d|open)\/([a-zA-Z0-9_-]+)/);
  if (genericMatch) return genericMatch[1];

  const queryMatch = trimmed.match(/[?&](?:id|fileId)=([a-zA-Z0-9_-]+)/);
  if (queryMatch) return queryMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

export async function grantDriveFileEditorAccess(fileId: string, emails: string[]): Promise<void> {
  const id = extractDriveFileId(fileId);
  if (!id) {
    console.warn(`Skipping Drive permission grant: invalid fileId "${fileId}"`);
    return;
  }

  const uniqueEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (uniqueEmails.length === 0) return;

  let token: string;
  try {
    token = await getGoogleMeetAccessToken();
  } catch (err) {
    console.warn("Skipping Drive permission grant: could not obtain access token", err);
    return;
  }

  for (const email of uniqueEmails) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ role: "writer", type: "user", emailAddress: email }),
        }
      );
      if (!res.ok && res.status !== 403) {
        console.warn(
          `Drive permission create failed for ${email} on ${id}: ${res.status} ${await res.text()}`
        );
      }
    } catch (err) {
      console.warn(`Drive permission grant error for ${email} on ${id}`, err);
    }
  }
}

export async function grantAdminEditorAccessToDriveItems(fileIds: string[]): Promise<void> {
  if (!Array.isArray(fileIds) || fileIds.length === 0) return;

  let adminEmails: string[] = [];
  try {
    adminEmails = await getAllAdminEmails();
  } catch (err) {
    console.warn("Could not load admin emails for Drive permission grants", err);
    return;
  }
  if (adminEmails.length === 0) return;

  const uniqueIds = [...new Set(fileIds.map((f) => (f ? String(f).trim() : "")).filter(Boolean))];
  await Promise.all(uniqueIds.map((fileId) => grantDriveFileEditorAccess(fileId, adminEmails)));
}
