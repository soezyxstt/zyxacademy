import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Gauge,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  Users,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileBottomNavItem,
} from "@/components/navigation/mobile-bottom-nav";
import {
  ADMIN_MORE_CATEGORIES,
  ADMIN_PINNED_STORAGE_KEY,
  ADMIN_SHORTCUT_BY_ID,
  buildAdminCourseSubTabs,
  buildAdminOpsSubTabs,
  buildAdminPeopleSubTabs,
  getActiveAdminBottomTab,
  getActiveAdminCourseContext,
  getAdminDetailTitleKey,
  getAdminMobileBackHref,
  getAdminPinnedStorageKey,
  getAdminSubTabContext,
  isAdminDeepDetailRoute,
  isAdminFocusEditorRoute,
  isAdminOpsHubRoute,
  isAdminPeopleHubRoute,
  isAdminRootHub,
  isAdminSubTabActive,
  parseAdminCourseSlugFromPathname,
  readAdminPinnedTabs,
  resolveAdminCourseSwitchHref,
  setActiveAdminCourseContext,
  subscribeActiveAdminCourseContext,
  writeAdminPinnedTabs,
  type AdminCourseSubTabLabels,
  type AdminOpsSubTabLabels,
  type AdminPeopleSubTabLabels,
} from "@/components/navigation/admin/admin-nav-model";

const COURSE_LABELS: AdminCourseSubTabLabels = {
  bab: "Chapters",
  documents: "Documents",
  videos: "Videos",
  quizzes: "Quizzes",
  tryouts: "Tryouts",
  questions: "Questions",
  flashcards: "Flashcards",
  results: "Results",
  leaderboard: "Rank",
  analytics: "Analytics",
  review: "Review",
  settings: "Settings",
};

const PEOPLE_LABELS: AdminPeopleSubTabLabels = {
  users: "Users",
  groups: "Groups",
  tokens: "Tokens",
  pricing: "Pricing",
  notifications: "Notif",
};

const OPS_LABELS: AdminOpsSubTabLabels = {
  monitor: "Monitor",
  tutor: "Tutor",
  zyra: "Zyra AI",
  usage: "Usage",
  web: "Web",
  models: "Models",
  keys: "Keys",
};

function buildBottomNavItems(pathname: string): MobileBottomNavItem[] {
  const activeTab = getActiveAdminBottomTab(pathname);
  return [
    {
      id: "home",
      label: "Home",
      icon: LayoutDashboard,
      href: "/admin",
      active: activeTab === "home",
    },
    {
      id: "courses",
      label: "Courses",
      icon: GraduationCap,
      href: "/admin/courses",
      active: activeTab === "courses",
    },
    {
      id: "people",
      label: "People",
      icon: Users,
      href: "/admin/users",
      active: activeTab === "people",
    },
    {
      id: "ops",
      label: "Ops",
      icon: Gauge,
      href: "/admin/ops",
      active: activeTab === "ops",
    },
    {
      id: "more",
      label: "More",
      icon: LayoutGrid,
      onClick: () => {},
      active: activeTab === "more",
    },
  ];
}

