import { describe, expect, it } from "bun:test";
import { ilike } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { user } from "@/db/schema";

describe("PostgreSQL search", () => {
  it("compiles case-insensitive searches with a bound pattern", () => {
    const query = new PgDialect().sqlToQuery(ilike(user.name, "%Example%"));
    expect(query.sql).toMatch(/\bilike\b/i);
    expect(query.params).toEqual(["%Example%"]);
  });

  it("keeps the migrated search callers case-insensitive", async () => {
    const paths = [
      "lib/admin-ops-ai/domain-assessment.ts", "lib/admin-ops-ai/domain-groups.ts",
      "lib/admin-ops-ai/tools.ts", "lib/admin-ops-ai/runtime-tools.ts",
      "app/(admin)/admin/(academic)/groups/actions.ts", "app/api/admin/products/route.ts",
      "app/api/search/route.ts", "lib/authoring/mcp-server.ts",
    ];
    for (const path of paths) {
      const source = await Bun.file(path).text();
      expect(source).toMatch(/\bilike\(/);
      expect(source).not.toMatch(/\blike\(/);
    }
  });
});
