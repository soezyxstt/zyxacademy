import { expect, test } from "bun:test";
import { productLocation } from "../../apps/mobile-native/routing/product-location";

test("canonical paths use the local entry's dynamic parameters and preserve query repetitions", () => {
  expect(productLocation("/courses/[id]/quiz/[quizId]", {
    id: "Bahasa & Sastra", quizId: "q1", section: ["a+b", "b%2F"], "#": "bab 1",
  })).toBe("/courses/Bahasa%20%26%20Sastra/quiz/q1?section=a%2Bb&section=b%252F#bab%201");
  expect(productLocation("/", {})).toBe("/");
});

test("ambiguous and missing segments cannot change the owner of a route", () => {
  for (const id of [undefined, [""], ".", "..", "/admin", "a\\b", "\ud800"]) {
    expect(productLocation("/courses/[id]", { id })).toBeNull();
  }
});
