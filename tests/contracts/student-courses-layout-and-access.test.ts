import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { getWhatsAppAdminChatHref } from "@/lib/whatsapp-admin";

const source = (path: string) => readFileSync(path, "utf8");

describe("student courses layout, whatsapp contact, and material access contracts", () => {
  test("courses index uses consistent ApplicationPage and PageHeader with WhatsApp contact", () => {
    const coursesPage = source("app/(student)/courses/page.tsx");

    // Standard shell components
    expect(coursesPage).toContain("ApplicationPage");
    expect(coursesPage).toContain("PageHeader");

    // Contact button uses WhatsApp, not /feedback
    expect(coursesPage).toContain("getWhatsAppAdminChatHref");
    expect(coursesPage).not.toContain("href=\"/feedback\"");
    expect(coursesPage).not.toContain("href='/feedback'");

    // Hubungi admin WhatsApp link check
    const waLink = getWhatsAppAdminChatHref();
    expect(waLink).toMatch(/^https:\/\/wa\.me\/62\d+/);
  });

  test("student onboarding dashboard positions package section below free section and token form in sidebar", () => {
    const dashboard = source("components/dashboard/student-onboarding-view.tsx");

    // Token activation form in sidebar
    expect(dashboard).toContain("Sudah punya token kelas?");
    expect(dashboard).toContain("<EnrollmentForm");

    // Paket belajar semester section exists in main content
    expect(dashboard).toContain("Paket belajar semester");

    // Order: Free section appears before Paket belajar semester
    const freeIndex = dashboard.indexOf("Yang tersedia di Free");
    const paketIndex = dashboard.indexOf("Paket belajar semester");
    expect(freeIndex).toBeGreaterThan(-1);
    expect(paketIndex).toBeGreaterThan(-1);
    expect(paketIndex).toBeGreaterThan(freeIndex);
  });

  test("course materials lock premium content while keeping free pdfs accessible", () => {
    const materialPage = source("app/(student)/courses/[id]/material/page.tsx");
    const materialDetail = source("app/(student)/courses/[id]/material/[materialId]/page.tsx");

    // Free PDF condition
    expect(materialPage).toContain('material.kind === "pdf" && material.docCategory !== "diktat"');
    expect(materialPage).toContain("locked = !isEnrolled && !isFreeContent");

    // Token activation banner for unenrolled students
    expect(materialPage).toContain("!isEnrolled");
    expect(materialPage).toContain("<EnrollmentForm");

    // Detail page checks
    expect(materialDetail).toContain('access?.tier === "standard"');
    expect(materialDetail).toContain("isFreePdf");
  });

  test("flashcards and tryouts require enrollment for full access", () => {
    const flashcardPage = source("app/(student)/courses/[id]/flashcard/page.tsx");
    const tryoutDetail = source("app/(student)/courses/[id]/tryout/[tryoutId]/page.tsx");

    expect(flashcardPage).toContain('access?.tier === "standard"');
    expect(flashcardPage).toContain("<EnrollmentForm");
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
