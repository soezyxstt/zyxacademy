import { expect, test } from "bun:test";
import { loadPublicLinks, openPublicLink } from "../../apps/mobile-native/features/public-links/client";
import { groupPublicLinks } from "../../packages/public-links/directory";
import { directoryCases } from "../../packages/public-links/fixtures";

test("empty, one category and interleaved categories preserve their published order", () => {
  expect(groupPublicLinks(directoryCases.empty.links)).toEqual([]);
  const single = directoryCases.single.links;
  expect(groupPublicLinks(single)).toEqual([{ label: "Umum", links: single }]);
  const [first, second] = directoryCases.grouped.links;
  const third = { ...first, id: "third" };
  expect(groupPublicLinks([first, second, third])).toEqual([
    { label: "Komunitas", links: [first, third] }, { label: "Umum", links: [second] },
  ]);
});

test("native reads the anonymous public projection and handles failed or malformed responses", async () => {
  const signal = new AbortController().signal;
  const links = directoryCases.grouped.links;
  expect(await loadPublicLinks(signal, async (url, init) => {
    expect(url).toBe("https://staging.zyxacademy.com/api/tautan");
    expect(init.credentials).toBe("omit");
    expect(init.signal).toBe(signal);
    return Response.json({ links });
  })).toEqual(links);
  await expect(loadPublicLinks(signal, async () => Response.json({ links: [{ id: 1 }] }))).rejects.toThrow();
  await expect(loadPublicLinks(signal, async () => new Response(null, { status: 503 }))).rejects.toThrow();
});

test("only HTTP(S) destinations are sent to the system and launch failures are recoverable", async () => {
  const opened: string[] = [];
  const open = async (url: string) => opened.push(url);
  for (const invalid of ["javascript:void(0)", "file:///private", "zyx-native-parity://internal/files"]) {
    expect(await openPublicLink(invalid, open)).toBe(false);
  }
  expect(opened).toEqual([]);
  expect(await openPublicLink("https://example.org/path?x=%2B", open)).toBe(true);
  expect(opened).toEqual(["https://example.org/path?x=%2B"]);
  expect(await openPublicLink("https://example.org", async () => { throw new Error(); })).toBe(false);
});