describe("Admin Mobile Bottom Nav (5 Hubs)", () => {
  test("renders 5 bottom nav items with More as a button trigger", () => {
    const html = renderToStaticMarkup(
      <MobileBottomNav
        ariaLabel="Admin navigation"
        items={buildBottomNavItems("/admin/users")}
      />
    );

    expect(html).toContain("grid-cols-5");
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/admin/courses"');
    expect(html).toContain('href="/admin/users"');
    expect(html).toContain('href="/admin/ops"');
    expect(html).toContain("<button");
    expect(html).toContain("More");
    expect(html).toContain('aria-current="page"');
  });

  test("unmounts bottom nav on focus-editor routes", () => {
    const pathname = "/admin/courses/calc-1/quizzes/new";
    const html = renderToStaticMarkup(
      <MobileBottomNav
        ariaLabel="Admin navigation"
        items={buildBottomNavItems(pathname)}
        hidden={isAdminFocusEditorRoute(pathname)}
      />
    );

    expect(html).toBe("");
  });

  test("matches active routes for all 5 admin hubs", () => {
    expect(getActiveAdminBottomTab("/admin")).toBe("home");
    expect(getActiveAdminBottomTab("/admin/")).toBe("home");

    expect(getActiveAdminBottomTab("/admin/courses")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/courses/calc-1/documents")).toBe(
      "courses"
    );
    expect(getActiveAdminBottomTab("/admin/questions")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/jobs")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/distractors")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/schedules")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/meet")).toBe("courses");
    expect(getActiveAdminBottomTab("/admin/discussions")).toBe("courses");

    expect(getActiveAdminBottomTab("/admin/users")).toBe("people");
    expect(getActiveAdminBottomTab("/admin/groups")).toBe("people");
    expect(getActiveAdminBottomTab("/admin/tokens")).toBe("people");
    expect(getActiveAdminBottomTab("/admin/pricing")).toBe("people");
    expect(getActiveAdminBottomTab("/admin/notifications")).toBe("people");

    expect(getActiveAdminBottomTab("/admin/ops")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/tutor-activity")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/analytics")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/feature-usage")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/web-analytics")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/models")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/flags")).toBe("ops");
    expect(getActiveAdminBottomTab("/admin/ops/keys")).toBe("ops");

    expect(getActiveAdminBottomTab("/admin/blog")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/blog/new")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/forms")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/forms/f-1")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/media")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/tautan")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/ops/short-links")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/docs")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/docs/getting-started")).toBe("more");
    expect(getActiveAdminBottomTab("/admin/tutorial-pka/registrations")).toBe(
      "more"
    );
    expect(getActiveAdminBottomTab("/admin/ast-inspector")).toBe("more");

    expect(getActiveAdminBottomTab("/dashboard")).toBeNull();
  });
});

describe("Admin More Hub Directory & Pinned Shortcuts", () => {
  test("defines 5 module categories including collapsible PKA archive", () => {
    expect(ADMIN_MORE_CATEGORIES).toHaveLength(5);
    expect(ADMIN_MORE_CATEGORIES.map((category) => category.id)).toEqual([
      "academic",
      "people",
      "publishing",
      "ops",
      "utilities",
    ]);

    const utilities = ADMIN_MORE_CATEGORIES[4];
    expect(utilities?.archivedItems).toHaveLength(5);
    expect(ADMIN_SHORTCUT_BY_ID["blog"]?.href).toBe("/admin/blog");
    expect(ADMIN_SHORTCUT_BY_ID["short-links"]?.href).toBe(
      "/admin/ops/short-links"
    );
    expect(ADMIN_SHORTCUT_BY_ID["dashboard"]?.href).toBe("/admin");
  });

  test("reads and writes pinned shortcuts using zyx_admin_sidebar_pinned_tabs with legacy fallback", () => {
    const store = new Map<string, string>();
    const storage: Pick<Storage, "getItem" | "setItem"> = {
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    };

    expect(getAdminPinnedStorageKey()).toBe(ADMIN_PINNED_STORAGE_KEY);
    expect(getAdminPinnedStorageKey("u1")).toBe(
      `${ADMIN_PINNED_STORAGE_KEY}_u1`
    );

    store.set(ADMIN_PINNED_STORAGE_KEY, JSON.stringify(["blog", "forms"]));
    expect(readAdminPinnedTabs(storage, "u1")).toEqual(["blog", "forms"]);

    writeAdminPinnedTabs(storage, "u1", ["media", "docs"]);
    expect(readAdminPinnedTabs(storage, "u1")).toEqual(["media", "docs"]);
    expect(store.get(`${ADMIN_PINNED_STORAGE_KEY}_u1`)).toBe(
      JSON.stringify(["media", "docs"])
    );
  });
});

