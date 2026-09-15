import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

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
    expect(routeSource).toContain('if (diktatAuthorization.matched) {\n      headers.set("Cache-Control", "private, no-store");');
    expect(routeSource).not.toContain('headers.set("Cache-Control", "public, max-age=3600")');
    expect(routeSource).not.toContain("if (isDownload && !(await resolveDiktatAuthorization");
  });

  test("does not scan all published or ready Diktats for unrelated storage keys", () => {
    expect(routeSource).not.toContain(".where(and(eq(diktatMateri.status, \"published\"), isNotNull(diktatMateri.fileKey)))");
    expect(routeSource).not.toContain('.where(eq(diktats.status, "ready")),');
    expect(routeSource).toContain("function storageKeyCandidates(key: string)");
  });
});
