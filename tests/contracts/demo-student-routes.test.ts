import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { expect, test } from "bun:test";
import { demoStudentHref, demoStudentPath } from "@/lib/demo/routes";

test("student navigation keeps its course context inside the demo", () => {
  expect(demoStudentHref("id", "/courses/ma1101", "fi1101")).toBe("/id/demo/overview?course=ma1101");
  expect(demoStudentHref("en", "/courses/fi1101/material", "ma1101")).toBe("/en/demo/documents?course=fi1101");
  expect(demoStudentHref("id", "/courses/ki1101/quiz", "ma1101")).toBe("/id/demo/quiz-list?course=ki1101");
  expect(demoStudentHref("id", "/courses/ki1101/quiz/fictional-quiz", "ma1101")).toBe("/id/demo/quiz-start?course=ki1101");
  expect(demoStudentHref("id", "/dashboard/schedule?course=wi1102", "ma1101")).toBe("/id/demo/schedule?course=wi1102");
  expect(demoStudentHref("id", "https://example.test/courses/ma1101", "fi1101")).toBe("/id/demo?course=fi1101");
});

test("the shared student shell receives the original account or course route", () => {
  expect(demoStudentPath("dashboard", "ma1101")).toBe("/dashboard");
  expect(demoStudentPath("overview", "ma1101")).toBe("/courses/ma1101");
  expect(demoStudentPath("documents", "ma1101")).toBe("/courses/ma1101/material");
  expect(demoStudentPath("article", "ma1101")).toBe("/courses/ma1101/material/reader");
  expect(demoStudentPath("profile", "ma1101")).toBe("/profile");
});

test("corrupt navigation and leaderboard tabs stay within the fictional account", () => {
 expect(demoStudentHref("id", "/courses/%E0%A4%A/quiz", "ma1101")).toBe("/id/demo?course=ma1101");
 expect(demoStudentHref("en", "/courses/fi1101/leaderboard?type=simulation", "ma1101")).toBe("/en/demo/course-leaderboard?course=fi1101&type=simulation");
});

test("bare demo routes resolve browser language before account locale lookup", () => {
 const request = new NextRequest("http://localhost/demo/profile", { headers: { cookie: "better-auth.session_token=fictional-cookie; zyx_locale=en", "x-app-locale": "id" } });
 const response = proxy(request);
 expect(response.headers.get("x-middleware-request-x-app-locale")).toBe("en");
 expect(response.headers.get("x-middleware-rewrite")).toBeNull();
 const protectedPage = proxy(new NextRequest("http://localhost/profile", { headers: { "x-app-locale": "en" } }));
 expect(protectedPage.status).toBe(307);
 expect(protectedPage.headers.get("location")).toContain("/sign-in");
});
