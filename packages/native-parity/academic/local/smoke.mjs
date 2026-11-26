import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:3314";

export function fixtureCookie(role) {
  const token = "fixture-academic-" + role;
  const signature = createHmac("sha256", "academic-local-fixture-secret-for-smoke-only").update(token).digest("base64");
  return "better-auth.session_token=" + encodeURIComponent(token + "." + signature);
}

const cases = [
  [null,"tutor/dashboard",401],["student","tutor/dashboard",403],["admin","tutor/dashboard",403],
  ["tutor","tutor/dashboard",200,x=>assert.equal(x.courses.length,2)],
  ["tutor","tutor/courses/academic-course-1/participants",200,x=>assert.equal(x.participants[0].name,"Nadia Lestari")],
  ["tutor","tutor/courses/academic-course-2/participants",200,x=>assert.equal(x.participants.length,0)],
  ["tutor","tutor/courses/academic-course-3/participants",403],["tutor","tutor/courses/academic-course-1/analytics",200],
  ["tutor","tutor/courses/academic-course-1/grading",200],["tutor","tutor/courses/academic-course-3/grading",403],
  ["admin","admin/courses",200,x=>assert.equal(x.length,3)],
  ["admin","admin/courses/biologi-dasar",200,x=>assert.equal(x.course.id,"academic-course-1")],
  ["admin","admin/courses/missing",404],["tutor","admin/courses",403],["student","admin/courses",403]
];

for (const [role, path, expected, verify] of cases) {
  const response = await fetch(origin + "/api/native/academic/" + path, {
    headers: role ? { cookie: fixtureCookie(role) } : {}, redirect: "manual",
  });
  assert.equal(response.status, expected, role + " " + path);
  if (verify) verify(await response.json());
  console.log(role ?? "anonymous", path, response.status);
}
