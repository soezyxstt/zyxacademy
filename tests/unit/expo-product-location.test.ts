import { expect, test } from "bun:test";
import { academicRouteCanRead, productLocation } from "../../apps/mobile-native/routing/product-location";

test("only an already-visited Academic course list stays mounted offscreen", () => {
  expect(academicRouteCanRead("/admin/courses", false, false)).toBe(false);
  expect(academicRouteCanRead("/admin/courses?query=Physics", false, true)).toBe(true);
  expect(academicRouteCanRead("/admin/courses/calculus", false, true)).toBe(false);
  expect(academicRouteCanRead("/tutor/calculus/students", false, true)).toBe(false);
  expect(academicRouteCanRead("/tutor/calculus/students", true, true)).toBe(true);
});

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
