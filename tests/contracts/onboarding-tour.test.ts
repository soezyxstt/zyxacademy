import { describe, expect, test } from "bun:test";
import { applyTourAction, canUseTour, parseTourMutation, TOUR_STEP_COUNT, type TourState } from "@/lib/onboarding/tour-state";
import { createTourApi } from "@/lib/onboarding/tour-api";

const now = "2026-11-25T12:00:00.000Z";
const running: TourState = { version: 1, generation: 1, status: "in_progress", stepIndex: 3, courseId: "course-a", updatedAt: now };

describe("tour state", () => {
  test("only explicit start, restart or skip creates a first-use choice", () => {
    expect(applyTourAction(null, { action: "progress", generation: 1, stepIndex: 3 }, now)).toBeNull();
    expect(applyTourAction(null, { action: "complete", generation: 1 }, now)).toBeNull();
    expect(applyTourAction(null, { action: "skip", generation: 0 }, now)).toMatchObject({ status: "skipped", stepIndex: 0, courseId: null });
    expect(applyTourAction(null, { action: "start", generation: 0, courseId: "course-a" }, now)).toMatchObject({ status: "in_progress", stepIndex: 0, courseId: "course-a" });
  });

  test("progress keeps its chosen course and cannot move backward", () => {
    expect(applyTourAction(running, { action: "progress", generation: 1, stepIndex: 1 }, now)).toBe(running);
    expect(applyTourAction(running, { action: "progress", generation: 1, stepIndex: 4 }, now)).toMatchObject({ stepIndex: 4, courseId: "course-a" });
    expect(applyTourAction(running, { action: "start", generation: 1, courseId: "another-course" }, now)).toBe(running);
    expect(applyTourAction(running, { action: "progress", generation: 1, stepIndex: -1 }, now)).toBe(running);
  });

  test("completion requires the final step and cannot override a skip", () => {
    expect(applyTourAction(running, { action: "complete", generation: 1 }, now)).toBe(running);
    const finalStep = { ...running, stepIndex: TOUR_STEP_COUNT - 1 };
    expect(applyTourAction(finalStep, { action: "complete", generation: 1 }, now)?.status).toBe("completed");
    for (const status of ["completed", "skipped"] as const) {
      const terminal = { ...finalStep, status };
      for (const action of [{ action: "start", generation: 1 }, { action: "progress", generation: 1, stepIndex: 8 }, { action: "complete", generation: 1 }, { action: "skip", generation: 1 }] as const) {
        expect(applyTourAction(terminal, action, now)).toBe(terminal);
      }
      expect(applyTourAction(terminal, { action: "restart", generation: 1 }, now)).toMatchObject({ status: "in_progress", stepIndex: 0, courseId: null });
    }
  });

  test("restart binds a new run and ignores stale progress, skip and duplicate restart", () => {
    const restarted = applyTourAction(running, { action: "restart", generation: 1, courseId: "course-b" }, now)!;
    expect(restarted).toMatchObject({ generation: 2, status: "in_progress", stepIndex: 0, courseId: "course-b" });
    for (const action of [
      { action: "progress", stepIndex: 8, generation: 1 },
      { action: "complete", generation: 1 },
      { action: "skip", generation: 1 },
      { action: "restart", generation: 1, courseId: "wrong-course" },
    ] as const) expect(applyTourAction(restarted, action, now)).toBe(restarted);
    expect(applyTourAction(restarted, { action: "progress", generation: 2, stepIndex: 1 }, now)).toMatchObject({ generation: 2, stepIndex: 1 });
    expect(applyTourAction(null, { action: "restart", generation: 4 }, now)).toBeNull();
    expect(applyTourAction(null, { action: "skip", generation: 4 }, now)).toBeNull();
  });

  test("validates versions, roles, step bounds and course metadata without trusting client user IDs", () => {
    const base = { role: "student", version: 1, generation: 0, action: "start" };
    expect(parseTourMutation(base)).toEqual({ ...base, courseId: null });
    expect(parseTourMutation({ ...base, role: "tutor", courseId: "course/a" })).toMatchObject({ courseId: "course/a" });
    for (const invalid of [
      { ...base, userId: "victim" }, { ...base, role: "admin" }, { ...base, version: 2 },
      { ...base, generation: undefined }, { ...base, generation: -1 }, { ...base, generation: 0.5 }, { ...base, generation: 2_147_483_648 },
      { ...base, courseId: "x".repeat(129) }, { ...base, courseId: " " }, { ...base, courseId: "a\nb" },
      { ...base, action: "progress", stepIndex: 9 }, { ...base, action: "progress", stepIndex: 0.5 },
      { ...base, action: "progress" }, { ...base, action: "progress", stepIndex: 3, courseId: null },
      { ...base, action: "skip", stepIndex: 0 }, { ...base, action: "complete", courseId: "course-a" },
    ]) expect(parseTourMutation(invalid)).toBeNull();
  });

  test("uses active canonical membership and excludes every admin", () => {
    expect(canUseTour("student", ["murid"])).toBe(true);
    expect(canUseTour("tutor", ["tutor"], "teacher")).toBe(true);
    expect(canUseTour("student", [], "student")).toBe(false);
    expect(canUseTour("tutor", ["murid"], "teacher")).toBe(false);
    expect(canUseTour("student", ["murid", "admin"])).toBe(false);
    expect(canUseTour("tutor", ["tutor"], "admin")).toBe(false);
  });
});

