import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { NATIVE_STAGING_ORIGIN } from "../../apps/mobile-native/auth/session-api";
import { loadPublicMeeting } from "../../apps/mobile-native/features/meet/client";
import { browserDestination } from "../../apps/mobile-native/routing/browser-destination";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import * as destinations from "../../packages/meet/public-destination";
import { meetingCaseIds, meetingFixtureResponse, meetingFixtureTitle } from "../../packages/meet/parity-cases";

const require = createRequire(import.meta.url);
const slug = "Kelas A#1";
const room = "https://meet.google.com/abc-defg-hij";

async function fixture() {
  const row = { slug, title: "Kelas Fisika", meetingUri: room, deletedAt: null as Date | null, invitedEmails: ["private@example.test"] };
  const meeting = { slug: "slug", title: "title", meetingUri: "meetingUri", deletedAt: "deletedAt" };
  const selections: string[][] = [];
  type Predicate = (row: Record<string, unknown>) => boolean;
  const modules: Record<string, unknown> = {
    "@/db": { db: {
      select: (projection: Record<string, string>) => {
        selections.push(Object.values(projection));
        return {
          from: () => ({ where: (predicate: Predicate) => ({
            limit: async () => predicate(row) ? [Object.fromEntries(Object.values(projection).map(key => [key, row[key as keyof typeof row]]))] : [],
          }) }),
        };
      },
    } },
    "@/db/schema": { googleMeetSessions: meeting },
    "drizzle-orm": {
      and: (...predicates: Predicate[]) => (record: Record<string, unknown>) => predicates.every(testRow => testRow(record)),
      eq: (key: string, value: unknown) => (record: Record<string, unknown>) => record[key] === value,
      isNull: (key: string) => (record: Record<string, unknown>) => record[key] === null,
    },
    "@/packages/meet/public-destination": destinations,
    "@/components/meet/unavailable": { MeetingUnavailable: () => null },
    "@/lib/site": { createMetadata: (metadata: unknown) => metadata },
    "@/lib/i18n/server": { getAppLocale: async () => "id", getTranslations: async () => (key: string) => key },
    "next/navigation": { redirect: (url: string) => { throw new Error(url); } },
    "react/jsx-dev-runtime": { jsxDEV: (_component: unknown, props: unknown) => props },
    "react/jsx-runtime": { jsx: (_component: unknown, props: unknown) => props, jsxs: (_component: unknown, props: unknown) => props },
  };
  async function run<T>(path: string) {
    const target = { exports: {} };
    const transformed = await Bun.build({ entrypoints: [path], format: "cjs", external: ["*"] });
    runInNewContext(await transformed.outputs[0].text(), {
      module: target, exports: target.exports, require: (name: string) => modules[name] ?? require(name), Response,
    });
    return target.exports as T;
  }
  modules["@/lib/meet/public-meeting"] = await run("lib/meet/public-meeting.ts");
  type Context = { params: Promise<{ slug: string }> };
  const { GET } = await run<{ GET(request: Request, context: Context): Promise<Response> }>("app/api/meet/[slug]/route.ts");
  const { default: page } = await run<{ default(context: Context): Promise<unknown> }>("app/meet/[slug]/page.tsx");
  return { row, selections, load: (value: string) => GET(new Request("https://zyx.test/api/meet/example"),
    { params: Promise.resolve({ slug: value }) }), renderPage: (value: string) => page({ params: Promise.resolve({ slug: value }) }) };
}

test("the public lookup and canonical Next page use the same exact nondeleted meeting", async () => {
  const { row, selections, load, renderPage } = await fixture();
  const available = await load(slug);
  expect(available.status).toBe(200);
  expect(available.headers.get("Cache-Control")).toBe("no-store");
  expect(await available.json()).toEqual({ title: row.title });
  expect(selections).toEqual([["title", "meetingUri"]]);
  await expect(renderPage(slug)).rejects.toThrow(room);
  expect((await load(slug.toLowerCase())).status).toBe(404);
  row.deletedAt = new Date();
  const deleted = await load(slug);
  expect(deleted.status).toBe(404);
  expect(await deleted.json()).toEqual({ error: "meeting-unavailable" });
  expect(await renderPage(slug)).toEqual({ title: "public.meetNotFound", description: "public.meetUnavailable", home: "public.home" });
});

test("an invalid slug skips the database and a non-Google destination never becomes joinable", async () => {
  const { row, selections, load, renderPage } = await fixture();
  expect((await load("../private")).status).toBe(404);
  expect(selections).toEqual([]);
  for (const value of ["https://meet.google.com.evil.test/room", "https://name@meet.google.com/room", "http://meet.google.com/room"]) {
    row.meetingUri = value;
    expect((await load(slug)).status).toBe(404);
    expect(await renderPage(slug)).toHaveProperty("home", "public.home");
  }
});

test("Expo resolves the public title without credentials and opens the canonical link", async () => {
  const result = await loadPublicMeeting(slug, new AbortController().signal, async (url, init) => {
    expect(url).toBe(NATIVE_STAGING_ORIGIN + "/api/meet/Kelas%20A%231");
    expect(init).toMatchObject({ credentials: "omit", redirect: "error", headers: { Accept: "application/json" } });
    return Response.json({ title: "Fisika", meetingUri: "https://other.test" });
  });
  expect(result).toEqual({ status: "available", title: "Fisika" });
  expect(browserDestination("meet", { slug })).toBe(NATIVE_STAGING_ORIGIN + "/meet/Kelas%20A%231");
});

test("Expo distinguishes an unavailable room from transport errors and drops a late canceled response", async () => {
  const check = (response: Response) => loadPublicMeeting(slug, new AbortController().signal, async () => response);
  expect(await check(Response.json({ error: "meeting-unavailable" }, { status: 404 }))).toEqual({ status: "unavailable" });
  expect(await check(new Response("Not found", { status: 404 }))).toEqual({ status: "error" });
  expect(await check(Response.json({ title: " " }))).toEqual({ status: "error" });
  const request = new AbortController();
  const reply = Promise.withResolvers<Response>();
  let outgoing: AbortSignal | null | undefined;
  const result = loadPublicMeeting(slug, request.signal, async (_url, init) => {
    outgoing = init.signal;
    return reply.promise;
  });
  request.abort();
  reply.resolve(Response.json({ title: "Stale" }));
  expect(outgoing?.aborted).toBe(true);
  expect(await result).toEqual({ status: "error" });
});

test("public meeting lookup and browser handoff stay outside MCP", () => {
  for (const source of ["app/api/meet/[slug]/route.ts", "apps/mobile-native/app/meet/[slug].tsx"]) {
    expect(operationsCatalog.find(item => item.source === source)).toMatchObject({ status: "excluded", tools: [] });
  }
});

test("the meeting fixtures drive the real lookup through absence, availability, and recovery", async () => {
  const [unavailable, ready, failed] = meetingCaseIds;
  const read = (id: typeof meetingCaseIds[number], attempt = 1) => loadPublicMeeting(id, new AbortController().signal,
    async () => meetingFixtureResponse(id, attempt));
  expect(await read(unavailable)).toEqual({ status: "unavailable" });
  expect(await read(ready)).toEqual({ status: "available", title: meetingFixtureTitle });
  expect(await read(failed)).toEqual({ status: "error" });
  expect(await read(failed, 2)).toEqual({ status: "unavailable" });
});
