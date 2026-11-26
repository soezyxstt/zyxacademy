import { expect, mock, test } from "bun:test";
import { readStudyGroupTokens } from "../../apps/mobile-native/features/academic/administration/study-group-tokens-client";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import { handleAdministrationRead, type AdministrationReadServices } from "../../lib/native/academic/administration/handle-read";

const token = { id: "example-token", token: "Zyx-SAMPLE01-3-1", capacity: 3 };
const groupId = "group 1";
const parts = ["groups", groupId, "tokens"];
const query = new URLSearchParams();
const signed = { user: { id: "admin" }, session: { id: "session" } };

function services(overrides: Partial<AdministrationReadServices> = {}): AdministrationReadServices {
  return {
    session: async () => signed,
    hasAdmin: async () => true,
    list: async () => ({ type: "page", rows: [], nextPage: false }),
    bundle: async () => null,
    pdfStatus: async () => null,
    courseSlug: async () => null,
    bundleCourseSlug: async () => null,
    ...overrides,
  };
}

test("only a live Admin session can read the selected group's activation tokens", async () => {
  const groupTokens = mock(async (id: string) => ({ groupId: id, tokens: [{ ...token, otherField: "private" }] }));
  for (const [scope, status] of [
    [services({ session: async () => null, groupTokens }), 401],
    [services({ session: async () => ({ user: signed.user }), groupTokens }), 401],
    [services({ hasAdmin: async () => false, groupTokens }), 403],
  ] as const) {
    expect((await handleAdministrationRead(parts, query, scope)).status).toBe(status);
  }
  expect(groupTokens).not.toHaveBeenCalled();
  const scope = services({ groupTokens });
  expect((await handleAdministrationRead(["groups"], query, scope)).status).toBe(200);
  expect(groupTokens).not.toHaveBeenCalled();
  const response = await handleAdministrationRead(parts, query, scope);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ groupId, tokens: [token] });
  expect(groupTokens).toHaveBeenCalledWith(groupId);
  expect((await handleAdministrationRead(parts, query, services({ groupTokens: async () => null }))).status).toBe(404);
  expect((await handleAdministrationRead(parts, query, services({ groupTokens: async () => ({ groupId: "other", tokens: [token] }) }))).status).toBe(500);
});

test("the bound native client URL-encodes the selected group and rejects an unexpected response group", async () => {
  const origin = "https://academic.example.test";
  const path = "/api/native/academic-administration/groups/group%201/tokens";
  const get = mock(async (url: string) => {
    expect(url).toBe(path);
    const resource = new URL(url, origin).pathname.split("/").slice(4).map(decodeURIComponent);
    return handleAdministrationRead(resource, query, services({ groupTokens: async id => ({ groupId: id, tokens: [token] }) }));
  });
  const transport = { accountId: signed.user.id, origin, locale: "id", get };
  const signal = new AbortController().signal;
  expect(await readStudyGroupTokens(transport, groupId, signal)).toEqual({ status: "ready", tokens: [token] });
  expect(get).toHaveBeenCalledWith(path, signal);
  expect(await readStudyGroupTokens({ ...transport, get: async () => Response.json({ groupId: "other", tokens: [token] }) }, groupId, signal))
    .toEqual({ status: "error" });
});

test("the native token detail stays outside MCP and retains the separate reveal grant", () => {
  const entry = operationsCatalog.find(item => item.source === "app/api/native/academic-administration/[...resource]/route.ts");
  expect(entry?.status).toBe("excluded");
  expect(entry?.tools).toEqual([]);
  expect(entry?.reason).toContain("tokens.reveal retains the access:secrets:read scope");
});
