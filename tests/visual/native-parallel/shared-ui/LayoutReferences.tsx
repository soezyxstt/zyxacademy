"use client";

import { useState } from "react";
import { ApplicationPage } from "@/components/application-page";
import { ApplicationShell } from "@/components/application-shell";
import { MobileTopNavbar } from "@/components/navigation/mobile-top-navbar";
import {
  StudentExperienceProvider,
  useStudentExperience,
} from "@/components/student-experience-provider";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  AdminEmptyState,
  AdminErrorState,
} from "@/components/admin/state-panels";
import { UsersDashboard } from "@/components/admin/users-dashboard";
import { DocumentListClient } from "@/app/(student)/courses/[id]/material/document-list-client";
import { ParticipantsClient } from "@/app/(tutor)/tutor/[courseId]/participants/participants-client";
import { layoutFixture as f } from "@/packages/native-parity/shared-ui/layout-cases";
import type { AdminUserItem } from "@/app/(admin)/admin/(academic)/users/actions";

const users: AdminUserItem[] = f.rows.map((row) => ({
  id: row.id,
  name: row.title,
  email: row.subtitle,
  image: null,
  emailVerified: true,
  legacyRole: null,
  roles: [row.access === "Tutor" ? "tutor" : "murid"],
  status: row.status === "Aktif" ? "active" : "suspended",
  createdAt: null,
  updatedAt: null,
  lastActivityAt: null,
}));

function Roster({ wide }: { wide: boolean }) {
  if (!wide)
    return (
      <UsersDashboard
        currentUserId="fixture"
        initialTotal={users.length}
        initialUsers={users}
        initialStats={{
          totalUsers: 3,
          adminCount: 0,
          tutorCount: 1,
          muridCount: 2,
          activeCount: 2,
          suspendedCount: 1,
        }}
      />
    );
  return (
    <ParticipantsClient
      data={{
        course: {
          id: "fixture",
          title: f.course,
          code: "FI",
          legacyCourseId: null,
          accessSource: null,
          isCompatibilityFallback: false,
        },
        summary: {
          totalParticipants: users.length,
          directEnrollmentsCount: users.length,
          groupParticipantsCount: 0,
          activeGroupsCount: 0,
        },
        participants: users.map((user) => ({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: null,
          enrollmentType: "direct",
          enrolledAt: null,
          expiresAt: null,
          groups: [],
        })),
        groups: [],
      }}
    />
  );
}

export function LayoutReferences({ id }: { id: string }) {
  const experience = useStudentExperience();
  const [course, setCourse] = useState(false);
  const [state, setState] = useState(
    id.includes("list-error")
      ? "error"
      : id.includes("list-empty")
        ? "empty"
        : "ready",
  );
  const documents = id.includes("shell-back") || id.includes("shell-long");
  const slots = id.includes("shell-slots");
  const headingOnly = id.includes("header-long");
  const title = course
    ? f.course
    : documents
      ? id.includes("long-title")
        ? f.longTitle
        : f.documents
      : slots
        ? f.participants
        : f.users;
  const back = () => setCourse(true);
  const actions = course ? (
    <Button onClick={() => setCourse(false)}>{f.open}</Button>
  ) : headingOnly ? undefined : id.includes("action-states") ? (
    <>
      <Button disabled variant="outline">
        {f.reset}
      </Button>
      <Button isLoading>{f.save}</Button>
    </>
  ) : (
    <Button
      variant="outline"
      onClick={() => setState(state === "empty" ? "ready" : "empty")}
    >
      {f.filter}
    </Button>
  );
  return (
    <StudentExperienceProvider value={{ ...experience, mode: "demo" }}>
      <ApplicationShell
        showOrnaments={false}
        mobileTopNav={
          headingOnly ? undefined : (
            <MobileTopNavbar
              title={title}
              backLabel={f.back}
              onBack={documents && !course ? back : undefined}
            />
          )
        }
        mobileBottomNav={
          slots ? (
            <Button onClick={() => setState("empty")}>{f.apply}</Button>
          ) : undefined
        }
      >
        <ApplicationPage>
          <PageHeader
            title={headingOnly ? f.longTitle : title}
            actions={actions}
          />
          {course ? null : state === "error" ? (
            <AdminErrorState
              message={f.errorTitle}
              onRetry={() => setState("ready")}
            />
          ) : state === "empty" ? (
            <AdminEmptyState
              title={f.emptyTitle}
              description={f.emptyMessage}
              action={
                <Button onClick={() => setState("ready")}>{f.reset}</Button>
              }
            />
          ) : documents ? (
            <DocumentListClient
              courseId="fixture"
              chapters={[]}
              materials={f.materials.map((row) => ({
                id: row.id,
                courseId: "fixture",
                title: row.title,
                kind: "article",
                docCategory: "materi",
                completed: false,
              }))}
            />
          ) : (
            <Roster wide={id.includes("wide") || headingOnly} />
          )}
        </ApplicationPage>
      </ApplicationShell>
    </StudentExperienceProvider>
  );
}
