import { describe, expect, test } from "bun:test";
import { operationsPatterns } from "../../../apps/mobile-native/features/operations/routes";
import {
  blogArticleHref, blogListHref, createPublicClient, demoViews,
  isNativeDemoContentView, nativeDemoContentViews, parseBlogQuery, resolvePublicRoute,
} from "./public-contract";
import {
  createFixturePublicClient, publicArticleFixture, publicCases,
} from "./public-fixtures";

describe("public operations routes", () => {
  test("registers three runnable named cases per public route", () => {
    expect(publicCases).toHaveLength(39);
    expect(new Set(publicCases.map((item) => item.id)).size).toBe(publicCases.length);
    for (const pattern of operationsPatterns.public) {
      const cases = publicCases.filter((item) => item.pattern === pattern);
      expect(cases).toHaveLength(3);
      for (const item of cases) {
        expect(resolvePublicRoute(item.href)).not.toBeNull();
        expect(item.steps.length).toBeGreaterThan(0);
      }
    }
  });

  test("validates paths and maps filters, article bookmarks, and demo selections", () => {
    expect(resolvePublicRoute("/")).toEqual({ kind: "static", path: "/" });
    expect(resolvePublicRoute(blogListHref("tips_kuliah", 2))).toEqual({ kind: "blog", category: "tips_kuliah", page: 2 });
    expect(resolvePublicRoute("/blog?category=unknown&page=-1")).toEqual({ kind: "blog", category: null, page: 1 });
    expect(resolvePublicRoute(blogArticleHref("ruang belajar"))).toEqual({ kind: "article", slug: "ruang belajar" });
    expect(parseBlogQuery("tips_kuliah", "1000001")).toEqual({ category: "tips_kuliah", page: 1 });
    expect(resolvePublicRoute("/demo/article?course=a&articleId=b")).toEqual({
      kind: "demo", view: "article", course: "a", search: "?course=a&articleId=b",
    });
    expect(resolvePublicRoute("/demo/quiz?course=a&course=b")).toEqual({ kind: "missing" });
    expect(resolvePublicRoute("/demo/quiz?quizOffset= -1")).toEqual({ kind: "missing" });
    expect(resolvePublicRoute("/demo/unknown")).toEqual({ kind: "missing" });
    for (const invalid of ["/blog/%2Fprivate", "/blog/%", "/blog/../plans", "/blog/ab%00c", "/\\blog", "//evil.test/blog"]) {
      expect(resolvePublicRoute(invalid)).toBeNull();
    }
    for (const route of ["/sign-in", "/sign-up", "/sign-out", "/admin"]) {
      expect(resolvePublicRoute(route)).toBeNull();
    }
  });

  test("tracks every detailed demo variant and verifies scoped content fixtures", async () => {
    const client = createFixturePublicClient();
    expect((await client.demo()).courses[0].id).toBe("demo-kalkulus");
    for (const view of demoViews) expect(resolvePublicRoute(`/demo/${view}`)).toMatchObject({ kind: "demo", view });
    for (const view of nativeDemoContentViews) {
      expect(isNativeDemoContentView(view)).toBe(true);
      expect((await client.demoContent(view, "?course=demo-kalkulus"))?.kind).toBe(view);
      expect(await client.demoContent(view, "?course=other")).toBeNull();
    }
    expect(isNativeDemoContentView("zyra")).toBe(false);
    const quiz = await client.demoContent("quiz", "?course=demo-kalkulus");
    if (quiz?.kind !== "quiz") throw new Error("Expected quiz fixture");
    const { courseId, offset, token, questions } = quiz;
    const answer = { courseId, quizOffset: offset, questionSetToken: token, questionIds: questions.map((question) => question.id), answers: [[1]] };
    expect(await client.gradeDemoQuiz(answer)).toMatchObject({ score: 1, total: 1 });
    expect(await client.gradeDemoQuiz({ ...answer, answers: [[0]] })).toMatchObject({ score: 0, total: 1 });
    expect(await client.gradeDemoQuiz({ ...answer, questionSetToken: "expired" })).toBeNull();
  });

  test("blog is deterministic across open, detail, back, pagination, empty and retry", async () => {
    const client = createFixturePublicClient();
    const index = await client.blog(null, 1);
    expect(index.articles[0].slug).toBe(publicArticleFixture.slug);
    const detail = await client.article(index.articles[0].slug);
    expect(detail?.article).toEqual(publicArticleFixture);
    expect(detail?.related.every(({ slug }) => slug !== publicArticleFixture.slug)).toBe(true);
    expect(await client.blog(null, 1)).toEqual(index);
    expect((await client.blog("tips_kuliah", 1)).articles).toHaveLength(12);
    expect((await client.blog("tips_kuliah", 2)).articles).toHaveLength(2);
    expect(await client.blog("kegiatan_zyx", 1)).toEqual({ total: 0, articles: [], sections: [] });
    expect(await client.article("missing")).toBeNull();
    const retry = createFixturePublicClient("recoverable");
    await expect(retry.blog(null, 1)).rejects.toThrow();
    expect(await retry.blog(null, 1)).toEqual(index);
    await expect(retry.article(publicArticleFixture.slug)).rejects.toThrow();
    expect(await retry.article(publicArticleFixture.slug)).toEqual(detail);
  });

  test("plans, downloads and email settings model bounded outcomes and recovery", async () => {
    const offline = createFixturePublicClient("empty");
    expect(await offline.release()).toEqual({ channel: "stable", release: null });
    expect(await offline.unsubscribe("fixture-course-updates", "inspect")).toBeNull();

    const client = createFixturePublicClient("recoverable");
    const planInput = { people: 3, subjects: ["Matematika I"], otherSubjects: 0 };
    await expect(client.plans(planInput)).rejects.toThrow();
    const quote = await client.plans(planInput);
    expect(quote.quotes).toHaveLength(5);
    expect(quote.quotes[0].price).toBeGreaterThan(0);
    expect((await client.plans({ ...planInput, people: 4 })).quotes[0].price).toBeGreaterThan(quote.quotes[0].price);
    await expect(client.release()).rejects.toThrow();
    expect((await client.release()).release?.downloads.android).toBeTruthy();
    await expect(client.unsubscribe("fixture-course-updates", "inspect")).rejects.toThrow();
    expect(await client.unsubscribe("fixture-course-updates", "inspect")).toBe("course_updates");
    await expect(client.unsubscribe("fixture-course-updates", "confirm")).rejects.toThrow();
    expect(await client.unsubscribe("fixture-course-updates", "confirm")).toBe("course_updates");
    expect(await client.unsubscribe("bad", "inspect")).toBeNull();
  });
});

