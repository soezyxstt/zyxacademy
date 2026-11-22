import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readText = (path: string) => readFileSync(path, "utf8");

describe("AdminSidebar hybrid grouping contract", () => {
  test("groups ALL_ADMIN_TABS by workflow domain without duplicate ids", () => {
    const sidebar = readText("components/admin-sidebar.tsx");
    const tabMatches = Array.from(
      sidebar.matchAll(/\{\s*id:\s*"([^"]+)"[^}]*group:\s*"([^"]+)"[^}]*\}/g),
    );

    const ids = tabMatches.map((m) => m[1]);
    expect(ids.length).toBe(30);
    expect(new Set(ids).size).toBe(ids.length);

    const byGroup = (group: string) =>
      tabMatches.filter((m) => m[2] === group).map((m) => m[1]);

    expect(byGroup("utama")).toEqual(["dashboard"]);
    expect(byGroup("akademik")).toEqual([
      "courses",
      "schedules",
      "meet",
      "bank-soal",
      "discussions",
    ]);
    expect(byGroup("pengguna")).toEqual([
      "users",
      "groups",
      "tokens",
      "pricing",
      "notifications",
    ]);
    expect(byGroup("publikasi")).toEqual([
      "blog",
      "forms",
      "media",
      "tautan",
      "short-links",
    ]);
    expect(byGroup("analitik")).toEqual([
      "ops-monitor",
      "tutor-activity",
      "ai-analytics",
      "feature-usage",
      "web-analytics",
    ]);
    expect(byGroup("sistem")).toEqual([
      "ai-models",
      "feature-flags",
      "api-keys",
    ]);
    expect(byGroup("utilitas")).toEqual(["docs"]);
    expect(byGroup("tutorial-pka")).toEqual([
      "pka-registrations",
      "pka-announcements",
      "pka-schedules",
      "pka-quizzes",
      "pka-materials",
    ]);
  });

  test("renders primary sections flat and secondary sections collapsible with aligned i18n keys", () => {
    const sidebar = readText("components/admin-sidebar.tsx");
    expect(sidebar).toContain('<NavGroup label={t("academicContent")} collapsed={c} />');
    expect(sidebar).toContain('<NavGroup label={t("usersAccess")} collapsed={c} />');
    expect(sidebar).toContain('id="publikasi"');
    expect(sidebar).toContain('id="analitik"');
    expect(sidebar).toContain('id="sistem"');
    expect(sidebar).not.toContain('id="alat"');
    expect(sidebar).not.toContain('id="ops"');

    const idMessages = JSON.parse(readText("messages/id/admin.json")).navigation;
    const enMessages = JSON.parse(readText("messages/en/admin.json")).navigation;

    for (const key of ["academicContent", "usersAccess", "publishingContent", "analyticsMonitor", "system", "featureUsage"]) {
      expect(typeof idMessages[key]).toBe("string");
      expect(idMessages[key].length).toBeGreaterThan(0);
      expect(typeof enMessages[key]).toBe("string");
      expect(enMessages[key].length).toBeGreaterThan(0);
    }
  });
});
