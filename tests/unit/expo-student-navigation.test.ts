import { expect, test } from "bun:test";
import { matchStudentRoute } from "../../apps/mobile-native/features/student/routes";
import { readStudentCourseChoices, readStudentCourseTitle } from "../../apps/mobile-native/routing/student-course-navigation-data";
import { studentCourseChoices, studentCourseId, studentCourseSwitchTarget, studentCourseTabs, studentNavigation } from "../../apps/mobile-native/routing/student-navigation";
import { operationsCatalog } from "../../lib/admin-mcp/operations-catalog";
import { createCourseFixtureRequest } from "../../packages/native-parity/student/courses/fixtures";

test("canonical Student destinations keep the web's labels, selection, and fallback Back routes", () => {
  const catalog = studentNavigation("/courses?q=forces", "/courses", "id");
  expect(catalog.active).toBe("courses");
  expect(catalog.backTo).toBeNull();
  expect(catalog.title).toBe("Kelas");
  expect(catalog.targets).toEqual({
    home: "/dashboard", courses: "/courses", schedule: "/dashboard/schedule",
    discuss: "/dashboard/discussions", me: "/profile",
  });
  const schedule = studentNavigation("/calendar", "/calendar", "en");
  expect(schedule.active).toBe("schedule");
  expect(schedule.backTo).toBe("/dashboard/schedule");
  expect(schedule.labels.bottomNavLabel).toBe("Student navigation");
  expect(studentNavigation("/courses/physics/video", "/courses/[id]/video", "en").title).toBe("Videos");
  expect(studentNavigation("/settings/notifications", "/settings/notifications", "id").backTo).toBe("/profile");
});

test("focus-intensive Student readers and a selected discussion thread hide the role bar", () => {
  expect(studentNavigation("/dashboard/discussions", "/dashboard/discussions", "en").hideBottom).toBe(false);
  const thread = studentNavigation("/courses/physics/discussions?thread=example", "/courses/[id]/discussions", "en");
  expect(thread.active).toBe("discuss");
  expect(thread.title).toBe("Discussion");
  expect(thread.hideBottom).toBe(true);
  expect(studentNavigation("/courses/physics/material", "/courses/[id]/material", "en").hideBottom).toBe(false);
  expect(studentNavigation("/courses/physics/material/mechanics", "/courses/[id]/material/[materialId]", "en").hideBottom).toBe(true);
  expect(studentNavigation("/courses/physics/solutions/set-1", "/courses/[id]/solutions/[collectionId]", "en").hideBottom).toBe(true);
});

test("ordinary course navigation shares localized routes, selection and the server Live gate", () => {
  const path = "/courses/matematika-1/material/turunan?section=latihan";
  const id = studentCourseId(path)!;
  expect(id).toBe("matematika-1");
  expect(studentCourseId("/courses")).toBeUndefined();
  expect(studentCourseId("/courses/tutorial-pka")).toBeUndefined();
  const localized = studentCourseTabs(path, id, "id", false);
  expect(localized.activeId).toBe("documents");
  expect(localized.tabs.slice(0, 3).map(tab => tab.label)).toEqual(["Ringkasan", "Dokumen", "Video"]);
  expect(localized.tabs.some(tab => tab.id === "live")).toBe(false);
  const english = studentCourseTabs(path, id, "en", true);
  expect(english.tabs.slice(0, 3).map(tab => tab.label)).toEqual(["Overview", "Documents", "Videos"]);
  expect(english.tabs.at(-1)).toMatchObject({ id: "live", href: "/courses/matematika-1/live" });
  expect(english.tabs.every(tab => matchStudentRoute(tab.href))).toBe(true);
  expect(studentCourseSwitchTarget(path, id, "fisika-1")).toBe("/courses/fisika-1/material");
  expect(studentCourseSwitchTarget(path, id, id)).toBeNull();
  expect(studentCourseSwitchTarget("/courses/kalkulus%20dasar/video", "kalkulus dasar", "mekanika dasar"))
    .toBe("/courses/mekanika%20dasar/video");
});

test("the course picker uses enrollment metadata and retains an unenrolled current preview", async () => {
  const { signal } = new AbortController();
  const enrolled = createCourseFixtureRequest("course-navigation");
  const current = await readStudentCourseTitle(enrolled, "matematika-1", signal);
  expect(current).toEqual({ course: { id: "matematika-1", title: "Matematika I" }, showLive: false });
  const choices = await readStudentCourseChoices(enrolled, signal);
  expect(studentCourseChoices(current.course!, choices).map(course => course.id)).toEqual(["fisika-1", "matematika-1"]);
  const preview = createCourseFixtureRequest("course-material-revoked");
  const previewCourse = (await readStudentCourseTitle(preview, "matematika-1", signal)).course!;
  expect(await readStudentCourseChoices(preview, signal)).toEqual([]);
  expect(studentCourseChoices(previewCourse, [])).toEqual([{ id: "matematika-1", title: "Matematika I" }]);
});

test("the switcher rejects malformed enrollment targets and disposes metadata replies", async () => {
  const { signal } = new AbortController();
  let disposed = false;
  await expect(readStudentCourseChoices(async (path, init) => {
    expect(path).toBe("/api/student/navigation");
    expect(init?.signal).toBe(signal);
    return Object.assign(Response.json([{ id: "a/b", title: "Invalid target" }]), { dispose: () => { disposed = true; } });
  }, signal)).rejects.toThrow("Invalid enrollment metadata");
  expect(disposed).toBe(true);
  expect(operationsCatalog.find(entry => entry.source === "app/api/student/navigation/route.ts"))
    .toMatchObject({ status: "excluded", tools: [] });
});
