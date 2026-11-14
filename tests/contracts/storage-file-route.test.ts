import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { isProtectedCourseDiktatPdfKey } from "@/lib/storage/keys";

const routeSource = readFileSync("app/api/storage/file/[...key]/route.ts", "utf8");

describe("storage file authorization boundary", () => {
  test("authorizes Diktat delivery before fetching bytes, independent of disposition", () => {
    const authorization = routeSource.indexOf("const diktatAuthorization = await resolveDiktatAuthorization(key)");
    const objectFetch = routeSource.indexOf("const command = new GetObjectCommand");

    expect(authorization).toBeGreaterThan(-1);
    expect(authorization).toBeLessThan(objectFetch);
    expect(routeSource).toContain("if (diktatAuthorization.matched && !diktatAuthorization.allowed)");
    expect(routeSource).toContain("inArray(diktatMateri.fileKey, candidates)");
    expect(routeSource).toContain("inArray(diktats.fileUrl, candidates)");
    expect(routeSource).toMatch(/if \(isFormFile \|\| diktatAuthorization\.matched \|\| quizAuthorization\.matched \|\| videoAuthorization\.matched\) \{\s*headers\.set\("Cache-Control", "private, no-store"\)/);
    expect(routeSource).not.toContain('headers.set("Cache-Control", "public, max-age=3600")');
    expect(routeSource).not.toContain("if (isDownload && !(await resolveDiktatAuthorization");
  });

  test("does not scan all published or ready Diktats for unrelated storage keys", () => {
    expect(routeSource).not.toContain(".where(and(eq(diktatMateri.status, \"published\"), isNotNull(diktatMateri.fileKey)))");
    expect(routeSource).not.toContain('.where(eq(diktats.status, "ready")),');
    expect(routeSource).toContain("function storageKeyCandidates(key: string)");
  });
});


test("unreferenced course Diktat keys fail closed, including rollback PDFs", () => {
  expect(routeSource).toContain("const protectedKey = isProtectedCourseDiktatPdfKey(key)");
  expect(routeSource).toContain("return { matched: protectedKey, allowed: !protectedKey }");
});


test("classifies current and historical Diktat paths without protecting unrelated media", () => {
  expect(isProtectedCourseDiktatPdfKey("courses/calculus/diktats/lesson.pdf")).toBe(true);
  expect(isProtectedCourseDiktatPdfKey(`courses/calculus/diktats/versions/${"a".repeat(64)}/${"b".repeat(64)}/lesson.pdf`)).toBe(true);
  expect(isProtectedCourseDiktatPdfKey("courses/calculus/materials/lesson.pdf")).toBe(false);
  expect(isProtectedCourseDiktatPdfKey("courses/calculus/diktats/cover.png")).toBe(false);
});