describe("public operations HTTPS transport", () => {
  test("sends guest requests to the configured origin with bounded query, locale and cancellation", async () => {
    const received: Request[] = [];
    const client = createPublicClient("https://staging.zyxacademy.com", "en", Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
      received.push(new Request(input, init));
      return Response.json({ release: null });
    }, { preconnect() {} }));
    const controller = new AbortController();
    await client.blog("tips_kuliah", 2, controller.signal);
    await client.article("bahasa indonesia");
    await client.demoContent("article", "?course=calculus&articleId=integral");
    await client.plans({ people: 3, subjects: ["Matematika I"], otherSubjects: 1 });
    expect(await client.release()).toEqual({ channel: "nightly", release: null });
    await client.unsubscribe("secret-token", "inspect");
    expect(received.map(({ url, method }) => [method, new URL(url).pathname + new URL(url).search])).toEqual([
      ["GET", "/api/native/public/blog?category=tips_kuliah&page=2"],
      ["GET", "/api/native/public/blog/bahasa%20indonesia"],
      ["GET", "/api/native/public/demo/article?course=calculus&articleId=integral"],
      ["POST", "/api/native/public/plans"],
      ["GET", "/api/app/latest?channel=nightly"],
      ["POST", "/api/native/public/unsubscribe"],
    ]);
    expect(received.every(({ credentials, redirect, url }) => credentials === "omit" && redirect === "error" && new URL(url).hostname === "staging.zyxacademy.com")).toBe(true);
    expect(received[0].headers.get("Accept-Language")).toBe("en");
    controller.abort();
    expect(received[0].signal.aborted).toBe(true);
    expect(await received[3].json()).toMatchObject({ locale: "en", people: 3, otherSubjects: 1 });
    expect(await received[5].json()).toEqual({ token: "secret-token", intent: "inspect" });
  });

  test("distinguishes missing content from unavailable service and stale quiz order", async () => {
    const responses = [404, 404, 409, 503];
    const client = createPublicClient("https://example.test", "id", Object.assign(async () => new Response(null, { status: responses.shift() }), { preconnect() {} }));
    expect(await client.article("missing")).toBeNull();
    expect(await client.unsubscribe("expired", "inspect")).toBeNull();
    expect(await client.gradeDemoQuiz({ courseId: "a", questionSetToken: "old", answers: [[1]], questionIds: ["q"], quizOffset: 0 })).toBeNull();
    await expect(client.blog(null, 1)).rejects.toThrow("Public request failed");
    expect(() => createPublicClient("http://example.test", "id")).toThrow();
  });
});
