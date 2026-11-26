import assert from "node:assert/strict";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(origin.hostname)) throw new Error("Expected a local Next.js origin");
const courseId = "matematika-1";
for (const scenario of ["enrolled", "unenrolled", "revoked"] as const) {
  const userId = "student-evidence-" + scenario;
  const { name, value } = await localStudentCookie(scenario);
  const headers = { cookie: name + "=" + value, "x-student-id": userId, "x-app-locale": "id" };
  const read = async (query: Record<string, string>, expected = userId) => {
    const path = "/api/native/student/courses?" + new URLSearchParams(query);
    return fetch(new URL(path, origin), { headers: { ...headers, "x-student-id": expected }, redirect: "error" });
  };
  assert.equal((await read({ view: "dashboard" }, "wrong-account")).status, 409);
  for (const view of ["dashboard", "dashboard-extras", "catalog", "course", "material-list", "material-detail"]) {
    const query: Record<string, string> = { view };
    if (!["dashboard", "dashboard-extras", "catalog"].includes(view)) query.courseId = courseId;
    if (view === "material-detail") query.materialId = "dokumen-4";
    const response = await read(query);
    const body = await response.json();
    assert.equal(response.status, 200, scenario + "/" + view + ": " + JSON.stringify(body));
    assert.equal(body.view, view);
    if (view === "dashboard") {
      assert.equal(body.firstName, { enrolled: "Alya", unenrolled: "Bima", revoked: "Citra" }[scenario]);
      assert.equal(body.enrolled.some((item: {id:string}) => item.id === courseId), scenario === "enrolled");
    }
    if (view === "dashboard-extras") {
      if (scenario === "enrolled") {
        assert.equal(body.partial, false);
        assert.equal(typeof body.today?.streak, "number");
        assert.equal(body.mastery?.courseId, courseId);
      } else {
        assert.deepEqual(body, { view });
      }
    }
    if (view === "course") assert.equal(body.course.hasFullContentAccess, scenario === "enrolled");
    if (view === "material-list") assert.ok(body.materials.some((item: {id:string}) => item.id === "dokumen-4"));
    if (view === "material-detail") assert.equal(body.material.locked, scenario !== "enrolled");
    console.log(scenario, view, response.status);
  }
  assert.equal((await read({ view: "material-detail", courseId, materialId: "missing" })).status, 404);
}
