import { expect, test } from "bun:test";
import { meetingLinks, performManagementLink, respondentLink } from "../../apps/mobile-native/features/operations/management/links";

const origin = "https://staging.example.invalid";

test("respondent links stay within the canonical browser handoff", () => {
  expect(respondentLink("Course_Check-in")).toBe("/f/Course_Check-in");
  for (const slug of ["", "../admin", "foo/bar", "form?role=admin", "form%2fadmin", "form#section"]) {
    expect(respondentLink(slug)).toBeNull();
  }
});

test("Meet provides distinct host, raw public and short public links", () => {
  const links = meetingLinks({
    slug: "session-one",
    hostEmail: "host+slot@example.invalid",
    meetingUri: "https://meet.google.com/abc-defg-hij?authuser=old&hs=4&AUTHUSER=old-again#room",
  });
  expect(links.short).toBe("/f/session-one");
  expect(links.publicUrl).toBe("https://meet.google.com/abc-defg-hij?hs=4#room");
  expect(new URL(links.host!).searchParams.getAll("authuser")).toEqual(["host+slot@example.invalid"]);
  expect(new URL(links.host!).searchParams.get("hs")).toBe("4");
  expect(meetingLinks({ meetingUri: "https://meet.google.com/abc-defg-hij" }).host)
    .toBe("https://meet.google.com/abc-defg-hij");
  for (const meetingUri of ["https://meet.google.com.other.invalid/abc-defg-hij", "http://meet.google.com/abc-defg-hij",
    "https://someone:secret@meet.google.com/abc-defg-hij", "javascript:alert(1)"]) {
    expect(meetingLinks({ meetingUri, slug: "short", hostEmail: "host@example.invalid" }))
      .toEqual({ short: "/f/short", host: null, publicUrl: null });
  }
});

test("default device calls get only the validated URL and share title, and handle dismissals", async () => {
  const calls: unknown[] = [];
  const device: Parameters<typeof performManagementLink>[2] = {
    async open(url) { calls.push(url); return { type: "dismiss" }; },
    async share(input) { calls.push(input); return { status: "cancelled" }; },
  };
  const current = () => true;
  expect(await performManagementLink({ kind: "open", url: "/api/storage/file/media/guide.pdf" }, origin, device, current)).toBe("cancelled");
  expect(await performManagementLink({ kind: "share", url: "/f/check-in", title: "Check-in" }, origin, device, current)).toBe("cancelled");
  expect(calls).toEqual([
    `${origin}/api/storage/file/media/guide.pdf`,
    { url: `${origin}/f/check-in`, title: "Check-in" },
  ]);
  for (const url of ["//other.invalid", "https://person:secret@example.invalid/x", "data:text/plain,test"]) {
    expect(await performManagementLink({ kind: "open", url }, origin, device, current)).toBe("error");
  }
  expect(calls).toHaveLength(2);
});

test("real device failures stay distinct from a late result after focus or session loss", async () => {
  let current = true;
  let opened = 0;
  const device: Parameters<typeof performManagementLink>[2] = {
    async open() { opened += 1; return { type: "locked" }; },
    async share() { return { status: "unavailable" }; },
  };
  const active = () => current;
  const url = "http://example.invalid/page";
  expect(await performManagementLink({ kind: "open", url }, origin, device, active)).toBe("error");
  expect(await performManagementLink({ kind: "share", url }, origin, device, active)).toBe("error");
  const late = performManagementLink({ kind: "open", url }, origin, device, active);
  current = false;
  expect(await late).toBe("stale");
  expect(await performManagementLink({ kind: "open", url }, origin, device, active)).toBe("stale");
  expect(opened).toBe(2);
});
