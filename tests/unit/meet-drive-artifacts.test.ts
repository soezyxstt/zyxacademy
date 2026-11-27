import { expect, test } from "bun:test";
import { ensureMeetDriveEditors, meetDriveArtifactId } from "../../lib/meet/drive-artifacts";

test("reads only exact provider Drive and Docs resources", () => {
  const id = "conference-drive-id";
  expect(meetDriveArtifactId(`files/${id}`)).toBe(id);
  expect(meetDriveArtifactId(`https://docs.google.com/document/u/1/d/${id}/edit`)).toBe(id);
  expect(meetDriveArtifactId(`https://drive.google.com/file/d/${id}/view`)).toBe(id);
  expect(meetDriveArtifactId(`https://drive.google.com/open?id=${id}`)).toBe(id);
  for (const hostile of [
    `https://drive.google.com.attacker.test/file/d/${id}/view`, `http://drive.google.com/file/d/${id}/view`,
    `https://user:pass@drive.google.com/open?id=${id}`, `https://docs.google.com/spreadsheets/d/${id}/edit`,
  ]) expect(meetDriveArtifactId(hostile)).toBeNull();
});

test("a retry inspects paginated permissions and changes only missing editor grants", async () => {
  const admin = "admin@example.test";
  const reader = "reader@example.test";
  const newAdmin = "new@example.test";
  const roleByEmail = new Map([[admin, "owner"], [reader, "reader"]]);
  const calls: Array<{ method: string; path: string; payload?: unknown }> = [];
  const provider = async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    const method = init?.method ?? "GET";
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, payload });
    expect(url.origin).toBe("https://www.googleapis.com");
    expect(url.searchParams.get("supportsAllDrives")).toBe("true");
    if (method === "GET") {
      if (!url.searchParams.has("pageToken")) return Response.json({ permissions: [], nextPageToken: "page2" });
      return Response.json({ permissions: [...roleByEmail].map(([emailAddress, role]) => ({ type: "user", emailAddress, role, id: emailAddress === reader ? "reader-id" : "existing-id" })) });
    }
    if (method === "PATCH") roleByEmail.set(reader, payload.role);
    if (method === "POST") {
      expect(url.searchParams.get("sendNotificationEmail")).toBe("false");
      roleByEmail.set(payload.emailAddress, payload.role);
    }
    return Response.json({});
  };
  const signal = new AbortController().signal;
  expect(await ensureMeetDriveEditors("conference-drive-id", [admin, reader, newAdmin, admin.toUpperCase()], "synthetic", signal, provider)).toBe(true);
  expect(calls.map(({ method }) => method)).toEqual(["GET", "GET", "PATCH", "POST"]);
  expect(calls[2]).toMatchObject({ path: "/drive/v3/files/conference-drive-id/permissions/reader-id", payload: { role: "writer" } });
  expect(calls[3].payload).toEqual({ role: "writer", type: "user", emailAddress: newAdmin });
  calls.length = 0;
  expect(await ensureMeetDriveEditors("conference-drive-id", [admin, reader, newAdmin], "synthetic", signal, provider)).toBe(true);
  expect(calls.map(({ method }) => method)).toEqual(["GET", "GET"]);
});

test("access denials leave the verification incomplete and avoid blind grants", async () => {
  const methods: string[] = [];
  const request = async (_input: string, init?: RequestInit) => {
    methods.push(init?.method ?? "GET");
    return new Response(null, { status: 403 });
  };
  expect(await ensureMeetDriveEditors("conference-drive-id", ["admin@example.test"], "synthetic", new AbortController().signal, request)).toBe(false);
  expect(methods).toEqual(["GET"]);
});
