import { describe, expect, test } from "bun:test";
import {
  assertSafeRunId,
  hmacText,
  parseCliArgs,
  sha256Text,
  stableStringify,
} from "@/lib/staging/migration-ledger";

describe("staging manifest helpers", () => {
  test("stable serialization sorts object keys and preserves array order", () => {
    expect(stableStringify({ z: 1, nested: { b: 2, a: 1 }, a: [2, 1] })).toBe(
      '{"a":[2,1],"nested":{"a":1,"b":2},"z":1}',
    );
  });

  test("keyed manifests are deterministic and key dependent", () => {
    const payload = stableStringify({ id: "student-1", count: 2 });
    expect(hmacText("key-a", payload)).toBe(hmacText("key-a", payload));
    expect(hmacText("key-a", payload)).not.toBe(hmacText("key-b", payload));
    expect(sha256Text(payload)).toHaveLength(64);
  });

  test("CLI parsing supports value and boolean arguments", () => {
    expect(parseCliArgs(["--run-id", "abc", "--apply", "--plan", "001"])).toEqual({
      "run-id": "abc",
      apply: true,
      plan: "001",
    });
  });

  test("run ids cannot escape the artifact directory", () => {
    expect(assertSafeRunId("run-001")).toBe("run-001");
    expect(() => assertSafeRunId("../outside")).toThrow();
    expect(() => assertSafeRunId("run/child")).toThrow();
  });
});
