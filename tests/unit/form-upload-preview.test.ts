import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

test("upload previews use local bytes while submitted answers retain the storage URL", async () => {
  const require = createRequire(import.meta.url);
  const { transformSync } = require(process.env.UI_TEST_ESBUILD ?? "esbuild");
  const source = readFileSync("components/forms/public-form-viewer.tsx", "utf8");
  const upload = source.slice(source.indexOf("  const handleFileUpload ="), source.indexOf("  const validateEmail ="));
  const module = { exports: {} as any };
  const uploadPreviews = { current: { 2: { url: "blob:old", name: "old.pdf" } } as Record<number, { url: string; name: string }> };
  const mounted = { current: true };
  const revoked: string[] = [], saved: unknown[] = [];
  let created = 0, previewType = "";
  runInNewContext(transformSync(`${upload}\nexport { handleFileUpload };`, { loader: "ts", format: "cjs" }).code, {
    module, exports: module.exports, uploadPreviews, mounted,
    URL: { createObjectURL: (blob: Blob) => { previewType = blob.type; return `blob:new-${++created}`; }, revokeObjectURL: (url: string) => revoked.push(url) },
    Blob,
    FormData: class { append() {} }, form: { title: "Survey", slug: "survey", questions: [{}] },
    formFileSizeLimitMb: () => 50, uploadInFlightRef: { current: false },
    setUploadingQIdx: () => {}, setUploadProgress: () => {}, setInterval: () => 1, clearInterval: () => {},
    fetch: async () => ({ json: async () => ({ success: true, url: "/api/storage/file/forms/survey/question-1/file.pdf" }) }),
    handleAnswerChange: (index: number, value: string) => saved.push([index, value]),
    toast: { success: () => {}, error: () => {} }, t: (key: string) => key,
  });
  await module.exports.handleFileUpload(2, new File(["content"], "file.pdf", { type: "application/pdf" }));
  expect(saved).toEqual([[2, "/api/storage/file/forms/survey/question-1/file.pdf"]]);
  expect(uploadPreviews.current[2]).toEqual({ url: "blob:new-1", name: "file.pdf" });
  expect(previewType).toBe("application/octet-stream");
  expect(revoked).toEqual(["blob:old"]);
  expect(source).toContain("href={uploadPreviews.current[qIdx]?.url ?? String(answerVal)}");
  expect(source).toContain("download={uploadPreviews.current[qIdx]?.name}");
  expect(source).toContain("URL.revokeObjectURL(uploadPreviews.current[qIdx].url)");
  mounted.current = false;
  await module.exports.handleFileUpload(3, { size: 10 });
  expect(created).toBe(1);
  expect(saved).toHaveLength(1);
});
