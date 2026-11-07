import { expect, test } from "bun:test";
import { R2Provider } from "@/lib/storage/r2";
test("bounded storage listing forwards only one page and preserves continuation", async () => {
  const provider = new R2Provider(); let calls = 0;
  Object.defineProperty(provider, "s3", { value: { send: async (command: { input: Record<string, unknown> }) => {
    calls++; expect(command.input).toMatchObject({ Prefix: "media/course/", MaxKeys: 25, ContinuationToken: "cursor" });
    return { Contents: [{ Key: "media/course/file.pdf", Size: 10, LastModified: new Date(0) }], IsTruncated: true, NextContinuationToken: "next" };
  } } });
  const page = await provider.listPage("media/course/", 25, "cursor");
  expect(page.objects).toHaveLength(1); expect(page.cursor).toBe("next"); expect(calls).toBe(1);
});
test("invalid keys and limits are rejected before contacting storage", async () => {
  const provider = new R2Provider(); let calls = 0;
  Object.defineProperty(provider, "s3", { value: { send: async () => { calls++; throw new Error("should not send"); } } });
  await expect(provider.listPage("../private", 1)).rejects.toThrow("INVALID_OBJECT_KEY");
  await expect(provider.listPage("media/", 1001)).rejects.toThrow("INVALID_LIST_LIMIT");
  expect(calls).toBe(0);
});
