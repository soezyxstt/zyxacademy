import { describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { loadMessages } from "@/lib/i18n/catalogs";
import { emptyComposerDraft, type ComposerDraft } from "@/components/discussions/composer";
import type { DiscussionChannel, DiscussionForwardDraft } from "@/components/discussions/view-model";
import type { TutorScheduleReadModel } from "@/lib/schedule/tutor-read-model";

let mockPathname = "/dashboard";

mock.module("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    refresh: () => {},
  }),
}));

mock.module("@/lib/i18n/actions", () => ({
  saveLocaleSelection: async () => ({ success: true }),
  mirrorResolvedAccountLocaleCookie: async () => {},
}));

mock.module("@/lib/auth-client", () => ({
  signIn: { email: async () => ({}) },
  signOut: async () => {},
  useSession: () => ({
    data: { user: { id: "user-1", name: "Nadia Putri", email: "nadia@example.test", role: "admin" } },
    isPending: false,
  }),
  authClient: {},
}));

mock.module("@/app/(student)/dashboard/actions", () => ({
  getStudentEnrollments: async () => [],
  getCourseAction: async () => null,
  updateMaterialProgress: async () => ({ success: true }),
}));

mock.module("@/app/(admin)/admin/(academic)/courses/actions", () => ({
  getCourseNavContext: async () => null,
  getCourses: async () => [],
  deleteCourseMaterial: async () => ({ success: true }),
  saveCourseMaterial: async () => ({ success: true }),
  batchStandardizeDocumentsAction: async () => ({ success: true }),
}));

mock.module("@/components/admin/course-detail/admin-upload-document-dialog", () => ({
  AdminUploadDocumentDialog: () => null,
}));

mock.module("@/app/(tutor)/tutor/schedule/slot-note-actions", () => ({
  addTutorSlotWithNotesAction: async () => ({ success: true }),
  getTutorSlotNotesAction: async () => ({}),
}));

mock.module("@/app/(tutor)/tutor/schedule/actions", () => ({
  deleteTutorSlotAction: async () => ({ success: true }),
  copyTutorAvailabilityAction: async () => ({ success: true, createdCount: 0, conflicts: [] }),
  moveTutorSessionAction: async () => ({ success: true, movedDirectly: true }),
  decideTutorRescheduleTicketAction: async () => ({ success: true }),
  executeDecideTutorRescheduleTicket: async () => ({ success: true }),
  replyTutorTicketMessageAction: async () => ({ success: true }),
}));

mock.module("@/components/discussions/discussion-count-badge", () => ({
  DISCUSSION_COUNTS_CHANGED: "discussion-counts-changed",
  DiscussionCountBadge: () => null,
}));

const messagesId = await loadMessages("id");

function renderId(element: React.ReactNode) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="id" timeZone="Asia/Jakarta" messages={messagesId}>
      {element}
    </NextIntlClientProvider>,
  );
}

const { DiscussionWorkspace } = await import("@/components/discussions/discussion-workspace");
const { DocumentListClient } = await import("@/app/(student)/courses/[id]/material/document-list-client");
const { TodayPlan } = await import("@/components/dashboard/today-plan");
const { DashboardHeaderShell } = await import("@/app/(student)/dashboard/dashboard-skeletons");
const { TutorScheduleView } = await import("@/components/tutor/tutor-schedule-view");
const { StudentSidebar } = await import("@/components/student-sidebar");
const { StudentExperienceProvider } = await import("@/components/student-experience-provider");
const { AdminSidebar } = await import("@/components/admin-sidebar");
const { TooltipProvider } = await import("@/components/ui/tooltip");