function fixture(options: { id?: string | null; roles?: string[]; legacyRole?: string; fail?: boolean; current?: TourState | null; selectedCourse?: string | null; selectionFails?: boolean } = {}) {
  const reads: unknown[][] = [];
  const writes: unknown[][] = [];
  const selections: unknown[][] = [];
  const api = createTourApi({
    getSession: async () => options.id === null ? null : { user: { id: options.id ?? "account-a", role: options.legacyRole ?? "student" } },
    getRoles: async () => options.roles ?? ["murid"],
    get: async (...args) => { reads.push(args); if (options.fail) throw new Error("private database credentials"); return options.current === undefined ? running : options.current; },
    mutate: async (...args) => { writes.push(args); if (options.fail) throw new Error("private database credentials"); return running; },
    selectCourse: async (...args) => { selections.push(args); if (options.selectionFails) throw new Error("private catalog credentials"); return options.selectedCourse === undefined ? args[2] : options.selectedCourse; },
  });
  return { api, reads, writes, selections };
}

function request(body?: unknown, headers: Record<string, string> = {}, role = "student") {
  return new Request(`https://staging.zyxacademy.com/api/onboarding/tour?role=${role}`, {
    method: body === undefined ? "GET" : "PUT",
    headers: { "x-user-id": "account-a", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("tour API account boundary", () => {
  test("returns account-owned state with no-store responses", async () => {
    const { api, reads } = fixture();
    const response = await api.GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ state: running });
    expect(reads).toEqual([["account-a", "student"]]);
  });

  test("rejects a cookie switched to another account before reading or writing", async () => {
    const { api, reads, writes } = fixture({ id: "account-b" });
    expect((await api.GET(request())).status).toBe(409);
    expect((await api.PUT(request({ role: "student", version: 1, generation: 0, action: "skip" }))).status).toBe(409);
    expect(reads).toHaveLength(0);
    expect(writes).toHaveLength(0);
  });

  test("rejects missing identity, signed-out users, inactive roles and admin memberships", async () => {
    const body = { role: "student", version: 1, generation: 0, action: "start" };
    expect((await fixture().api.PUT(request(body, { "x-user-id": "" }))).status).toBe(409);
    for (const [options, status] of [
      [{ id: null }, 401], [{ roles: [] }, 403], [{ roles: ["tutor"] }, 403],
      [{ roles: ["murid", "admin"] }, 403], [{ roles: ["murid"], legacyRole: "admin" }, 403],
    ] as const) {
      const { api, reads, writes } = fixture({ ...options, ...("roles" in options ? { roles: [...options.roles] } : {}) });
      expect((await api.GET(request())).status).toBe(status);
      expect((await api.PUT(request(body))).status).toBe(status);
      expect(reads).toHaveLength(0);
      expect(writes).toHaveLength(0);
    }
  });

  test("stores a validated tutor action using the server account identity", async () => {
    const { api, writes } = fixture({ roles: ["tutor"], legacyRole: "teacher" });
    const body = { role: "tutor", version: 1, generation: 1, action: "restart", courseId: "course-a" };
    const response = await api.PUT(request(body));
    expect(response.status).toBe(200);
    expect(writes).toEqual([["account-a", "tutor", body]]);
  });

  test("uses server-selected course context for first use and replay from shared settings", async () => {
    const student = fixture({ current: null, selectedCourse: "valid-course" });
    const start = { role: "student", version: 1, generation: 0, action: "start", courseId: "stale-course" };
    expect((await student.api.PUT(request(start))).status).toBe(200);
    expect(student.selections).toEqual([["account-a", "student", "stale-course"]]);
    expect(student.writes).toEqual([["account-a", "student", { ...start, courseId: "valid-course" }]]);

    const tutor = fixture({ roles: ["tutor"], selectedCourse: "assigned-course" });
    const restart = { role: "tutor", version: 1, generation: 1, action: "restart", courseId: null };
    expect((await tutor.api.PUT(request(restart))).status).toBe(200);
    expect(tutor.selections).toEqual([["account-a", "tutor", null]]);
    expect(tutor.writes).toEqual([["account-a", "tutor", { ...restart, courseId: "assigned-course" }]]);
  });

  test("resume and stale restart preserve the saved plan without course discovery", async () => {
    for (const action of ["start", "restart"] as const) {
      const { api, writes, selections } = fixture({ selectionFails: true });
      const response = await api.PUT(request({ role: "student", version: 1, generation: 0, action, courseId: "different-course" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ state: running });
      expect(selections).toHaveLength(0);
      expect(writes).toHaveLength(0);
    }
  });

  test("progress and exit do not recalculate course context", async () => {
    const { api, reads, writes, selections } = fixture({ selectionFails: true });
    for (const action of [{ action: "progress", stepIndex: 4 }, { action: "complete" }, { action: "skip" }]) {
      expect((await api.PUT(request({ role: "student", version: 1, generation: 1, ...action }))).status).toBe(200);
    }
    expect(writes).toHaveLength(3);
    expect(reads).toHaveLength(0);
    expect(selections).toHaveLength(0);
  });

  test("catalog failure does not silently persist a general tour", async () => {
    const { api, writes } = fixture({ current: null, selectionFails: true });
    const response = await api.PUT(request({ role: "student", version: 1, generation: 0, action: "start" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("credentials");
    expect(writes).toHaveLength(0);
  });

  test("dual-role accounts retain independent explicit roles on shared pages", async () => {
    const { api, reads, writes } = fixture({ roles: ["murid", "tutor"], legacyRole: "teacher" });
    expect((await api.GET(request(undefined, {}, "student"))).status).toBe(200);
    expect((await api.GET(request(undefined, {}, "tutor"))).status).toBe(200);
    expect(reads).toEqual([["account-a", "student"], ["account-a", "tutor"]]);
    expect((await api.PUT(request({ role: "student", version: 1, generation: 1, action: "progress", stepIndex: 4 }))).status).toBe(200);
    expect(writes[0]?.slice(0, 2)).toEqual(["account-a", "student"]);
    expect((await fixture({ roles: ["murid"] }).api.GET(request(undefined, {}, "tutor"))).status).toBe(403);
  });

  test("rejects unvalidated bodies before calling persistence and sanitizes failures", async () => {
    const { api, writes } = fixture();
    expect((await api.GET(request(undefined, {}, "admin"))).status).toBe(400);
    expect((await api.PUT(request({ role: "student", version: 1, generation: 0, action: "progress", stepIndex: 99 }))).status).toBe(400);
    expect((await api.PUT(request({}, { "Content-Type": "text/plain" }))).status).toBe(415);
    expect(writes).toHaveLength(0);
    const response = await fixture({ fail: true }).api.GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("credentials");
  });
});
