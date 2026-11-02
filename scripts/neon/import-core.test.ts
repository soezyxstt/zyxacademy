import { describe, expect, test } from "bun:test";
import { assertTarget, contentDigest, convert, insertionOrder } from "./import-core";
import { parseSourceSchema } from "./source-schema";

describe("Neon import safeguards", () => {
  test("requires the exact configured Neon host, database and verified TLS", () => {
    const url = "postgresql://user:pass@ep-demo.aws.neon.tech/rehearsal?sslmode=verify-full";
    expect(() => assertTarget(url, "ep-demo.aws.neon.tech", "rehearsal")).not.toThrow();
    expect(() => assertTarget(url, "ep-other.aws.neon.tech", "rehearsal")).toThrow();
    expect(() => assertTarget(url.replace("verify-full", "require"), "ep-demo.aws.neon.tech", "rehearsal")).toThrow();
    expect(() => assertTarget(url, "ep-demo.aws.neon.tech", "production")).toThrow();
    for (const parameter of ["host=other.neon.tech", "port=5433", "database=other", "sslmode=disable"]) {
      expect(() => assertTarget(`${url}&${parameter}`, "ep-demo.aws.neon.tech", "rehearsal")).toThrow();
    }
  });

  test("converts only explicitly specified and valid SQLite values", () => {
    expect(convert(1, "boolean")).toBe(true);
    expect(() => convert(2, "boolean")).toThrow();
    expect(convert(1700000000, "timestamp-seconds")).toBe("2023-11-14T22:13:20.000Z");
    expect(convert(1700000000000, "timestamp-milliseconds")).toBe("2023-11-14T22:13:20.000Z");
    expect(convert(1700000000n, "timestamp-mixed")).toBe("2023-11-14T22:13:20.000Z");
    expect(convert(1700000000000n, "timestamp-mixed")).toBe("2023-11-14T22:13:20.000Z");
    expect(() => convert(0, "timestamp-mixed")).toThrow("AMBIGUOUS_TIMESTAMP");
    expect(convert('{"id":9007199254740993}', "json")).toBe('{"id":9007199254740993}');
    expect(() => convert("{", "json")).toThrow();
    expect(() => convert(Number.MAX_SAFE_INTEGER + 1, "integer")).toThrow();
  });

  test("orders dependencies and fails on cycles or missing parents", () => {
    expect(insertionOrder(["child", "parent"], [["child", "parent"]])).toEqual(["parent", "child"]);
    expect(() => insertionOrder(["a", "b"], [["a", "b"], ["b", "a"]])).toThrow();
    expect(() => insertionOrder(["a"], [["a", "missing"]])).toThrow();
  });

  test("digest is order independent and sensitive to changes and duplicate rows", () => {
    const key = "x".repeat(32);
    expect(contentDigest(["a", "b"], key)).toBe(contentDigest(["b", "a"], key));
    expect(contentDigest(["a"], key)).not.toBe(contentDigest(["a", "a"], key));
    expect(contentDigest(["a"], key)).not.toBe(contentDigest(["b"], key));
    expect(() => contentDigest([], "weak")).toThrow();
  });

  test("reads declared SQLite modes across source files without Git history", () => {
    const schema = parseSourceSchema([
      `const user = sqliteTable("user", { createdAt: integer("created_at", { mode: "timestamp" }).defaultNow().notNull(), emailVerified: integer("email_verified", { mode: "boolean" }).notNull() });
       const questions = sqliteTable("questions", { content: text("content", { mode: "json" }).$type<Record<string, unknown>>() });`,
      `const notes = sqliteTable("tutor_slot_notes", { slotId: text("slot_id").primaryKey() });`,
    ]);
    expect(schema.get("user")?.get("created_at")).toEqual({ storage: "integer", mode: "timestamp" });
    expect(schema.get("user")?.get("email_verified")).toEqual({ storage: "integer", mode: "boolean" });
    expect(schema.get("questions")?.get("content")).toEqual({ storage: "text", mode: "json" });
    expect(schema.get("tutor_slot_notes")?.has("slot_id")).toBe(true);
  });
});