describe("staging feedback UI contracts", () => {
  test("discussion workspace fills 100dvh, pins resolved at bottom, inlines notification bell, and composes inline", () => {
    const channel: DiscussionChannel = {
      id: "math",
      name: "Matematika I",
      kind: "course",
      courseId: "math",
      unreadCount: 2,
      muted: false,
      canCreate: true,
    };
    const baseProps = {
      viewer: { id: "u1", name: "Nadia Putri", role: "student" as const },
      channels: [channel],
      questions: [
        {
          id: "q1",
          channelId: "math",
          title: "Cara menghitung limit",
          status: "open" as const,
          lastActivityAt: "2026-11-15T09:00:00Z",
          unreadCount: 0,
          answerCount: 0,
          allowedForwardChannelIds: ["math"],
          canReply: true,
          canResolve: true,
        },
      ],
      resolvedQuestions: [],
      resolvedOpen: true,
      resolvedState: "ready" as const,
      selectedQuestion: null,
      messages: [],
      selectedChannelId: "math",
      selectedQuestionId: null,
      search: "",
      listState: "ready" as const,
      threadState: "ready" as const,
      onSelectChannel: () => {},
      onSelectQuestion: () => {},
      onSearchChange: () => {},
      onRetryQuestions: () => {},
      onRetryMessages: () => {},
      onSearchChannels: async () => ({ items: [channel], nextCursor: null }),
      onSearchMentions: async () => [],
      onSearchForwardTargets: async () => ({ items: [], nextCursor: null }),
      onCreateQuestion: async () => {},
      onSendReply: async () => {},
      onUploadImage: async () => ({ ok: false as const, error: "unknown" as const }),
      onEditMessage: async () => {},
      onDeleteMessage: async () => {},
      onToggleReaction: async () => {},
      onForwardMessage: async () => {},
      onReportMessage: async () => {},
      onSetChannelMuted: async () => {},
    };

    const listHtml = renderId(<DiscussionWorkspace {...baseProps} />);
    expect(listHtml).toContain("h-[calc(100dvh-9rem)]");
    expect(listHtml).toContain("data-discussion-resolved");
    expect(listHtml).toContain("max-h-[50%]");
    expect(listHtml).toContain('aria-label="Bisukan notifikasi Matematika I"');
    // No duplicate channel name banner beneath row 1 of <aside>
    const asideHeader = listHtml.match(/<header[^>]*\bdata-discussion-list-toolbar=""[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? "";
    expect(asideHeader).toContain('aria-label="Bisukan notifikasi Matematika I"');
    expect(asideHeader.match(/>Matematika I</g)?.length ?? 0).toBe(1);

    const composeDrafts: Record<string, ComposerDraft> = { new: emptyComposerDraft() };
    const forwardDrafts: Record<string, DiscussionForwardDraft> = {};
    const composeHtml = renderId(
      <DiscussionWorkspace
        {...baseProps}
        draftState={{
          drafts: [composeDrafts, () => {}],
          forwardDrafts: [forwardDrafts, () => {}],
          newOpen: [true, () => {}],
          newChannel: [channel, () => {}],
        }}
      />,
    );
    expect(composeHtml).toContain("data-discussion-new-question");
    expect(composeHtml).toContain("data-discussion-composer");
    expect(composeHtml).not.toContain('role="dialog"');
  });

  test("documents start in list mode and keep grid available", () => {
    const html = renderId(
      <DocumentListClient
        courseId="math"
        courseTitle="Matematika I"
        chapters={[]}
        materials={[
          {
            id: "doc-1",
            courseId: "math",
            title: "Bab 1: Limit",
            kind: "article",
            docCategory: "materi",
            chapterId: "ch-1",
            fileSize: "Rangkuman Materi",
            completed: false,
          },
        ]}
      />,
    );
    expect(html).toMatch(/aria-label="Tampilan daftar"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/aria-label="Tampilan grid"[^>]*aria-pressed="false"/);
    expect(html).toContain('title="Bab 1: Limit"');
  });

  test("dashboard header does not render streak days badge", () => {
    const planHtml = renderId(
      <TodayPlan
        firstName="Nadia"
        adapter={{
          data: {
            items: [{ id: "1", kind: "quiz", title: "Latihan Limit", href: "/courses/math/quiz", done: false }],
            streak: { current: 5, longest: 10 },
            weeklyActivity: [true, true, false, false, false, false, false],
            enrollments: [],
          },
          complete: () => {},
        }}
      />,
    );
    expect(planHtml).not.toMatch(/\b\d+\s*(hari|days)\b/i);
    expect(planHtml).not.toContain("lucide-flame");

    const shellHtml = renderId(<DashboardHeaderShell firstName="Nadia" />);
    expect(shellHtml).not.toMatch(/\b\d+\s*(hari|days)\b/i);
    expect(shellHtml).not.toContain("lucide-flame");
  });

  test("tutor schedule uses a Select view switcher instead of tabs", () => {
    const data: TutorScheduleReadModel = {
      tutor: { id: "t1", name: "Raka", email: "raka@example.test", status: "active" },
      assignedActiveCourses: [],
      eligibleGroups: [],
      ownedSlots: [],
      ownedBookings: [],
      ownedTickets: [],
      ownedSchedules: [],
      compatibilitySource: "canonical",
    };
    const html = renderId(<TutorScheduleView initialData={data} currentUserId="t1" />);
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('role="combobox"');
  });

  test("student sidebar uses Medal icon for leaderboard and AdminSidebar places discussion in academic group", () => {
    const queryClient = new QueryClient();
    mockPathname = "/dashboard";
    const sidebarHtml = renderId(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StudentExperienceProvider
            value={{
              mode: "demo",
              pathname: "/dashboard",
              courses: [{ id: "math", title: "Matematika I" }],
              courseHref: (id) => `/courses/${id}`,
              route: (view, id) => (id ? `/courses/${id}/${view}` : `/${view}`),
              baseline: [],
              selectedCourseId: null,
              overlay: null,
              ready: true,
            }}
          >
            <StudentSidebar />
          </StudentExperienceProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const leaderboardLink = sidebarHtml.match(/<a[^>]*href="\/leaderboard"[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(leaderboardLink).toContain("lucide-medal");
    expect(leaderboardLink).not.toContain("lucide-trophy");

    mockPathname = "/courses/math";
    const courseSidebarHtml = renderId(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <StudentExperienceProvider
            value={{
              mode: "demo",
              pathname: "/courses/math",
              courses: [{ id: "math", title: "Matematika I" }],
              courseHref: (id) => `/courses/${id}`,
              route: (view, id) => (id ? `/courses/${id}/${view}` : `/${view}`),
              baseline: [],
              selectedCourseId: "math",
              overlay: null,
              ready: true,
            }}
          >
            <StudentSidebar />
          </StudentExperienceProvider>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const courseLeaderboardLink = courseSidebarHtml.match(/<a[^>]*href="\/courses\/math\/leaderboard"[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(courseLeaderboardLink).toContain("lucide-medal");
    expect(courseLeaderboardLink).not.toContain("lucide-trophy");

    mockPathname = "/admin/discussions";
    const adminHtml = renderId(
      <TooltipProvider>
        <AdminSidebar />
      </TooltipProvider>,
    );
    const academicIndex = adminHtml.indexOf("Akademik");
    const toolsIndex = adminHtml.indexOf("Alat");
    const discussionIndex = adminHtml.indexOf('href="/admin/discussions"');
    expect(academicIndex).toBeGreaterThan(-1);
    expect(toolsIndex).toBeGreaterThan(academicIndex);
    expect(discussionIndex).toBeGreaterThan(academicIndex);
    expect(discussionIndex).toBeLessThan(toolsIndex);
  });
});
