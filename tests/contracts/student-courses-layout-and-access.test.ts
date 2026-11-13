import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";

const source = (path: string) => readFileSync(path, "utf8");

describe("student courses layout, whatsapp contact, and material access contracts", () => {
  test("courses index uses consistent ApplicationPage and PageHeader with WhatsApp contact", () => {
    const coursesPage = source("app/(student)/courses/page.tsx");

    // Standard shell components
    expect(coursesPage).toContain("<StudentCourseCatalogView");
    const presentation = source("components/course/student-course-catalog-view.tsx");
    expect(presentation).toContain("ApplicationPage");
    expect(presentation).toContain("PageHeader");

    // Contact button uses WhatsApp, not /feedback
    expect(coursesPage).toContain("getWhatsAppAdminChatHref");
    expect(coursesPage).not.toContain("href=\"/feedback\"");
    expect(coursesPage).not.toContain("href='/feedback'");

    // Hubungi admin WhatsApp link check
    const waLink = getWhatsAppAdminChatHref();
    if (waLink !== null) {
      expect(waLink).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    } else {
      expect(waLink).toBeNull();
    }
  });

  test("student onboarding dashboard positions package section below free section and token form in sidebar", () => {
    const dashboard = source("components/dashboard/student-onboarding-view.tsx");

    const messages = JSON.parse(source("messages/id/student.json")).dashboard;
    expect(messages.hasClassToken).toBe("Sudah punya token kelas?");
    expect(messages.availableInFree).toBe("Yang tersedia di Free");
    expect(messages.semesterPlans).toBe("Paket belajar semester");

    // Token activation form in sidebar
    expect(dashboard).toContain('t("dashboard.hasClassToken")');
    expect(dashboard).toContain("<EnrollmentForm");

    // Semester plans section exists in main content
    expect(dashboard).toContain('t("dashboard.semesterPlans")');

    // Order: Free section appears before semester plans
    const freeIndex = dashboard.indexOf('t("dashboard.availableInFree")');
    const paketIndex = dashboard.indexOf('t("dashboard.semesterPlans")');
    expect(freeIndex).toBeGreaterThan(-1);
    expect(paketIndex).toBeGreaterThan(-1);
    expect(paketIndex).toBeGreaterThan(freeIndex);
  });

  test("course materials lock premium content while keeping free pdfs accessible", () => {
    const materialPage = source("app/(student)/courses/[id]/material/page.tsx");
    const materialDetail = source("app/(student)/courses/[id]/material/[materialId]/page.tsx");

    // Free PDF condition
    expect(materialPage).toContain('material.kind === "pdf" && material.docCategory !== "diktat"');
    expect(materialPage).toContain("locked = !hasFullContentAccess && !isFreeContent");

    // Token activation banner for unenrolled students
    expect(materialPage).toContain("!hasFullContentAccess");
    expect(materialPage).toContain("<EnrollmentForm");

    // Detail page checks
    expect(materialDetail).toContain("canAccessCourseContent(access.policy");
    expect(materialDetail).toContain("hasChapterScopeWithin(materialChapterIds, access.policy.scopedChapterIds)");
    expect(materialDetail).toContain("isFreePdf");
  });

  test("flashcards use the review capability and tryouts require full content access", () => {
    const flashcardPage = source("app/(student)/courses/[id]/flashcard/page.tsx");
    const tryoutDetail = source("app/(student)/courses/[id]/tryout/[tryoutId]/page.tsx");

    expect(flashcardPage).toContain("access?.policy.capabilities.canReviewFlashcard");
    expect(flashcardPage).toContain("<EnrollmentForm");
    expect(tryoutDetail).toContain("checkFullCourseContentAccess")
    expect(tryoutDetail).toContain("EnrollmentForm");
  });

  test("no em dashes or en dashes in student modified surfaces", () => {
    const files = [
      "app/(student)/courses/page.tsx",
      "app/(student)/courses/[id]/page.tsx",
      "app/(student)/courses/[id]/material/page.tsx",
      "app/(student)/courses/[id]/material/[materialId]/page.tsx",
      "app/(student)/courses/[id]/flashcard/page.tsx",
      "app/(student)/courses/[id]/tryout/[tryoutId]/page.tsx",
      "components/dashboard/student-onboarding-view.tsx",
    ];

    for (const file of files) {
      const content = source(file);
      expect(content).not.toMatch(/[\u2013\u2014]/);
    }
  });
});
