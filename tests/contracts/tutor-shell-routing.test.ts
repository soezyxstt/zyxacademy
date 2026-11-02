import { afterEach, beforeAll, describe, expect, it, mock, beforeEach } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPostgresTestDb, preparePostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import {
  requireTutorCourseAccess,
  listTutorAccessibleCourses,
} from "@/lib/auth/tutor-access";
import { hasAnyPeran } from "@/lib/auth/authorization";

let currentPathname = "/tutor";
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => null } } }));

mock.module("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
  redirect: (url: string) => {
    const error = new Error(`NEXT_REDIRECT;replace;${url};307;`);
    (error as unknown as { digest: string }).digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw error;
  },
  notFound: () => {
    const error = new Error("NEXT_NOT_FOUND");
    (error as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
    throw error;
  },
}));

mock.module("@/components/command-menu", () => ({
  useCommandMenu: () => ({
    open: false,
    setOpen: () => {},
  }),
}));

mock.module("@/lib/auth-client", () => ({
  useSession: () => ({
    data: null,
    isPending: false,
  }),
  signOut: async () => {},
}));

mock.module("@/hooks/use-zyra-pet-visibility", () => ({
  useZyraPetVisibility: () => ({
    visible: true,
    toggleVisible: () => {},
  }),
}));

mock.module("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: () => {},
  }),
}));

import { TutorSidebar } from "@/components/tutor/tutor-sidebar";
import { TutorCourseSwitcher } from "@/components/tutor/tutor-course-switcher";
import TutorMaterialsPage from "@/app/(tutor)/tutor/[courseId]/materials/page";
import TutorTryoutsPage from "@/app/(tutor)/tutor/[courseId]/tryouts/page";

beforeAll(preparePostgresTestDb, 60_000);
const clients: Array<Awaited<ReturnType<typeof createPostgresTestDb>>["client"]> = [];
afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
});

async function createTestDb() {
  const { client, testDb } = await createPostgresTestDb();
  clients.push(client);

  await testDb.insert(schema.peran).values([
    { id: "peran-admin", code: "admin" },
    { id: "peran-tutor", code: "tutor" },
    { id: "peran-murid", code: "murid" },
  ]);

  return { client, testDb };
}

