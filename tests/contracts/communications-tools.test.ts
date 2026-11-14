import { expect, mock, test } from "bun:test";

const registered = new Map<string, { scope: string; schema: any; write: boolean }>();
mock.module("@/lib/admin-mcp/toolkit", () => {
  const { z } = require("zod");
  return { adminId: z.string().min(1), adminRevision: z.string().regex(/^[a-f0-9]{64}$/), adminPagination: { limit: z.number(), offset: z.number() }, adminToolkit: () => ({
    read: (name: string, scope: string, schema: unknown) => registered.set(name, { scope, schema, write: false }),
    write: (name: string, scope: string, schema: unknown) => registered.set(name, { scope, schema, write: true }),
  }) };
});

test("communications tools register explicit scopes and validate mutation input", async () => {
  const { registerCommunicationsTools } = await import("@/lib/admin-mcp/communications-tools");
  const { registerBlogTools } = await import("@/lib/admin-mcp/blog-tools");
  registerCommunicationsTools({} as never, { actorId: "admin" } as never);
  registerBlogTools({} as never, { actorId: "admin" } as never);
  expect(registered.get("blog.create")?.scope).toBe("blog:write");
  expect(registered.get("links.delete")?.scope).toBe("links:write");
  expect(registered.get("blog.get")?.write).toBe(false);
  expect(registered.get("blog.search")?.scope).toBe("blog:read");
  expect(registered.get("blog.validate")?.write).toBe(false);
  expect(registered.get("blog.create")?.schema.safeParse({ title: "Judul", content: "Isi", status: "published" }).success).toBe(false);
  expect(registered.get("links.create")?.schema.safeParse({ title: "a", url: "javascript:alert(1)" }).success).toBe(false);
  expect(registered.get("links.update")?.schema.safeParse({ id: "1", expectedRevision: "a".repeat(64), changes: {} }).success).toBe(false);
  expect(registered.get("blog.set_publication")?.schema.safeParse({ id: "1", expectedRevision: "bad", published: true }).success).toBe(false);
});
