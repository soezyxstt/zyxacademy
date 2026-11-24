"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandMenuProvider } from "@/components/command-menu";
import { StudentExperienceProvider, type StudentExperienceAdapter } from "@/components/student-experience-provider";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationPage } from "@/components/application-page";
import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminMobileBottomNav, AdminMobileSubTabNav, AdminMobileTopNav } from "@/components/navigation/admin";
import { OpsClient } from "@/app/(admin)/admin/ops/ops-client";
import { AiAnalyticsClient } from "@/app/(admin)/admin/ops/analytics/analytics-client";
import { KeysClient } from "@/app/(admin)/admin/ops/keys/keys-client";
import { ActivityTable } from "@/app/(admin)/admin/ops/tutor-activity/_components/activity-table";
import { FeatureUsageOverview } from "@/app/(admin)/admin/ops/feature-usage/feature-usage-overview";
import type { TutorActivityItem } from "@/app/(admin)/admin/ops/tutor-activity/dal";
import { MOCK_FEATURE_USAGE } from "./feature-usage-data";

const MOCK_TUTOR_ACTIVITIES: TutorActivityItem[] = [
  {
    id: "act-1",
    createdAt: new Date("2026-10-28T14:36:00Z"),
    actorId: "u-1",
    actorName: "Admin Demo",
    actorEmail: "admin.demo@example.com",
    courseId: null,
    courseTitle: null,
    courseCode: null,
    entityType: "bab",
    entityId: "89e0a83d-0ce2-4ea1-8891-1234567890ab",
    action: "canonical_create_with_legacy",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-1",
    actorImage: null,
    beforeSnapshot: null,
    afterSnapshot: null,
  },
  {
    id: "act-2",
    createdAt: new Date("2026-10-28T14:28:00Z"),
    actorId: "u-1",
    actorName: "Admin Demo",
    actorEmail: "admin.demo@example.com",
    courseId: null,
    courseTitle: null,
    courseCode: null,
    entityType: "mata_kuliah",
    entityId: "berkom",
    action: "canonical_create_with_legacy",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-2",
    actorImage: null,
    beforeSnapshot: null,
    afterSnapshot: null,
  },
  {
    id: "act-3",
    createdAt: new Date("2026-10-23T10:24:00Z"),
    actorId: "u-1",
    actorName: "Admin Demo",
    actorEmail: "admin.demo@example.com",
    courseId: "ma1101",
    courseTitle: "Matematika I",
    courseCode: "MA1101",
    entityType: "product_bundle",
    entityId: "impor-product-027",
    action: "draft_created",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-3",
    actorImage: null,
    beforeSnapshot: null,
    afterSnapshot: null,
  },
  {
    id: "act-4",
    createdAt: new Date("2026-10-03T08:48:00Z"),
    actorId: "u-2",
    actorName: "Raka Contoh",
    actorEmail: "raka.tutor@example.com",
    courseId: "global",
    courseTitle: null,
    courseCode: null,
    entityType: "tutor_slot",
    entityId: "9f0f7e02-df15-44e0-a211-abc",
    action: "tutor.slot.copy_previous_week",
    outcome: "success",
    reason: null,
    correlationId: "corr-4",
    actorImage: null,
    beforeSnapshot: null,
    afterSnapshot: null,
  },
  {
    id: "act-5",
    createdAt: new Date("2026-10-03T05:44:00Z"),
    actorId: "u-1",
    actorName: "Admin Demo",
    actorEmail: "admin.demo@example.com",
    courseId: "fi1101",
    courseTitle: "Fisika Dasar I",
    courseCode: "FI1101",
    entityType: "tutor_assignment",
    entityId: "73be09ac-d883-45f1-def",
    action: "dual_write",
    outcome: "unclassified",
    reason: null,
    correlationId: "corr-5",
    actorImage: null,
    beforeSnapshot: null,
    afterSnapshot: null,
  },
];

type ViewKey = "ops" | "tutor-activity" | "analytics" | "feature-usage" | "keys" | "mobile-ops";

function AdminOpsReworkContent() {
  const searchParams = useSearchParams();
  const view = (searchParams.get("view") as ViewKey) || "ops";

  const queryClient = useMemo(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }), []);

  const experience = useMemo<StudentExperienceAdapter>(
    () => ({
      mode: "demo",
      pathname: "/admin/ops",
      href: (path: string) => path,
      account: { name: "Admin Demo", email: "admin.demo@example.com" },
      courseHref: (id) => `/courses/${id}`,
      route: (v) => `/${v}`,
      baseline: [],
      selectedCourseId: null,
      overlay: null,
      ready: true,
    }),
    []
  );

  const sidebarPathMap: Record<ViewKey, string> = {
    ops: "/admin/ops",
    "tutor-activity": "/admin/ops/tutor-activity",
    analytics: "/admin/ops/analytics",
    "feature-usage": "/admin/ops/feature-usage",
    keys: "/admin/ops/keys",
    "mobile-ops": "/admin/ops/web-analytics",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <CommandMenuProvider>
        <StudentExperienceProvider value={experience}>
          <ApplicationShell
            showOrnaments={false}
            desktopSidebar={<AdminSidebar pathnameOverride={sidebarPathMap[view]} />}
            mobileTopNav={view === "mobile-ops" ? <AdminMobileTopNav /> : undefined}
            mobileBottomNav={view === "mobile-ops" ? <AdminMobileBottomNav /> : undefined}
          >
            {view === "mobile-ops" && <AdminMobileSubTabNav />}
            <ApplicationPage maxWidth="7xl" className="pb-10">
              {view === "ops" && <OpsClient />}
              {view === "tutor-activity" && (
                <ActivityTable
                  items={MOCK_TUTOR_ACTIVITIES}
                  hasNextPage={true}
                  hasPrevPage={false}
                  onNextPage={() => {}}
                  onPrevPage={() => {}}
                  limit={20}
                />
              )}
              {view === "analytics" && <AiAnalyticsClient />}
              {view === "feature-usage" && <FeatureUsageOverview metrics={MOCK_FEATURE_USAGE} />}
              {view === "keys" && <KeysClient />}
              {view === "mobile-ops" && <OpsClient />}
            </ApplicationPage>
          </ApplicationShell>
        </StudentExperienceProvider>
      </CommandMenuProvider>
    </QueryClientProvider>
  );
}

export default function AdminOpsReworkFixturePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AdminOpsReworkContent />
    </Suspense>
  );
}
