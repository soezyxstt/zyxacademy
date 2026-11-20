import { expect, mock, test } from "bun:test";

mock.module("next/navigation", () => ({
  redirect: (href: string) => { throw new Error(`redirect:${href}`); },
}));

const { default: AcademicLeaderboardPage } = await import("@/app/(student)/leaderboard/academic/page");

test("academic deep links select the academic tab and preserve query values", async () => {
  try {
    await AcademicLeaderboardPage({ searchParams: Promise.resolve({ course: "course with spaces", tab: "rank", extra: ["one", "two"] }) });
    throw new Error("Expected a redirect");
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const location = (error as Error).message.replace(/^redirect:/, "");
    const url = new URL(location, "https://example.test");
    expect(url.pathname).toBe("/leaderboard");
    expect(url.searchParams.get("tab")).toBe("academic");
    expect(url.searchParams.get("course")).toBe("course with spaces");
    expect(url.searchParams.getAll("extra")).toEqual(["one", "two"]);
  }
});
