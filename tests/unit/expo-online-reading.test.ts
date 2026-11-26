import { expect, test } from "bun:test";
import { bindStudentRequest } from "../../apps/mobile-native/features/student/transport";
import type { StudentRequest } from "../../apps/mobile-native/features/student/contracts";
import { OnlineReadingError, readOnlineMaterial } from "../../apps/mobile-native/features/student/courses/online-reading";
import { buildReadingContentHtml } from "../../apps/mobile-native/offline/reading-document";

const target = { courseId: "course", materialId: "material", kind: "article" as const, section: "one" };
const source = "/api/courses/course/articles/material/source-figures/figure";
const revision = "b".repeat(64);
const article = {
  courseId: target.courseId, id: target.materialId, title: "Canonical lesson", chapterId: "chapter", version: 4,
  sections: [{ id: "section", slug: "one", title: "Part one", blocks: [
    { id: "block", blockType: "explanation", content: `Lire $x^2$.\n\n![Figure](${source})` },
  ] }],
};
const data = { id: target.materialId, courseId: target.courseId, kind: "article", title: article.title, revision, data: article, assets: [source] };
const controller = () => new AbortController();

test("online reading follows the Student-bound transport into the same local renderer", async () => {
  const signal = controller().signal;
  const seen: URL[] = [];
  let disposed = 0;
  const request = bindStudentRequest({ origin: "https://student.example", userId: "student", role: "student", locale: "en" }, async (path, init) => {
    expect(path.startsWith("/api/native/student/reading?")).toBe(true);
    expect(new Headers(init?.headers).get("x-student-id")).toBe("student");
    expect(init?.signal).toBe(signal);
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    const url = new URL(path, "https://student.example");
    seen.push(url);
    return Object.assign(url.searchParams.has("asset")
      ? new Response(Uint8Array.of(31, 32, 33), { headers: { "Content-Type": "image/png" } })
      : Response.json(data), { dispose: () => { disposed++; } });
  });
  const loaded = await readOnlineMaterial(request, target, "en", signal);
  expect(seen).toHaveLength(2);
  expect(seen[1].searchParams.get("asset")).toBe(source);
  expect(seen[1].searchParams.get("revision")).toBe(revision);
  expect(disposed).toBe(2);
  const html = buildReadingContentHtml(loaded, "", "light")!;
  expect(html).toContain('<img src="data:image/png;base64,HyAh"');
  expect(html).toContain("<math");
  expect(html).toContain("Part one");
  expect(html).not.toContain("api/courses");
});

test("canonical Diktat markdown is read without using the PDF download capability", async () => {
  const response = { ...data, kind: "diktat", assets: [],
    data: { ...article, kind: "article", docCategory: "diktat", contentVersion: 2, body: "Diktat teorema" } };
  const content = await readOnlineMaterial(async () => Response.json(response), { ...target, kind: "diktat" }, "id", controller().signal);
  expect(buildReadingContentHtml(content, "", "light")).toContain("Diktat teorema");
});

test("resource mismatch and authorization errors never expose a partially loaded document", async () => {
  let count = 0;
  const mismatched: StudentRequest = async () => { count++; return Response.json({ ...data, courseId: "other" }); };
  await expect(readOnlineMaterial(mismatched, target, "id", controller().signal)).rejects.toMatchObject({ status: 502 });
  expect(count).toBe(1);
  const forbidden: StudentRequest = async path => path.includes("asset=") ? new Response(null, { status: 403 }) : Response.json(data);
  await expect(readOnlineMaterial(forbidden, target, "id", controller().signal)).rejects.toMatchObject({ status: 403 });
  const changed: StudentRequest = async path => path.includes("asset=") ? new Response(null, { status: 409 }) : Response.json(data);
  await expect(readOnlineMaterial(changed, target, "id", controller().signal)).rejects.toMatchObject({ status: 409 });
});

test("asset failures leave the authored image fallback, while aborted reads return no content", async () => {
  const request: StudentRequest = async path => path.includes("asset=") ? new Response(null, { status: 503 }) : Response.json(data);
  const content = await readOnlineMaterial(request, target, "en", controller().signal);
  const html = buildReadingContentHtml(content, "", "light")!;
  expect(html).toContain("offline-img-fallback");
  expect(html).not.toContain("<img");
  const cancel = controller();
  cancel.abort();
  await expect(readOnlineMaterial(request, target, "en", cancel.signal)).rejects.not.toBeInstanceOf(OnlineReadingError);
});

test("the normal document and PKA routes retain the protected modal gate", async () => {
  const app = await Bun.file("apps/mobile-native/routing/ProductRoute.tsx").text();
  const template = await Bun.file("scripts/native-readiness/product/ProductRoute.tsx.in").text();
  const reader = await Bun.file("apps/mobile-native/features/student/courses/OnlineReading.tsx").text();
  for (const owner of [app, template]) {
    expect(owner).toContain('pattern === "/courses/[id]/material/[materialId]" || pattern === "/courses/tutorial-pka/material/[materialId]"');
    expect(owner).toContain("enabled={studentAssessment || studentReading}");
  }
  expect(reader).toContain("visible={open && !suspended}");
  expect(reader).toContain("return () => ctrl.abort()");
  expect(reader).not.toContain("reading-store");
});
