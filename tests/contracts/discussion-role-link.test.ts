import { expect, mock, test } from "bun:test";

let role: string | null = "tutor";
let signedIn = true;
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => signedIn ? { user: { id: "viewer" } } : null }));
mock.module("@/lib/discussions/session", () => ({ getSessionDiscussionActor: async () => {
  if (!role) throw new Error("DISCUSSION_UNAVAILABLE");
  return { id: "viewer", role };
} }));
mock.module("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(href); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
const { default: Page } = await import("@/app/(student)/discussions/page");

test("a stored discussion link follows current canonical roles and preserves its target", async () => {
  const input = { searchParams: Promise.resolve({ thread: "thread/1", message: "message/45" }) };
  await expect(Page(input)).rejects.toThrow("/tutor/discussions?thread=thread%2F1&message=message%2F45");
  role = "student";
  await expect(Page(input)).rejects.toThrow("/dashboard/discussions?thread=thread%2F1&message=message%2F45");
  role = "admin";
  await expect(Page({ searchParams: Promise.resolve({ discussionTab: "reports" }) })).rejects.toThrow("/admin/discussions?discussionTab=reports");
  role = null;
  await expect(Page(input)).rejects.toThrow("NOT_FOUND");
  signedIn = false;
  await expect(Page(input)).rejects.toThrow("/sign-in?next=%2Fdiscussions%3Fthread%3Dthread%252F1%26message%3Dmessage%252F45");
});
