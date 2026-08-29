import { describe, expect, it, mock } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hasAnyPeranFromCodes, hasPeranFromCodes } from "@/lib/auth/authorization";

// The DAL declares `import "server-only"` as a server boundary marker. The marker
// package throws outside a react-server condition, so tests stub it as an empty
// module before importing any module that transitively reaches the DAL.
mock.module("server-only", () => ({}));

const actionsModule = await import("@/app/(admin)/admin/ops/tutor-activity/actions");

describe("Tutor Activity Log Admin Authorization and Export Contract", () => {
  it("authorizes only admin role for tutor activity log page and rejects tutor or murid", () => {
    // Admin has access
    expect(hasPeranFromCodes(["admin"], "admin")).toBe(true);
    expect(hasPeranFromCodes(["tutor", "admin"], "admin")).toBe(true);

    // Pure tutor is rejected
    expect(hasPeranFromCodes(["tutor"], "admin")).toBe(false);

    // Pure murid is rejected
    expect(hasPeranFromCodes(["murid"], "admin")).toBe(false);

    // Empty or non-matching roles are rejected
    expect(hasPeranFromCodes([], "admin")).toBe(false);
    expect(hasPeranFromCodes(["student"], "admin")).toBe(false);
    expect(hasPeranFromCodes(["teacher"], "admin")).toBe(false);
  });

  it("enforces that hasAnyPeran with admin requirement rejects non-admins", () => {
    expect(hasAnyPeranFromCodes(["admin"], ["admin"])).toBe(true);
    expect(hasAnyPeranFromCodes(["tutor"], ["admin"])).toBe(false);
    expect(hasAnyPeranFromCodes(["murid"], ["admin"])).toBe(false);
  });

  it("enforces that actions.ts exports ONLY async Server Action functions and no synchronous helpers", () => {
    const exportedKeys = Object.keys(actionsModule);

    // Ensure expected server action functions are exported
    expect(exportedKeys).toContain("getTutorActivityLogsAction");
    expect(exportedKeys).toContain("getTutorActivityStatsAction");
    expect(exportedKeys).toContain("getTutorActivityFilterOptionsAction");
    expect(exportedKeys).toContain("getTutorActivityDetailAction");

    // Ensure synchronous helpers are NOT exported from the "use server" actions module
    expect(exportedKeys).not.toContain("clampPageSize");
    expect(exportedKeys).not.toContain("sanitizeSnapshotSafely");
    expect(exportedKeys).not.toContain("validateCursor");
    expect(exportedKeys).not.toContain("queryTutorActivityLogs");
    expect(exportedKeys).not.toContain("queryTutorActivityStats");
    expect(exportedKeys).not.toContain("queryTutorActivityFilterOptions");
    expect(exportedKeys).not.toContain("queryTutorActivityDetail");

    // Every exported value must be a function returning a Promise (AsyncFunction)
    for (const key of exportedKeys) {
      const exportedVal = (actionsModule as any)[key];
      expect(typeof exportedVal).toBe("function");
      expect(exportedVal.constructor.name).toBe("AsyncFunction");
    }
  });

  it("enforces that actions.ts starts with 'use server' and dal.ts does not have 'use server'", () => {
    const actionsPath = join(
      process.cwd(),
      "app/(admin)/admin/ops/tutor-activity/actions.ts",
    );
    const dalPath = join(
      process.cwd(),
      "app/(admin)/admin/ops/tutor-activity/dal.ts",
    );

    const actionsContent = readFileSync(actionsPath, "utf8");
    const dalContent = readFileSync(dalPath, "utf8");

    // actions.ts must have "use server" at top
    expect(actionsContent.trimStart().startsWith('"use server";')).toBe(true);

    // dal.ts must NOT declare "use server"
    expect(dalContent.includes('"use server"')).toBe(false);
    expect(dalContent.includes("'use server'")).toBe(false);
  });

  it("enforces that dal.ts explicitly declares the server-only server boundary import", () => {
    const dalPath = join(
      process.cwd(),
      "app/(admin)/admin/ops/tutor-activity/dal.ts",
    );
    const dalContent = readFileSync(dalPath, "utf8");

    expect(dalContent.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("rejects unauthenticated execution of exported actions", async () => {
    // When invoked without authenticated admin session, actions must throw UNAUTHORIZED
    expect(
      actionsModule.getTutorActivityLogsAction({}),
    ).rejects.toThrow("UNAUTHORIZED");

    expect(
      actionsModule.getTutorActivityStatsAction(),
    ).rejects.toThrow("UNAUTHORIZED");

    expect(
      actionsModule.getTutorActivityFilterOptionsAction(),
    ).rejects.toThrow("UNAUTHORIZED");

    expect(
      actionsModule.getTutorActivityDetailAction("any-id"),
    ).rejects.toThrow("UNAUTHORIZED");
  });
});
