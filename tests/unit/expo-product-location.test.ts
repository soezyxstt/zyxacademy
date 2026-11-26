import { expect, test } from "bun:test";
import { academicRouteCanRead, productLocation, productQueryUpdate } from "../../apps/mobile-native/routing/product-location";

test("only an already-visited Academic course list stays mounted offscreen", () => {
  expect(academicRouteCanRead("/admin/courses", false, false)).toBe(false);
  expect(academicRouteCanRead("/admin/courses?query=Physics", false, true)).toBe(true);
  expect(academicRouteCanRead("/admin/courses/calculus", false, true)).toBe(false);
  expect(academicRouteCanRead("/tutor/calculus/students", false, true)).toBe(false);
  expect(academicRouteCanRead("/tutor/calculus/students", true, true)).toBe(true);
});

test("updates a Student query in place, clears removed filters and keeps route identity", () => {
  const pattern = "/courses/[id]/material";
  expect(productQueryUpdate(pattern,
    "/courses/physics/material?tab=documents&q=forces&id=physics#result",
    "/courses/physics/material?tab=materi&q=50%2520&q=energy&id=other#page%202",
  )).toEqual({ tab: "materi", q: ["50%20", "energy"], "#": "page%202" });
  expect(productQueryUpdate(pattern, "/courses/physics/material?q=forces", "/courses/physics/material"))
    .toEqual({ q: undefined });
  expect(productQueryUpdate(pattern, "/courses/physics/material?tab=materi", "/courses/physics/material?tab=materi"))
    .toEqual({});
  expect(productQueryUpdate(pattern, "/courses/physics/material", "/courses/chemistry/material")).toBeNull();
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