describe("Admin Course, People, and Ops Sub-Tab Builders", () => {
  test("builds 12 Course sub-tabs in required order with exact/prefix matching", () => {
    const tabs = buildAdminCourseSubTabs({
      slug: "calc-1",
      labels: COURSE_LABELS,
    });

    expect(tabs).toHaveLength(12);
    expect(tabs.map((tab) => tab.id)).toEqual([
      "bab",
      "documents",
      "videos",
      "quizzes",
      "tryouts",
      "questions",
      "flashcards",
      "results",
      "leaderboard",
      "analytics",
      "review",
      "settings",
    ]);

    const babTab = tabs[0];
    const documentsTab = tabs[1];
    expect(isAdminSubTabActive(babTab, "/admin/courses/calc-1")).toBe(true);
    expect(isAdminSubTabActive(babTab, "/admin/courses/calc-1/documents")).toBe(
      false
    );
    expect(
      isAdminSubTabActive(documentsTab, "/admin/courses/calc-1/documents")
    ).toBe(true);
  });

  test("builds 5 People sub-tabs and detects People Hub routes", () => {
    const tabs = buildAdminPeopleSubTabs(PEOPLE_LABELS);
    expect(tabs).toHaveLength(5);
    expect(tabs.map((tab) => tab.label)).toEqual([
      "Users",
      "Groups",
      "Tokens",
      "Pricing",
      "Notif",
    ]);

    expect(isAdminPeopleHubRoute("/admin/users")).toBe(true);
    expect(isAdminPeopleHubRoute("/admin/groups")).toBe(true);
    expect(isAdminPeopleHubRoute("/admin/tokens")).toBe(true);
    expect(isAdminPeopleHubRoute("/admin/pricing")).toBe(true);
    expect(isAdminPeopleHubRoute("/admin/notifications")).toBe(true);
    expect(isAdminPeopleHubRoute("/admin/courses")).toBe(false);

    expect(isAdminSubTabActive(tabs[3], "/admin/pricing")).toBe(true);
  });

  test("prioritizes Web Analytics in the seven Ops sub-tabs and excludes short links", () => {
    const tabs = buildAdminOpsSubTabs(OPS_LABELS);
    expect(tabs).toHaveLength(7);
    expect(tabs.map((tab) => tab.label)).toEqual([
      "Web",
      "Monitor",
      "Zyra AI",
      "Usage",
      "Tutor",
      "Models",
      "Keys",
    ]);

    expect(isAdminOpsHubRoute("/admin/ops")).toBe(true);
    expect(isAdminOpsHubRoute("/admin/ops/models")).toBe(true);
    expect(isAdminOpsHubRoute("/admin/ops/short-links")).toBe(false);

    expect(isAdminSubTabActive(tabs[0], "/admin/ops/web-analytics")).toBe(true);
    expect(isAdminSubTabActive(tabs[1], "/admin/ops")).toBe(true);
    expect(isAdminSubTabActive(tabs[0], "/admin/ops/models")).toBe(false);
    expect(isAdminSubTabActive(tabs[5], "/admin/ops/models")).toBe(true);
  });

  test("resolves sub-tab context and hides on focus-editor and deep detail routes", () => {
    expect(getAdminSubTabContext("/admin/courses/calc-1")).toBe("course");
    expect(getAdminSubTabContext("/admin/courses/calc-1/quizzes")).toBe(
      "course"
    );
    expect(getAdminSubTabContext("/admin/users")).toBe("people");
    expect(getAdminSubTabContext("/admin/ops/flags")).toBe("ops");

    expect(getAdminSubTabContext("/admin")).toBeNull();
    expect(getAdminSubTabContext("/admin/courses")).toBeNull();
    expect(getAdminSubTabContext("/admin/ops/short-links")).toBeNull();
    expect(getAdminSubTabContext("/admin/courses/calc-1/quizzes/new")).toBeNull();
    expect(
      getAdminSubTabContext("/admin/courses/calc-1/documents/doc-1")
    ).toBeNull();
    expect(
      getAdminSubTabContext("/admin/courses/calc-1/analytics/quiz-1")
    ).toBeNull();
  });
});