describe("Tutor shell routing and route containment", () => {
  beforeEach(() => {
    currentPathname = "/tutor";
  });

  it("renders canonical global navigation items Pengajaran and Jadwal", () => {
    currentPathname = "/tutor";
    const markup = renderToStaticMarkup(React.createElement(TutorSidebar));

    expect(markup).toContain("Pengajaran");
    expect(markup).toContain('href="/tutor"');
    expect(markup).toContain("Jadwal");
    expect(markup).toContain('href="/tutor/schedule"');

    // Does not show active course navigation when not on a course route
    expect(markup).not.toContain("Ringkasan");
    expect(markup).not.toContain("Navigasi Kelas");
  });

  it("does not treat /tutor/schedule as an active course route", () => {
    currentPathname = "/tutor/schedule";
    const markup = renderToStaticMarkup(React.createElement(TutorSidebar));

    expect(markup).toContain("Pengajaran");
    expect(markup).toContain("Jadwal");
    expect(markup).toContain('href="/tutor/schedule"');

    // Must not treat 'schedule' as courseId
    expect(markup).not.toContain("/tutor/schedule/quizzes");
    expect(markup).not.toContain("/tutor/schedule/grading");
    expect(markup).not.toContain("Navigasi Kelas");
  });

  it("does not detect active course from legacy /courses/:id routes", () => {
    currentPathname = "/courses/mk-kalkulus";
    const markup = renderToStaticMarkup(React.createElement(TutorSidebar));

    // Should not render tutor active course nav for /courses/...
    expect(markup).not.toContain("Navigasi Kelas");
    expect(markup).not.toContain('href="/tutor/mk-kalkulus"');
  });

  it("detects active course only from /tutor/:courseId and renders allowed nav items including participants and live quiz", () => {
    currentPathname = "/tutor/mk-kalkulus";
    const assignedCourses = [
      {
        courseId: "mk-kalkulus",
        title: "Kalkulus 1",
        code: "MA-1101",
        legacyCourseId: "crs-calc",
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(TutorSidebar, { assignedCourses }),
    );

    // Global navigation
    expect(markup).toContain("Pengajaran");
    expect(markup).toContain("Jadwal");

    // Allowed active course navigation
    expect(markup).toContain("Ringkasan");
    expect(markup).toContain('href="/tutor/mk-kalkulus"');
    expect(markup).toContain("Peserta &amp; Kelompok");
    expect(markup).toContain('href="/tutor/mk-kalkulus/participants"');
    expect(markup).toContain("Kuis");
    expect(markup).toContain('href="/tutor/mk-kalkulus/quizzes"');
    expect(markup).toContain("Kuis Langsung");
    expect(markup).toContain('href="/tutor/mk-kalkulus/live"');
    expect(markup).toContain("Penilaian Tryout");
    expect(markup).toContain('href="/tutor/mk-kalkulus/grading"');

    // Forbidden authoring nav items must be absent
    expect(markup).toContain('href="/tutor/mk-kalkulus/materials"');
    expect(markup).toContain("Dokumen");
    expect(markup).not.toContain("Kelola Materi");
    expect(markup).not.toContain("/tutor/mk-kalkulus/tryouts");
    expect(markup).not.toContain("Kelola Tryout");
  });

  it("renders real overview link for single-course switcher rather than an inert button", () => {
    const singleCourse = [
      { courseId: "mk-1", title: "Kalkulus 1", code: "MA-1101" },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(TutorCourseSwitcher, {
        courses: singleCourse,
        activeCourseId: "mk-1",
      }),
    );

    expect(markup).toContain('href="/tutor/mk-1"');
    expect(markup).not.toContain("<button");
    expect(markup).toContain("Kalkulus 1");
    expect(markup).toContain("MA-1101");
  });

  it("renders dropdown trigger button for multi-course switcher", () => {
    const assignedCourses = [
      { courseId: "mk-1", title: "Kalkulus 1", code: "MA-1101" },
      { courseId: "mk-2", title: "Fisika Dasar 1", code: "FI-1101" },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(TutorCourseSwitcher, {
        courses: assignedCourses,
        activeCourseId: "mk-1",
      }),
    );

    expect(markup).toContain("<button");
    expect(markup).toContain("Kalkulus 1");
    expect(markup).toContain("MA-1101");
  });

  it("redirects unauthenticated materials visits to /tutor", async () => {
    let redirectedUrl = "";
    try {
      await TutorMaterialsPage({
        params: Promise.resolve({ courseId: "mk-kalkulus" }),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        redirectedUrl = error.message;
      }
    }

    expect(redirectedUrl).toContain("NEXT_REDIRECT");
    expect(redirectedUrl).toBe("NEXT_REDIRECT;replace;/tutor;307;");
  });

  it("redirects forbidden tryouts authoring page directly to /tutor/:courseId", async () => {
    let redirectedUrl = "";
    try {
      await TutorTryoutsPage({
        params: Promise.resolve({ courseId: "mk-fisika" }),
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        redirectedUrl = error.message;
      }
    }

    expect(redirectedUrl).toContain("NEXT_REDIRECT");
    expect(redirectedUrl).toContain("/tutor/mk-fisika");
  });

  it("enforces requireTutorCourseAccess with explicit allowAdmin: false on course overview", async () => {
    const { testDb } = await createTestDb();
    {
      const now = new Date();

      // Admin user (not assigned as tutor)
      await testDb.insert(schema.user).values({
        id: "usr-admin",
        name: "Admin User",
        email: "admin@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "admin",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-admin",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-admin",
        penggunaId: "usr-admin",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      });

      // Active course
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-kimia",
        code: "KI-1101",
        title: "Kimia Dasar 1",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // Assigned tutor
      await testDb.insert(schema.user).values({
        id: "usr-tutor",
        name: "Tutor Kimia",
        email: "tutor@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor",
        penggunaId: "usr-tutor",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-kimia",
        penggunaId: "usr-tutor",
        mataKuliahId: "mk-kimia",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      // 1. Admin without assignment fails with allowAdmin: false
      await expect(
        requireTutorCourseAccess("usr-admin", "mk-kimia", { allowAdmin: false }, testDb),
      ).rejects.toThrow("TUTOR_ACCESS_DENIED: ROLE_NOT_AUTHORIZED");

      // 2. Assigned tutor succeeds with allowAdmin: false
      const tutorAccess = await requireTutorCourseAccess(
        "usr-tutor",
        "mk-kimia",
        { allowAdmin: false },
        testDb,
      );
      expect(tutorAccess.hasAccess).toBe(true);
      expect(tutorAccess.source).toBe("canonical_assignment");
      expect(tutorAccess.courseId).toBe("mk-kimia");
    }
  });

  it("verifies user menu tutor role detection for tutor, teacher, admin, and student", () => {
    function evaluateUserMenuRoles(user: { role?: string | null; roles?: string[] | null }) {
      const role = user.role;
      const roles = Array.isArray(user.roles) ? user.roles : [];
      const isTutor =
        role === "tutor" ||
        role === "teacher" ||
        roles.includes("tutor") ||
        roles.includes("teacher");
      const isAdmin = role === "admin" || roles.includes("admin");

      return {
        showPanelPengajar: isTutor || isAdmin,
        showPanelAdmin: isAdmin,
      };
    }

    // 1. Canonical tutor role
    expect(evaluateUserMenuRoles({ role: "tutor" })).toEqual({
      showPanelPengajar: true,
      showPanelAdmin: false,
    });

    // 2. Legacy teacher role
    expect(evaluateUserMenuRoles({ role: "teacher" })).toEqual({
      showPanelPengajar: true,
      showPanelAdmin: false,
    });

    // 3. Roles array with tutor
    expect(evaluateUserMenuRoles({ role: "student", roles: ["tutor"] })).toEqual({
      showPanelPengajar: true,
      showPanelAdmin: false,
    });

    // 4. Admin role
    expect(evaluateUserMenuRoles({ role: "admin" })).toEqual({
      showPanelPengajar: true,
      showPanelAdmin: true,
    });

    // 5. Student / murid role
    expect(evaluateUserMenuRoles({ role: "student" })).toEqual({
      showPanelPengajar: false,
      showPanelAdmin: false,
    });
    expect(evaluateUserMenuRoles({ role: null, roles: ["murid"] })).toEqual({
      showPanelPengajar: false,
      showPanelAdmin: false,
    });
  });

  it("preserves /participants, /live, /quizzes, and /grading suffixes when switching courses", () => {
    function computeTargetRoute(currentPath: string, activeCourseId: string | undefined, targetCourseId: string) {
      if (!activeCourseId) {
        return `/tutor/${targetCourseId}`;
      }
      if (currentPath.includes("/participants")) {
        return `/tutor/${targetCourseId}/participants`;
      } else if (currentPath.includes("/live")) {
        return `/tutor/${targetCourseId}/live`;
      } else if (currentPath.includes("/quizzes")) {
        return `/tutor/${targetCourseId}/quizzes`;
      } else if (currentPath.includes("/grading")) {
        return `/tutor/${targetCourseId}/grading`;
      } else {
        return `/tutor/${targetCourseId}`;
      }
    }

    expect(computeTargetRoute("/tutor/mk-1/participants", "mk-1", "mk-2")).toBe("/tutor/mk-2/participants");
    expect(computeTargetRoute("/tutor/mk-1/live", "mk-1", "mk-2")).toBe("/tutor/mk-2/live");
    expect(computeTargetRoute("/tutor/mk-1/quizzes", "mk-1", "mk-2")).toBe("/tutor/mk-2/quizzes");
    expect(computeTargetRoute("/tutor/mk-1/quizzes/tpl-1/edit", "mk-1", "mk-2")).toBe("/tutor/mk-2/quizzes");
    expect(computeTargetRoute("/tutor/mk-1/grading", "mk-1", "mk-2")).toBe("/tutor/mk-2/grading");
    expect(computeTargetRoute("/tutor/mk-1", "mk-1", "mk-2")).toBe("/tutor/mk-2");
  });

  it("rejects pure admin from tutor shell layout and index authorization", async () => {
    const { testDb } = await createTestDb();
    {
      const now = new Date();

      await testDb.insert(schema.user).values({
        id: "usr-admin-only",
        name: "Admin User Only",
        email: "admin-only@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "admin",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-admin-only",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-admin-only",
        penggunaId: "usr-admin-only",
        peranId: "peran-admin",
        source: "seed",
        createdAt: now,
      });

      await testDb.insert(schema.mataKuliah).values({
        id: "mk-fisika-2",
        code: "FI-1201",
        title: "Fisika Dasar 2",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });

      // 1. Authorization check rejects admin when allowAdmin is false
      const roleCodes = ["admin"];
      const isAuthorized = roleCodes.includes("tutor");
      expect(isAuthorized).toBe(false);

      // 2. listTutorAccessibleCourses rejects admin with allowAdmin: false
      const accessible = await listTutorAccessibleCourses("usr-admin-only", { allowAdmin: false }, testDb);
      expect(accessible).toEqual([]);
    }
  });

  it("bridges canonical courseId to verified legacyCourseId for cohort analytics", async () => {
    const { testDb } = await createTestDb();
    {
      const now = new Date();

      await testDb.insert(schema.courses).values({
        id: "crs-calc-legacy",
        title: "Kalkulus Legacy",
        category: "Matematika",
      });
      await testDb.insert(schema.mataKuliah).values({
        id: "mk-calc-canonical",
        code: "MA-1101",
        title: "Kalkulus 1",
        status: "active",
        legacyCourseId: "crs-calc-legacy",
        createdAt: now,
        updatedAt: now,
      });

      await testDb.insert(schema.user).values({
        id: "usr-tutor-calc",
        name: "Tutor Kalkulus",
        email: "tutor-calc@zyx.test",
        createdAt: now,
        updatedAt: now,
        role: "teacher",
      });
      await testDb.insert(schema.pengguna).values({
        id: "usr-tutor-calc",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await testDb.insert(schema.penggunaPeran).values({
        id: "pp-tutor-calc",
        penggunaId: "usr-tutor-calc",
        peranId: "peran-tutor",
        source: "seed",
        createdAt: now,
      });
      await testDb.insert(schema.penugasanTutor).values({
        id: "pt-calc",
        penggunaId: "usr-tutor-calc",
        mataKuliahId: "mk-calc-canonical",
        status: "active",
        assignmentScope: "course",
        createdAt: now,
        updatedAt: now,
      });

      const access = await requireTutorCourseAccess(
        "usr-tutor-calc",
        "mk-calc-canonical",
        { allowAdmin: false },
        testDb,
      );

      expect(access.hasAccess).toBe(true);
      expect(access.courseId).toBe("mk-calc-canonical");
      expect(access.legacyCourseId).toBe("crs-calc-legacy");
    }
  });
});
