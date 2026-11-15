"use client";

import { Users } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { StudentGroupsCompactClient, type StudentGroup } from "@/components/dashboard/student-groups-compact-client";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { demoGroupId } from "@/lib/demo/community-seed";
import { demoGroupUsage, demoWeek } from "@/lib/demo/community-state";
import { getJakartaCalendarDate } from "@/lib/date-utils";
import { normalizeGroupName, validateGroupName } from "@/lib/groups/group-name-policy";
import { demoIdentity, demoOwnIdentity } from "@/lib/demo/gamification";
import { useDemoGamification } from "./demo-gamification-provider";
import { useDemoCommunity } from "./use-demo-community";

export function DemoGroups() {
  const { state, ready, error, save, scope } = useDemoCommunity();
  const experience = useStudentExperience();
  const { state: gamification } = useDemoGamification();
  const ownName = experience.account?.name ?? "Pelajar Demo";
  const t = useTranslations("student");
  const course = experience.courses?.find(row => row.id === scope.courseId);
  const baseline = experience.baseline.find(row => row.courseId === scope.courseId);
  const week = demoWeek({ ...scope, courseTitle: course?.title }, getJakartaCalendarDate(), state);
  const usage = demoGroupUsage(scope.courseId, state, week.bookings);
  const group: StudentGroup = {
    id: demoGroupId(scope.courseId), name: state.group.name,
    packageName: t("groups.tutorialPackage"), frequencyLabel: t("groups.weeklySessions", { count: 3 }),
    totalQuotaSessions: 9999, ...usage,
    weeklyQuotaSessions: 3, weeklyRemainingQuota: Math.max(0, 3 - usage.weeklyUsedSessions),
    academicYear: baseline?.asOf.slice(0, 4) ?? "", semester: "",
    endDate: null, joinedAt: new Date(`${baseline?.asOf ?? "2026-01-01"}T00:00:00Z`),
    myRole: "leader", isLeader: true, courses: course ? [course] : [],
    members: state.group.members.map((name, index) => ({ id: `${scope.courseId}-member-${index}`, name, identity: name === ownName ? demoOwnIdentity(ownName, gamification.equipped) : demoIdentity(name), role: index === 0 ? "leader" : "member", isMe: index === 0 })),
    token: null,
  };
  return <ApplicationPage>
    <PageHeader icon={Users} title={t("navigation.groups")} />
    {ready ? <StudentGroupsCompactClient initialGroups={[group]} onLocalRename={name => {
      if (validateGroupName(name)) throw new Error("INVALID_GROUP_NAME");
      save(current => ({ ...current, group: { ...current.group, name: normalizeGroupName(name) } }));
    }} /> : <Skeleton className="h-72 w-full" aria-busy="true" />}
    {error ? <p role="alert" className="text-body-xs text-destructive">{error}</p> : null}
  </ApplicationPage>;
}
