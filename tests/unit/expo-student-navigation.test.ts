import { expect, test } from "bun:test";
import { studentNavigation } from "../../apps/mobile-native/routing/student-navigation";

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
