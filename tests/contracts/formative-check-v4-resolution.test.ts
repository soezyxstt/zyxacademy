import { expect, mock, test } from "bun:test";

const payload = { checkKind: "short_answer" as const, answer: "limit", explanation: "Pembahasan" };
const marker = (version: number) => `Konten\n\n<!--__ZYX_V${version}_BLOCK_PAYLOAD__:${Buffer.from(JSON.stringify({ formativeCheckPayload: payload, parts: [] })).toString("base64url")}-->`;
let version = 4;
let calls = 0;
const chain: Record<string, any> = {};
for (const method of ["from", "where"]) chain[method] = () => chain;
chain.limit = async () => {
  calls++;
  if (calls % 3 === 1) return [{ id: "article", courseId: "course", title: "Artikel", version: 1, structureStatus: "structured" }];
  if (calls % 3 === 2) return [{ id: "section", title: "Bagian", learningObjective: "Tujuan" }];
  return [{ id: "block", blockType: "retrieval_prompt", content: marker(version) }];
};
mock.module("@/db", () => ({ db: { select: () => chain } }));
const { resolvePublishedFormativeCheck } = await import("@/lib/materials/formative-check-server");

test("published formative resolver reads both V3 and V4 payload markers", async () => {
  for (version of [3, 4]) {
    const result = await resolvePublishedFormativeCheck({ articleId: "article", articleVersion: 1, sectionId: "section", blockId: "block" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.context.block.content).toBe("Konten");
      expect(result.context.formativeCheck).toEqual(payload);
    }
  }
});
