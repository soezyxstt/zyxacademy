import { beforeEach, expect, mock, test } from "bun:test";
import { verifyFormativeCodingGrant } from "@/lib/coding/native-formative-coding-grant";

const origin = "https://reader.example.test";
const secret = "formative-read-fixture-secret";
const revision = "a".repeat(64);
const target = { courseId: "course-alias", materialId: "article", revision, sectionId: "section", blockId: "check" };
const answer = "```python\nprint('answer')\n```";
const explanation = "```py\nprint('explanation')\n```";
const body = { answer, explanation, visualAccess: { answer: "existing-visual-token" } };
let actor: Response | { userId: string };
let codingMode: "native" | "browser";
let latestRevision: string;
const evaluate = mock(async (_request: Request) => Response.json({ ok: true, result: { verdict: "correct" } }));
const reveal = mock(async (_request: Request) => Response.json(body));

mock.module("next/server", () => ({ NextRequest: Request }));
mock.module("@/lib/auth-site-url", () => ({ resolveAuthBaseUrl: () => origin }));
mock.module("@/app/api/native/student/_session", () => ({ requireNativeStudent: async () => actor }));
mock.module("@/lib/student/native-published-reading", () => ({
  loadNativePublishedReading: async () => ({
    revision: latestRevision, codingMode, structured: true, id: "article",
    data: { version: 3, sections: [{ id: "section", blocks: [{ id: "check" }] }] },
  }),
}));
mock.module("@/app/api/materials/formative-check/evaluate/route", () => ({ POST: evaluate }));
mock.module("@/app/api/materials/formative-check/reveal/route", () => ({ POST: reveal }));
mock.module("@/app/api/student/articles/[articleId]/progress/route", () => ({ GET: () => { throw new Error("unexpected progress read"); }, PUT: () => { throw new Error("unexpected progress write"); } }));
mock.module("@/app/(student)/dashboard/actions", () => ({ updateMaterialProgress: () => { throw new Error("unexpected material status"); } }));
mock.module("@/db", () => ({ db: {} }));
mock.module("@/db/schema", () => ({ progress: {} }));
mock.module("@/lib/offline/server-auth", () => ({
  OfflineHttpError: class extends Error { constructor(readonly status: number, message: string) { super(message); } },
}));
const { POST } = await import("@/app/api/native/student/reading/learning/route");

beforeEach(() => {
  process.env.BETTER_AUTH_SECRET = secret;
  actor = { userId: "learner" };
  codingMode = "native";
  latestRevision = revision;
  evaluate.mockClear();
  reveal.mockClear();
});

function request(fields: object = {}) {
  return new Request(`${origin}/api/native/student/reading/learning`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reveal", ...target, ...fields }),
  });
}

test("native reveal adds field-specific coding grants after the authorized canonical reveal", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await reveal.mock.calls[0][0].json()).toEqual({ articleId: "article", articleVersion: 3, sectionId: "section", blockId: "check" });
  const payload = await response.json();
  expect(payload).toMatchObject(body);
  for (const field of ["answer", "explanation"] as const) {
    const claims = verifyFormativeCodingGrant(payload.codingAccess[field], {
      userId: "learner", courseId: "course-alias", articleId: "article", articleVersion: 3, revision, sectionId: "section",
    }, secret);
    expect(claims).toMatchObject({ field, blockId: "check" });
  }
});

test("evaluation, free preview, stale readings and rejected reveals cannot mint native Python grants", async () => {
  expect(await (await POST(request({ action: "evaluate", response: { kind: "choice", optionId: "a" } }))).json()).toEqual({
    ok: true, result: { verdict: "correct" },
  });
  expect(reveal).not.toHaveBeenCalled();
  codingMode = "browser";
  expect(await (await POST(request())).json()).toEqual(body);
  codingMode = "native";
  reveal.mockImplementationOnce(async () => Response.json({ error: "Denied" }, { status: 403 }));
  const denied = await POST(request());
  expect(denied.status).toBe(403);
  expect(await denied.json()).not.toHaveProperty("codingAccess");
  reveal.mockImplementationOnce(async () => {
    actor = new Response(null, { status: 403 });
    return Response.json(body);
  });
  expect((await POST(request())).status).toBe(403);
  actor = { userId: "learner" };
  reveal.mockClear();
  latestRevision = "b".repeat(64);
  expect((await POST(request())).status).toBe(409);
  expect(reveal).not.toHaveBeenCalled();
});
