import { expect, mock, test } from "bun:test";
import { nativeArticleCodingHeader } from "@/lib/coding/native-article-contract";

const revision = "a".repeat(64);
const origin = "https://example.test";
const target = { materialId: "article", sectionId: "section", partId: "exercise", revision };
const locator = { problemId: "problem", version: 4 };
const section = { id: "section", blocks: [{ id: "body", parts: [{ id: "exercise", kind: "coding_exercise", problem: locator }] }] };
let codingMode = "native";
const load = mock(async (_user: string, _target: unknown, _origin: string) => ({
  kind: "article", structured: true, codingMode, revision, data: { id: "article", version: 3, sections: [section] },
}));
mock.module("server-only", () => ({}));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("@/lib/student/native-published-reading", () => ({ loadNativePublishedReading: load }));
mock.module("@/lib/coding/server-access", () => ({ assertCodingSameOrigin: () => {} }));
const { requireNativeArticleCoding, assertNativeArticleProblem } = await import("@/lib/coding/native-article-access");

function request(value?: object) {
  return new Request(origin, { headers: value ? { [nativeArticleCodingHeader]: encodeURIComponent(JSON.stringify(value)) } : {} });
}

test("existing web callers need no native headers, while native scopes require exact published identity", async () => {
  expect(await requireNativeArticleCoding(request(), "learner", "course")).toBeNull();
  expect(load).not.toHaveBeenCalled();
  const verified = await requireNativeArticleCoding(request(target), "learner", "course");
  expect(load).toHaveBeenCalledWith("learner", { courseId: "course", materialId: "article" }, origin);
  expect(verified?.draftKey).toBe("exercise:article:3:exercise");
  expect(() => assertNativeArticleProblem(verified, locator, verified!.surface)).not.toThrow();
  expect(() => assertNativeArticleProblem(verified, { ...locator, version: 5 }, verified!.surface)).toThrow("CODING_INVALID_SURFACE");
  expect(() => assertNativeArticleProblem(verified, locator, { ...verified!.surface, articleVersion: 4 })).toThrow("CODING_INVALID_SURFACE");
  for (const change of [{ partId: "other" }, { sectionId: "other" }, { revision: "b".repeat(64) }]) {
    await expect(requireNativeArticleCoding(request({ ...target, ...change }), "learner", "course")).rejects.toThrow("CODING_FORBIDDEN");
  }
  codingMode = "browser";
  await expect(requireNativeArticleCoding(request(target), "learner", "course")).rejects.toThrow("CODING_FORBIDDEN");
});
