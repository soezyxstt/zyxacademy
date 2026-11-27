import { expect, type Page } from "@playwright/test";
import adminAcademic from "@/messages/id/adminAcademic.json";
import adminOps from "@/messages/id/adminOps.json";
import tutor from "@/messages/id/tutor.json";

interface ReferenceItem {
  component: string;
  source: string;
  route: string;
  cases: Array<{
    name: string;
    theme: "light" | "dark";
    ready: string;
    path?: string;
    prepare?: (page: Page) => Promise<void>;
  }>;
}

const biology = "/tutor/academic-course-1";
const physics = "/tutor/academic-course-2";
const adminBiology = "/admin/courses/academic-course-1";
const participants = tutor.participants;
const grading = tutor.grading;
const schedule = tutor.schedule;
const tryouts = tutor.tryouts;
const admin = adminAcademic.courses;

export const referenceItems: Record<string, ReferenceItem> = {
  "tutor-dashboard": {
    component: "TutorDashboardContent",
    source: "features/tutor-dashboard/ui/tutor-dashboard-content.tsx",
    route: "/tutor",
    cases: [
      { name: "assigned", theme: "light", ready: "Biologi Dasar" },
      { name: "empty", theme: "dark", path: "/tutor?state=empty", ready: tutor.dashboard.noCourses },
      { name: "assigned", theme: "dark", ready: "Kelompok Sel · Daring" },
    ],
  },
  "tutor-course": {
    component: "AnalyticsClient",
    source: "components/tutor/analytics-client.tsx",
    route: biology,
    cases: [
      { name: "priorities", theme: "light", ready: "Perpindahan zat melalui membran sel" },
      { name: "not-calculated", theme: "dark", path: `${physics}?state=empty`, ready: tutor.analytics.insufficientConceptData },
      {
        name: "drilldown", theme: "dark", ready: tutor.analytics.masteryDistribution,
        prepare: async (page) => {
          await page.getByRole("button", { name: /Lihat konsep/ }).first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
        },
      },
    ],
  },
  "tutor-participants": {
    component: "ParticipantsClient",
    source: "app/(tutor)/tutor/[courseId]/participants/participants-client.tsx",
    route: `${biology}/participants`,
    cases: [
      { name: "enrolled", theme: "light", ready: "Nadia Lestari" },
      { name: "empty", theme: "dark", path: `${physics}/participants`, ready: participants.noParticipantsFound },
      {
        name: "no-search-match", theme: "dark", ready: participants.changeFilters,
        prepare: async (page) => {
          const searchButton = page.getByRole("button", { name: /^(Cari|Cari nama, email, atau kelompok\.\.\.)$/ });
          await searchButton.click();
          const search = page.getByRole("searchbox", { name: participants.search, exact: true }).or(page.getByRole("textbox", { name: participants.search, exact: true }));
          await expect(search).toBeFocused();
          await search.fill("pencarian tanpa hasil");
          await expect(page.getByText("Nadia Lestari", { exact: true })).toHaveCount(0);
          await search.press("Escape");
          await expect(searchButton).toBeFocused();
          await searchButton.click();
          await search.fill("pencarian tanpa hasil");
        },
      },
    ],
  },
  "tutor-schedule": {
    component: "TutorScheduleView",
    source: "components/tutor/tutor-schedule-view.tsx",
    route: "/tutor/schedule",
    cases: [
      { name: "calendar", theme: "light", ready: schedule.open },
      { name: "no-slots", theme: "dark", path: "/tutor/schedule?state=empty", ready: schedule.noSlots },
      {
        name: "add-slot", theme: "dark", ready: schedule.addSlotTitle,
        prepare: async (page) => {
          await page.getByRole("button", { name: schedule.addSlot, exact: true }).first().click();
          await expect(page.getByRole("dialog")).toBeVisible();
        },
      },
    ],
  },
  "tutor-tryout-grading": {
    component: "GradingClient",
    source: "app/(tutor)/tutor/[courseId]/grading/grading-client.tsx",
    route: `${biology}/grading`,
    cases: [
      { name: "pending", theme: "light", ready: "Nadia Lestari" },
      { name: "empty", theme: "dark", path: `${physics}/grading`, ready: grading.allGraded },
      {
        name: "review", theme: "dark", ready: "Jelaskan bagaimana struktur membran sel mendukung perpindahan zat.",
        prepare: async (page) => {
          await page.getByRole("button", { name: /Nadia Lestari|Nilai jawaban/ }).first().click();
          await expect(page.getByRole("region", { name: grading.gradingPanel })).toBeVisible();
        },
      },
    ],
  },
  "tutor-quizzes": {
    component: "QuizzesClient",
    source: "app/(tutor)/tutor/[courseId]/quizzes/quizzes-client.tsx",
    route: `${biology}/quizzes`,
    cases: [
      { name: "list", theme: "light", ready: "Kuis struktur sel" },
      {
        name: "question-bank", theme: "dark", ready: "Organel apa yang menghasilkan sebagian besar ATP pada sel eukariotik?",
        prepare: async (page) => {
          await page.getByRole("tab", { name: /bank soal/i }).click();
          await expect(page.getByRole("tab", { name: /bank soal/i })).toHaveAttribute("aria-selected", "true");
        },
      },
      {
        name: "question-editor", theme: "light", ready: "Tipe Soal",
        prepare: async (page) => {
          await page.getByRole("tab", { name: /bank soal/i }).click();
          await page.getByRole("button", { name: "Tambah Soal Baru", exact: true }).click();
          const editor = page.getByRole("dialog");
          await expect(editor).toBeVisible();
          await editor.getByRole("button", { name: "Tandai opsi B sebagai jawaban benar" }).click();
          await expect(editor.getByRole("button", { name: "Tandai opsi B sebagai jawaban benar" })).toHaveAttribute("aria-pressed", "true");
        },
      },
    ],
  },
  "tutor-quiz-grading": {
    component: "TutorQuizGradingClient",
    source: "app/(tutor)/tutor/[courseId]/quizzes/grading/grading-client.tsx",
    route: `${biology}/quizzes/grading`,
    cases: [
      { name: "pending", theme: "light", ready: "Maya Putri" },
      { name: "empty", theme: "dark", path: `${biology}/quizzes/grading?state=empty`, ready: grading.noPendingQuiz },
      {
        name: "review", theme: "dark", ready: "Jelaskan hubungan struktur membran sel dengan fungsinya.",
        prepare: async (page) => {
          await page.getByRole("button", { name: /Maya Putri|Koreksi/ }).first().click();
          await expect(page.getByRole("button", { name: grading.finishGrading })).toBeVisible();
        },
      },
    ],
  },
  "tutor-tryouts": {
    component: "TryoutsClient",
    source: "app/(tutor)/tutor/[courseId]/tryouts/tryouts-client.tsx",
    route: `${biology}/tryouts`,
    cases: [
      { name: "list", theme: "light", ready: "Tryout biologi dasar" },
      { name: "empty", theme: "dark", path: `${biology}/tryouts?state=empty`, ready: tryouts.noTryouts },
      {
        name: "questions", theme: "dark", ready: "Organel apa yang menghasilkan sebagian besar ATP pada sel eukariotik?",
        prepare: async (page) => {
          await page.getByRole("button", { name: tryouts.manageQuestionButton, exact: true }).click();
          await expect(page.getByRole("button", { name: tryouts.addQuestion, exact: true })).toBeVisible();
        },
      },
    ],
  },
  "admin-courses": {
    component: "CoursesDashboard",
    source: "components/admin/courses-dashboard.tsx",
    route: "/admin/courses",
    cases: [
      { name: "list", theme: "light", ready: "Biologi Dasar" },
      {
        name: "filtered", theme: "dark", ready: "Fisika Dasar",
        prepare: async (page) => {
          await page.getByRole("combobox", { name: admin.category, exact: true }).click();
          await page.getByRole("option", { name: "Fisika", exact: true }).click();
          await expect(page.getByRole("link", { name: "Biologi Dasar", exact: true })).toHaveCount(0);
        },
      },
      { name: "empty", theme: "dark", path: "/admin/courses?state=empty", ready: admin.empty.title },
    ],
  },
  "admin-course": {
    component: "CourseDetailHeader + ChaptersTab",
    source: "components/admin/course-detail/course-detail-header.tsx and components/admin/course-detail/chapters-tab.tsx",
    route: adminBiology,
    cases: [
      { name: "chapters", theme: "light", ready: "Struktur sel" },
      { name: "empty", theme: "dark", path: "/admin/courses/fisika-dasar", ready: adminAcademic.courseDetail.chapters.empty.title },
      {
        name: "edit-chapter", theme: "dark", ready: adminAcademic.courseDetail.chapters.edit,
        prepare: async (page) => {
          const opener = page.getByRole("button", { name: adminAcademic.courseDetail.chapters.edit, exact: true }).first();
          await opener.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          const title = dialog.locator("input").first();
          await expect(title).toHaveValue("Struktur sel");
          await title.fill("");
          await expect(dialog.getByRole("button", { name: adminAcademic.common.save, exact: true })).toBeDisabled();
          await dialog.getByRole("button", { name: adminAcademic.common.cancel, exact: true }).click();
          await expect(dialog).toHaveCount(0);
          await opener.click();
          await expect(title).toHaveValue("Struktur sel");
        },
      },
    ],
  },
  "admin-groups": {
    component: "GroupsDashboard",
    source: "components/admin/groups-dashboard.tsx",
    route: "/admin/groups",
    cases: [
      { name: "list", theme: "light", ready: "Kelompok Biologi A" },
      { name: "empty", theme: "dark", path: "/admin/groups?state=empty", ready: adminOps.groupsUI.noGroups },
      {
        name: "create", theme: "dark", ready: adminOps.groupsUI.newGroup,
        prepare: async (page) => {
          await page.getByRole("button", { name: adminOps.groupsUI.createGroup, exact: true }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
        },
      },
    ],
  },
  "admin-tokens": {
    component: "TokensDashboard",
    source: "components/admin/tokens-dashboard.tsx",
    route: "/admin/tokens",
    cases: [
      { name: "list", theme: "light", ready: "Zyx-A19F01CD-20-1" },
      { name: "empty", theme: "dark", path: "/admin/tokens?state=empty", ready: adminOps.tokensUI.empty },
      {
        name: "create", theme: "dark", ready: adminOps.tokensUI.create,
        prepare: async (page) => {
          await page.getByRole("button", { name: adminOps.tokensUI.create, exact: true }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
        },
      },
    ],
  },
  "admin-users": {
    component: "UsersDashboard",
    source: "components/admin/users-dashboard.tsx",
    route: "/admin/users",
    cases: [
      { name: "list", theme: "light", ready: "Nadia Putri" },
      {
        name: "suspended-filter", theme: "dark", ready: "Bagas Riyadi",
        prepare: async (page) => {
          await page.getByRole("combobox", { name: adminOps.usersUI.status, exact: true }).click();
          await page.getByRole("option", { name: adminOps.usersUI.suspended, exact: true }).click();
          await expect(page.getByText("Nadia Putri", { exact: true })).toHaveCount(0);
        },
      },
      {
        name: "roles", theme: "dark", ready: adminOps.usersUI.manageRoles,
        prepare: async (page) => {
          await page.getByRole("button", { name: /Aksi pengguna untuk Rara Wibowo/ }).click();
          await page.getByRole("menuitem", { name: adminOps.usersUI.setRoles }).click();
          await expect(page.getByRole("dialog")).toBeVisible();
        },
      },
    ],
  },
};
