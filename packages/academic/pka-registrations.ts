import { z } from "zod";
import type { SpreadsheetExportPayload } from "../../lib/export-spreadsheet-client";

const registration = z.object({
  id: z.string(), fullName: z.string(), faculty: z.string(), email: z.string(), instagramUsername: z.string(),
  proofUrl: z.string(), receiveAnnouncements: z.boolean(), createdAt: z.string().nullable(),
});
export const pkaExportRead = z.object({ search: z.string(), records: z.array(registration) });

export function matchesPkaSearch(row: { fullName: string; faculty: string; email: string; instagramUsername: string; accountEmail: string | null }, search: string) {
  return [row.fullName, row.faculty, row.email, row.instagramUsername, row.accountEmail ?? ""].join(" ").toLowerCase().includes(search.trim().toLowerCase());
}

export function pkaInstagramProfile(username: string | undefined) {
  const handle = username?.trim().replace(/^@/, "");
  return handle && /^[A-Za-z0-9._]{1,30}$/.test(handle) && handle !== "." && handle !== ".."
    ? "https://instagram.com/" + handle : null;
}

export function pkaMeetingLink(value: string | null | undefined) {
  if (!value?.startsWith("https://") || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch { return null; }
}

export function pkaProofTarget(value: string, origin: string) {
  if (!value || /[\\\u0000-\u001f]/.test(value) || value.startsWith("//")) return null;
  try {
    const url = new URL(value, origin);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) return null;
    if (url.origin === origin) return url.pathname.startsWith("/api/storage/file/") && url.pathname.length > "/api/storage/file/".length
      ? { path: url.pathname + url.search, href: url.href } : null;
    return value.startsWith("https://") ? { href: url.href, path: null } : null;
  } catch { return null; }
}

export function pkaRegistrationSheet(raw: unknown, search: string, origin: string, locale: string): SpreadsheetExportPayload {
  const data = pkaExportRead.parse(raw);
  if (data.search !== search) throw new Error("Invalid registration filter");
  const en = locale === "en";
  return { entityType: "pka", entityId: "tutorial-pka", title: "Tutorial PKA",
    headers: en ? ["Full name", "Faculty", "Student email", "Instagram", "Registration date", "Announcement notifications", "Proof link"]
      : ["Nama lengkap", "Fakultas", "Email siswa", "Instagram", "Waktu pendaftaran", "Notifikasi pengumuman", "Tautan bukti"],
    rows: data.records.map(r => [r.fullName, r.faculty, r.email, "@" + r.instagramUsername,
      r.createdAt ? new Date(r.createdAt).toLocaleDateString(en ? "en-US" : "id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }) : "-",
      r.receiveAnnouncements ? en ? "Yes" : "Ya" : en ? "No" : "Tidak", pkaProofTarget(r.proofUrl, origin)?.href ?? ""]),
  };
}
