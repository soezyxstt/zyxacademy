import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { demoStudentHref } from "@/lib/demo/routes";
import { discussionPayload } from "@/lib/notifications/templates";

test("discussion notification links resolve the recipient's current role on opening", () => {
  for (const [role, page] of [
    ["student", "app/(student)/dashboard/discussions/page.tsx"],
    ["tutor", "app/(tutor)/tutor/discussions/page.tsx"],
    ["admin", "app/(admin)/admin/discussions/page.tsx"],
  ] as const) {
    expect(existsSync(page)).toBe(true);
    const href = discussionPayload({ role, channelId: "c", threadId: "t", seq: 1 }).link;
    expect(href).toBe("/discussions?thread=t");
  }
  expect(existsSync("app/(student)/courses/[id]/discussions/page.tsx")).toBe(true);
  expect(existsSync("app/(tutor)/tutor/[courseId]/discussions/page.tsx")).toBe(true);
});

test("global tutor discussions is reserved from course sidebar routing", () => {
  const source = readFileSync("components/tutor/tutor-sidebar.tsx", "utf8");
  const excludedRoutes = source.match(/!\[([^\]]+)\]\.includes\(parts\[1\]\)/)?.[1];
  expect(excludedRoutes?.match(/"[^"]+"/g)).toContain('"discussions"');
  expect(source).toContain('href="/tutor/discussions"');
  expect(source).toContain('/${courseId}/discussions');
});

test("student sidebar routes discussion links through the demo adapter", () => {
  const source = readFileSync("components/student-sidebar.tsx", "utf8");
  expect(source).toContain('href={href("/dashboard/discussions")}');
  expect(source).toContain('href: `${base}/discussions`');
  expect(source).toContain('href: href(item.href)');
  expect(demoStudentHref("id", "/dashboard/discussions", "math")).toBe("/id/demo/discussions?course=math");
  expect(demoStudentHref("id", "/courses/math/discussions", "math")).toBe("/id/demo/course-discussions?course=math");
});
