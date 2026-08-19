import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  detectConflicts,
  grantDriveEditorAccess,
  gridFingerprint,
  writeOwnedBlock,
} from "@/lib/google-sheets";

type CreatedPermission = { fileId: string; body: Record<string, unknown> };

let createdPermissions: CreatedPermission[] = [];
const originalFetch = globalThis.fetch;

function installFetchMock(opts: {
  existing?: Record<string, string[]>;
  createForbidden?: string[];
}) {
  const existing = opts.existing ?? {};
  const createForbidden = new Set(opts.createForbidden ?? []);
  createdPermissions = [];

  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";

    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
    }

    const fileMatch = url.match(/drive\/v3\/files\/([^/?]+)\/permissions/);
    if (!fileMatch) {
      return new Response("{}", { status: 404 });
    }
    const fileId = fileMatch[1];

    if (method === "GET") {
      const emails = existing[fileId] ?? [];
      const permissions = emails.map((emailAddress) => ({ emailAddress, role: "writer" }));
      return new Response(JSON.stringify({ permissions }), { status: 200 });
    }

    if (method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (createForbidden.has(String(body.emailAddress))) {
        return new Response(JSON.stringify({ error: { message: "The user is already a collaborator" } }), {
          status: 403,
        });
      }
      createdPermissions.push({ fileId, body });
      return new Response(JSON.stringify({ id: "perm-1", ...body }), { status: 200 });
    }

    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
}

describe("Google Sheets Drive editor grants", () => {
  beforeEach(() => {
    process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  });

  afterEach(() => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    globalThis.fetch = originalFetch;
  });

  test("GRANT-001: creates a writer permission only for admin emails missing on the file", async () => {
    installFetchMock({ existing: { file123: ["admina@example.com"] } });

    await grantDriveEditorAccess("file123", [
      "AdminA@example.com",
      "adminb@example.com",
      "adminb@example.com",
      "  ",
    ]);

    expect(createdPermissions).toHaveLength(1);
    expect(createdPermissions[0]).toEqual({
      fileId: "file123",
      body: { role: "writer", type: "user", emailAddress: "adminb@example.com" },
    });
  });

  test("GRANT-002: skips Drive entirely when there are no admin emails", async () => {
    let driveCalls = 0;
    installFetchMock({});
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://www.googleapis.com/drive")) driveCalls += 1;
      return originalFetch(input, init);
    }) as unknown as typeof fetch;

    await grantDriveEditorAccess("file123", []);

    expect(driveCalls).toBe(0);
    expect(createdPermissions).toHaveLength(0);
  });

  test("GRANT-003: treats a 403 already-collaborator response as success", async () => {
    installFetchMock({ existing: {}, createForbidden: ["admina@example.com"] });

    await expect(
      grantDriveEditorAccess("file123", ["admina@example.com", "adminb@example.com"])
    ).resolves.toBeUndefined();

    expect(createdPermissions.map((p) => p.body.emailAddress)).toEqual(["adminb@example.com"]);
  });
});

