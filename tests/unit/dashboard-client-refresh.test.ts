import { describe, expect, test } from "bun:test";
import { adminListRequestState, scheduleAdminListRequest } from "../../lib/admin/list-request";
import { selectSidebarCourses, type SidebarFallbackCourses } from "../../lib/student/sidebar-courses";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const nextTimer = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("admin list requests", () => {
  test("marks old rows stale during a new query and exposes errors only for the failed request", () => {
    const loaded = JSON.stringify([1, "", "all", 0]);
    const filtered = JSON.stringify([1, "Dina", "active", 0]);
    const retry = JSON.stringify([1, "Dina", "active", 1]);

    expect(adminListRequestState(loaded, loaded, null, false)).toEqual({ failed: false, stale: false, loading: false });
    expect(adminListRequestState(loaded, filtered, null, false)).toEqual({ failed: false, stale: true, loading: true });
    expect(adminListRequestState(loaded, filtered, filtered, false)).toEqual({ failed: true, stale: true, loading: false });
    expect(adminListRequestState(loaded, loaded, loaded, false)).toEqual({ failed: true, stale: false, loading: false });
    expect(adminListRequestState(loaded, retry, filtered, false)).toEqual({ failed: false, stale: true, loading: true });
    expect(adminListRequestState(retry, retry, null, false)).toEqual({ failed: false, stale: false, loading: false });
  });

  test("a cancelled older response cannot replace the new result, show an error, or settle its loading state", async () => {
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const events: string[] = [];
    const handlers = {
      onSuccess: (value: string) => events.push(value),
      onError: () => events.push("error"),
      onSettled: () => events.push("settled"),
    };
    const cancelOld = scheduleAdminListRequest(() => oldRequest.promise, handlers, 0);
    await nextTimer();
    cancelOld();
    scheduleAdminListRequest(() => newRequest.promise, handlers, 0);
    await nextTimer();

    oldRequest.reject(new Error("old request failed"));
    await Promise.resolve();
    expect(events).toEqual([]);
    newRequest.resolve("new result");
    await Promise.resolve();
    expect(events).toEqual(["new result", "settled"]);
  });

  test("ignores an older success that arrives after the newer query", async () => {
    const oldRequest = deferred<string>();
    const newRequest = deferred<string>();
    const events: string[] = [];
    const handlers = {
      onSuccess: (value: string) => events.push(value),
      onError: () => events.push("error"),
      onSettled: () => events.push("settled"),
    };
    const cancelOld = scheduleAdminListRequest(() => oldRequest.promise, handlers, 0);
    await nextTimer();
    cancelOld();
    scheduleAdminListRequest(() => newRequest.promise, handlers, 0);
    await nextTimer();
    newRequest.resolve("new result");
    await Promise.resolve();
    oldRequest.resolve("old result");
    await Promise.resolve();
    expect(events).toEqual(["new result", "settled"]);
  });

  test("cancels a request before its debounce expires", async () => {
    let called = false;
    const cancel = scheduleAdminListRequest(async () => { called = true; }, {
      onSuccess: () => {}, onError: () => {}, onSettled: () => {},
    }, 0);
    cancel();
    await nextTimer();
    expect(called).toBe(false);
  });
});

describe("sidebar enrollment fallback", () => {
  const scope = { userId: "student-a", pathname: "/courses/a", activeCourseId: "a", errorUpdateCount: 10 };
  const cached = [{ id: "old", title: "Old course" }];
  const fresh = [{ id: "new", title: "New course" }];
  const fallback: SidebarFallbackCourses = { ...scope, courses: fresh };

  test("prefers a fresh fallback to cached Today data after a failed refetch", () => {
    expect(selectSidebarCourses(scope, true, cached, fallback)).toEqual(fresh);
    expect(selectSidebarCourses(scope, true, cached, undefined)).toEqual([]);
    expect(selectSidebarCourses(scope, false, cached, fallback)).toEqual(cached);
    expect(selectSidebarCourses(scope, false, undefined, fallback)).toEqual(fresh);
  });

  test("does not reuse fallback data across accounts, routes, course contexts, or new failures", () => {
    expect(selectSidebarCourses({ ...scope, userId: "student-b" }, true, cached, fallback)).toEqual([]);
    expect(selectSidebarCourses({ ...scope, pathname: "/dashboard" }, true, cached, fallback)).toEqual([]);
    expect(selectSidebarCourses({ ...scope, activeCourseId: "b" }, true, cached, fallback)).toEqual([]);
    expect(selectSidebarCourses({ ...scope, errorUpdateCount: 11 }, true, cached, fallback)).toEqual([]);
    expect(selectSidebarCourses(undefined, true, cached, fallback)).toEqual([]);
    expect(selectSidebarCourses(undefined, false, cached, fallback)).toEqual([]);
  });
});
