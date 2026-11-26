import { expect, mock, test } from "bun:test";
import { matchesPkaSearch, pkaInstagramProfile, pkaMeetingLink, pkaProofTarget, pkaRegistrationSheet } from "../../packages/academic/pka-registrations";
import { handleAdministrationRead, type AdministrationReadServices } from "../../lib/native/academic/administration/handle-read";
import { inlineImage } from "../../apps/mobile-native/network/inline-image";

const origin = "https://staging.example.test";
const record = { id: "id", fullName: "Nina", faculty: "FMIPA", email: "student@example.test", instagramUsername: "nina",
  createdAt: "2025-05-01T12:00:00Z", receiveAnnouncements: false, proofUrl: "/api/storage/file/pka/proof.jpg", accountEmail: "account@example.test" };

test("registration search and export include every matching page and the same account email as the website", () => {
  expect(matchesPkaSearch(record, "ACCOUNT@")).toBe(true);
  const records = Array.from({ length: 23 }, (_, i) => ({ ...record, fullName: "Pendaftar " + i }));
  const sheet = pkaRegistrationSheet({ search: "account", records }, "account", origin, "id");
  expect(sheet.rows).toHaveLength(23);
  expect(sheet.rows[22]).toEqual(["Pendaftar 22", "FMIPA", record.email, "@nina", "1 Mei 2025", "Tidak", origin + record.proofUrl]);
  expect(() => pkaRegistrationSheet({ search: "account", records }, "other", origin, "id")).toThrow();
  expect(pkaProofTarget("https://archive.ufs.sh/f/proof", origin)?.path).toBeNull();
  expect(pkaProofTarget("/api/admin/users", origin)).toBeNull();
  expect(pkaProofTarget("//external.example/", origin)).toBeNull();
});

test("PKA external actions admit literal handles and HTTPS meeting links", () => {
  expect(pkaInstagramProfile("@nina_1")).toBe("https://instagram.com/nina_1");
  for (const handle of ["../name", "..", "person?token=x", "", "@site.tld/xyz"]) expect(pkaInstagramProfile(handle)).toBeNull();
  expect(pkaMeetingLink("https://meet.google.com/abc-defg-hij")).toBe("https://meet.google.com/abc-defg-hij");
  for (const link of ["http://example.org/", "https://user:secret@example.org/conference", "javascript:noop", "//example.org/"]) expect(pkaMeetingLink(link)).toBeNull();
});

test("only an Admin can prepare the complete registration export", async () => {
  const read = mock(async (search: string) => ({ search, records: [record] }));
  const services = { session: async () => ({ user: { id: "admin" } }), hasAdmin: async () => false, registrationsForExport: read } as unknown as AdministrationReadServices;
  const path = ["registrations", "export"];
  const query = new URLSearchParams({ search: "nina" });
  expect((await handleAdministrationRead(path, query, services)).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
  const response = await handleAdministrationRead(path, query, { ...services, hasAdmin: async () => true });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).records[0].accountEmail).toBeUndefined();
});

test("private image preview works with an unannounced length and rejects oversized streamed bodies", async () => {
  expect(await inlineImage(new Response(Uint8Array.of(1, 2)), "image/png", 2)).toBe("data:image/png;base64,AQI=");
  await expect(inlineImage(new Response(Uint8Array.of(1, 2, 3)), "image/png", 2)).rejects.toThrow();
});