describe("Admin Focus-Editor Hide Rules, Back Navigation, and Course Switching", () => {
  test("detects all focus-editor routes accurately", () => {
    expect(isAdminFocusEditorRoute("/admin/courses/calc-1/quizzes/new")).toBe(
      true
    );
    expect(
      isAdminFocusEditorRoute("/admin/courses/calc-1/quizzes/q-1/edit")
    ).toBe(true);
    expect(
      isAdminFocusEditorRoute("/admin/courses/calc-1/documents/mat-42")
    ).toBe(true);
    expect(
      isAdminFocusEditorRoute("/admin/courses/calc-1/review/idea/bundle-1")
    ).toBe(true);
    expect(
      isAdminFocusEditorRoute("/admin/courses/calc-1/review/product/bundle-2")
    ).toBe(true);
    expect(isAdminFocusEditorRoute("/admin/blog/new")).toBe(true);
    expect(isAdminFocusEditorRoute("/admin/blog/post-1/edit")).toBe(true);

    expect(isAdminFocusEditorRoute("/admin/courses/calc-1/quizzes")).toBe(
      false
    );
    expect(isAdminFocusEditorRoute("/admin/courses/calc-1/documents")).toBe(
      false
    );
    expect(isAdminFocusEditorRoute("/admin/courses/calc-1/review")).toBe(false);
    expect(isAdminFocusEditorRoute("/admin/blog")).toBe(false);
  });

  test("identifies root hubs, deep detail routes, back hrefs, and detail titles", () => {
    expect(isAdminRootHub("/admin")).toBe(true);
    expect(isAdminRootHub("/admin/courses")).toBe(true);
    expect(isAdminRootHub("/admin/users")).toBe(true);
    expect(isAdminRootHub("/admin/courses/calc-1")).toBe(false);
    expect(isAdminRootHub("/admin/forms/form-1")).toBe(false);

    expect(isAdminDeepDetailRoute("/admin/forms/form-1")).toBe(true);
    expect(isAdminDeepDetailRoute("/admin/meet/meet-1")).toBe(true);
    expect(isAdminDeepDetailRoute("/admin/docs/guide")).toBe(true);
    expect(
      isAdminDeepDetailRoute("/admin/courses/calc-1/analytics/quiz-1")
    ).toBe(true);
    expect(isAdminDeepDetailRoute("/admin/courses/calc-1/analytics")).toBe(
      false
    );

    expect(getAdminMobileBackHref("/admin/courses/calc-1")).toBe(
      "/admin/courses"
    );
    expect(getAdminMobileBackHref("/admin/courses/calc-1/quizzes/new")).toBe(
      "/admin/courses/calc-1/quizzes"
    );
    expect(
      getAdminMobileBackHref("/admin/courses/calc-1/documents/doc-1")
    ).toBe("/admin/courses/calc-1/documents");
    expect(
      getAdminMobileBackHref("/admin/courses/calc-1/review/idea/b1")
    ).toBe("/admin/courses/calc-1/review");
    expect(getAdminMobileBackHref("/admin/blog/new")).toBe("/admin/blog");
    expect(getAdminMobileBackHref("/admin/forms/f1")).toBe("/admin/forms");

    expect(getAdminDetailTitleKey("/admin/courses/calc-1/quizzes/new")).toBe(
      "newQuiz"
    );
    expect(
      getAdminDetailTitleKey("/admin/courses/calc-1/quizzes/q1/edit")
    ).toBe("editQuiz");
    expect(
      getAdminDetailTitleKey("/admin/courses/calc-1/documents/m1")
    ).toBe("editDocument");
    expect(
      getAdminDetailTitleKey("/admin/courses/calc-1/review/idea/b1")
    ).toBe("ideaReview");
    expect(
      getAdminDetailTitleKey("/admin/courses/calc-1/review/product/b1")
    ).toBe("productReview");
    expect(getAdminDetailTitleKey("/admin/blog/new")).toBe("newPost");
    expect(getAdminDetailTitleKey("/admin/blog/p1/edit")).toBe("editPost");
  });

  test("parses course slug, preserves subpage on switch, and updates course context store", () => {
    expect(parseAdminCourseSlugFromPathname("/admin/courses")).toBeNull();
    expect(parseAdminCourseSlugFromPathname("/admin/courses/calc-1")).toBe(
      "calc-1"
    );
    expect(
      parseAdminCourseSlugFromPathname("/admin/courses/calc%201/videos")
    ).toBe("calc 1");

    expect(
      resolveAdminCourseSwitchHref("/admin/courses/calc-1/videos", "phys-1")
    ).toBe("/admin/courses/phys-1/videos");
    expect(
      resolveAdminCourseSwitchHref("/admin/courses/calc-1/tryouts", "phys-1")
    ).toBe("/admin/courses/phys-1/tryouts");
    expect(
      resolveAdminCourseSwitchHref("/admin/courses/calc-1", "phys-1")
    ).toBe("/admin/courses/phys-1");

    let calls = 0;
    const unsubscribe = subscribeActiveAdminCourseContext(() => {
      calls += 1;
    });
    setActiveAdminCourseContext({
      id: "calc-1",
      slug: "calc-1",
      title: "Kalkulus I",
    });
    expect(getActiveAdminCourseContext()?.title).toBe("Kalkulus I");
    expect(calls).toBe(1);
    setActiveAdminCourseContext(null);
    expect(getActiveAdminCourseContext()).toBeNull();
    expect(calls).toBe(2);
    unsubscribe();
  });
});
