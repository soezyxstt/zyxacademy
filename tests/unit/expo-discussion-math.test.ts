import { expect, test } from "bun:test";
import { formatDiscussionMath } from "../../apps/mobile-native/features/student/community/discussion-math";

const people = new Map([["rina", { id: "student-a", name: "Rina", mention: "rina" }]]);

test("renders a discussion formula without changing the mention or the course destination", () => {
  const budget = { remaining: 30 };
  const input = String.raw`@rina, **hitung \(x^2\)** di [kelas](/courses/k), ![gambar](https://untrusted.invalid/image).`;
  const rich = formatDiscussionMath(input, people, budget)!;
  expect([...rich.links.values()]).toEqual([{ person: "student-a" }, { href: "/courses/k" }]);
  expect(rich.markdown).toContain("**hitung $x^2$**");
  expect(rich.markdown).toContain("gambar");
  expect(rich.markdown).not.toContain("untrusted.invalid");
  expect(budget.remaining).toBe(29);
});

test("treats code as source and bounds display math for the entire message", () => {
  const budget = { remaining: 1 };
  expect(formatDiscussionMath("kode `$x$`", people, budget)).toBeNull();
  expect(formatDiscussionMath(String.raw`\[x+1\]`, people, budget)?.markdown).toBe("$$x+1$$");
  expect(formatDiscussionMath("$y$", people, budget)).toBeNull();
  expect(formatDiscussionMath("$" + "x".repeat(1001) + "$", people, { remaining: 30 })).toBeNull();
});

test("assigns only parsed destinations and never reuses a target present in authored text", () => {
  const input = "$x$ https://discussion.invalid/r0/0 @rina [a](javascript:example)";
  const rich = formatDiscussionMath(input, people, { remaining: 30 })!;
  expect(rich.links.has("https://discussion.invalid/r0/0")).toBe(false);
  expect([...rich.links.values()]).toEqual([{ person: "student-a" }]);
  expect(rich.markdown).not.toContain("javascript:");
});
