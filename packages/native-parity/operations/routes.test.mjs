import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { operationsPatterns, resolveOperationsArea } from "../../../apps/mobile-native/features/operations/routes.ts";

test("each operations page in the integration manifest has exactly one route", () => {
  const manifest = readFileSync(new URL("../../../plans/native-parallel/routes.tsv", import.meta.url), "utf8");
  const expected = manifest.split(/\r?\n/).filter(line => line.startsWith("operations\t")).map(line =>
    line.split("\t")[1].replace(/^app/, "").replace(/\/\([^)]+\)/g, "").replace(/\/page\.tsx$/, "") || "/"
  );
  const actual = Object.values(operationsPatterns).flat();
  assert.equal(expected.length, 49);
  assert.deepEqual(actual.sort(), expected.sort());
  for (const [area, patterns] of Object.entries(operationsPatterns)) {
    for (const pattern of patterns) {
      assert.equal(resolveOperationsArea(pattern.replace(/\[[^\]]+\]/g, "fixture") + "?range=7d"), area);
    }
  }
});

test("auth, academic targets and external destinations belong to the host router", () => {
  for (const href of ["/sign-in", "/admin/courses", "//example.org", "https://example.org", "/blog/a/b"]) {
    assert.equal(resolveOperationsArea(href), null);
  }
});

test("reject malformed, traversal and encoded separator path segments", () => {
  for (const path of ["/blog/%", "/blog/%2F", "/admin/forms/%5c", "/demo/%00", "/blog/%2e%2e"]) {
    assert.equal(resolveOperationsArea(path), null);
  }
  assert.equal(resolveOperationsArea("/blog/cerita%20siswa"), "public");
});
