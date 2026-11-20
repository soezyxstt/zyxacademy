import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { getLayoutGroup } from "@/app/template";
import { getTransitionConfig } from "@/components/ui/page-transition";

test("every student route retains the student layout and transition classification", () => {
 const routes = readdirSync("app/(student)", { withFileTypes: true }).filter(entry => entry.isDirectory());
 expect(routes.length).toBeGreaterThan(0);
 for (const route of routes) {
  for (const path of [`/${route.name}`, `/${route.name}/detail`]) {
   expect(getLayoutGroup(path)).toBe("student");
   expect(getTransitionConfig(path, false)).toEqual({ duration: 0.2, initialY: 6, isStudent: true });
   expect(getTransitionConfig(path, true)).toEqual({ duration: 0, initialY: 0, isStudent: true });
  }
 }
 expect(getLayoutGroup("/admin")).toBe("admin");
 expect(getLayoutGroup("/tutor")).toBe("tutor");
 expect(getLayoutGroup("/blog")).toBe("marketing");
});
