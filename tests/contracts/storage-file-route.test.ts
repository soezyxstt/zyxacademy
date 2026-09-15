import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const routeSource = readFileSync("app/api/storage/file/[...key]/route.ts", "utf8");

describe("storage file authorization boundary", () => {
  test("authorizes Diktat delivery before fetching bytes, independent of disposition", () => {
    const authorization = routeSource.indexOf("if (!(await canDownloadDiktat");
    const objectFetch = routeSource.indexOf("const command = new GetObjectCommand");

    expect(authorization).toBeGreaterThan(-1);
    expect(authorization).toBeLessThan(objectFetch);
    expect(routeSource).not.toContain("if (isDownload && !(await canDownloadDiktat");
  });
});