describe("Google Sheets fingerprint & conflict detection", () => {
  const headers = ["Nama", "Fakultas", "Email"];
  const rows = [
    ["Budi", "Teknik", "budi@example.com"],
    ["Sari", "Kedokteran", "sari@example.com"],
  ];

  test("FINGERPRINT-001: fingerprint is deterministic and normalizes null/undefined to empty string", () => {
    const a = gridFingerprint(headers, rows);
    const b = gridFingerprint(headers, rows);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);

    const withNulls = gridFingerprint(["A", "B"], [[null, undefined], [1, "x"]]);
    const withEmpty = gridFingerprint(["A", "B"], [["", ""], ["1", "x"]]);
    expect(withNulls).toBe(withEmpty);
  });

  test("CONFLICT-001: no conflicts when the grid matches the stored fingerprint and no manual cells exist", () => {
    const prevGrid = [headers, ...rows];
    const conflicts = detectConflicts({
      prevGrid,
      prevHeaderCount: headers.length,
      prevRowCount: rows.length + 1,
      newHeaders: headers,
      newRows: rows,
      storedFingerprint: gridFingerprint(headers, rows),
    });
    expect(conflicts).toEqual([]);
  });

  test("CONFLICT-002: flags block_modified when a cell inside the owned block was edited manually", () => {
    const editedGrid = [headers, ["Budi", "FISIKA", "budi@example.com"], rows[1]];
    const conflicts = detectConflicts({
      prevGrid: editedGrid,
      prevHeaderCount: headers.length,
      prevRowCount: rows.length + 1,
      newHeaders: headers,
      newRows: rows,
      storedFingerprint: gridFingerprint(headers, rows),
    });
    expect(conflicts.map((c) => c.code)).toContain("block_modified");
  });

  test("CONFLICT-003: flags manual_rows when cells below the block overlap a growing data set", () => {
    const prevGrid = [headers, ...rows, ["CATATAN", "manual", ""]];
    const conflicts = detectConflicts({
      prevGrid,
      prevHeaderCount: headers.length,
      prevRowCount: rows.length + 1,
      newHeaders: headers,
      newRows: [...rows, ["Andi", "Hukum", "andi@example.com"]],
      storedFingerprint: gridFingerprint(headers, rows),
    });
    expect(conflicts.map((c) => c.code)).toEqual(["manual_rows"]);
  });

  test("CONFLICT-004: flags manual_columns when cells right of the block overlap growing headers", () => {
    const widerGrid = [
      [...headers, "Status"],
      [...rows[0], "OK"],
      [...rows[1], "OK"],
    ];
    const newHeaders = [...headers, "Status"];
    const conflicts = detectConflicts({
      prevGrid: widerGrid,
      prevHeaderCount: headers.length,
      prevRowCount: rows.length + 1,
      newHeaders,
      newRows: [...rows, ["Andi", "Hukum", "andi@example.com"]],
      storedFingerprint: gridFingerprint(headers, rows),
    });
    expect(conflicts.map((c) => c.code)).toEqual(["manual_columns"]);
  });

  test("CONFLICT-005: manual cells that are not overlapped do not produce conflicts", () => {
    const prevGrid = [headers, ...rows, ["CATATAN", "manual", ""]];
    const conflicts = detectConflicts({
      prevGrid,
      prevHeaderCount: headers.length,
      prevRowCount: rows.length + 1,
      newHeaders: headers,
      newRows: rows,
      storedFingerprint: gridFingerprint(headers, rows),
    });
    expect(conflicts).toEqual([]);
  });
});

describe("Google Sheets owned-block write", () => {
  let batchRequests: any[] = [];

  beforeEach(() => {
    process.env.GOOGLE_REFRESH_TOKEN = "test-refresh-token";
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    batchRequests = [];
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ access_token: "test-token" }), { status: 200 });
      }
      if (url.endsWith(":batchUpdate")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        batchRequests = body.requests ?? [];
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    globalThis.fetch = originalFetch;
  });

  test("WRITE-001: writes an explicit owned-block range and clears the shrunken tail", async () => {
    const ok = await writeOwnedBlock(
      "s1",
      "Daftar",
      ["A", "B"],
      [
        [1, 2],
        [3, 4],
      ],
      5,
      3
    );

    expect(ok).toBe(true);

    const writeReq = batchRequests.find((r: any) => r.updateCells?.rows?.length > 0);
    expect(writeReq.updateCells.range).toEqual({
      sheetId: 0,
      startRow: 0,
      startColumn: 0,
      endRow: 3,
      endColumn: 2,
    });
    expect(writeReq.updateCells.rows).toHaveLength(3);

    const clears = batchRequests.filter((r: any) => r.updateCells && r.updateCells.rows && r.updateCells.rows.length === 0);
    expect(clears).toHaveLength(2);
    const rowClear = clears.find((r: any) => r.updateCells.range.startRow === 3);
    const colClear = clears.find((r: any) => r.updateCells.range.startColumn === 2);
    expect(rowClear.updateCells.range.endRow).toBe(5);
    expect(rowClear.updateCells.range.endColumn).toBe(3);
    expect(colClear.updateCells.range.endRow).toBe(5);
    expect(colClear.updateCells.range.endColumn).toBe(3);
  });

  test("WRITE-002: does not clear anything when the new block is not smaller", async () => {
    const ok = await writeOwnedBlock(
      "s1",
      "Daftar",
      ["A", "B", "C"],
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      2,
      2
    );

    expect(ok).toBe(true);
    const clears = batchRequests.filter((r: any) => r.updateCells && r.updateCells.rows && r.updateCells.rows.length === 0);
    expect(clears).toEqual([]);
    const writeReq = batchRequests.find((r: any) => r.updateCells?.rows?.length > 0);
    expect(writeReq.updateCells.range.endRow).toBe(3);
    expect(writeReq.updateCells.range.endColumn).toBe(3);
  });
});
