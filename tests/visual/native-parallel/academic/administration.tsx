import { GroupsDashboard } from "@/components/admin/groups-dashboard";
import { TokensDashboard } from "@/components/admin/tokens-dashboard";
import { UsersDashboard } from "@/components/admin/users-dashboard";
import { courseFixtures } from "@/packages/native-parity/academic/courses/fixtures";
import { packagePresets, seedAdministration } from "@/packages/native-parity/academic/administration/fixtures";
import type { AdminUserItem, AdminUsersQuery } from "@/app/(admin)/admin/(academic)/users/actions";

const actor = { id: "academic-admin", role: "admin" } as const;
const sampleStart = new Date("2026-11-01T03:00:00Z");
const coursesList = courseFixtures.map(({ course }) => course);
const records = (empty = false) => seedAdministration(actor, empty);

function usersData(empty: boolean) {
  return records(empty).users.map((person): AdminUserItem => {
    const roles = person.roles.map((role) => role === "student" ? "murid" : role);
    return {
      ...person, roles, image: null, emailVerified: true, legacyRole: roles[0] ?? null,
      createdAt: sampleStart.toISOString(), updatedAt: null, lastActivityAt: null,
    };
  });
}

function stats(users: AdminUserItem[]) {
  return {
    totalUsers: users.length,
    adminCount: users.filter(({ roles }) => roles.includes("admin")).length,
    tutorCount: users.filter(({ roles }) => roles.includes("tutor")).length,
    muridCount: users.filter(({ roles }) => roles.includes("murid")).length,
    activeCount: users.filter(({ status }) => status === "active").length,
    suspendedCount: users.filter(({ status }) => status === "suspended").length,
  };
}

export async function getAdminUsersData({ role, search, status }: AdminUsersQuery = {}) {
  const users = usersData(new URLSearchParams(location.search).get("state") === "empty").filter((user) =>
    (!role || role === "all" || user.roles.some((item) => item === role))
    && (!status || status === "all" || user.status === status)
    && (!search || `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase())),
  );
  return { users, total: users.length, stats: stats(users), currentUserId: actor.id };
}

export function usersView(empty: boolean) {
  const users = usersData(empty);
  return <UsersDashboard initialUsers={users} initialStats={stats(users)} initialTotal={users.length} currentUserId={actor.id} />;
}

export function groupsView(empty: boolean) {
  const data = records(empty);
  const groups = data.groups.map((group) => ({
    id: group.id, name: group.name, packageType: group.packageType, packageName: packagePresets[group.packageType].title,
    totalQuotaSessions: group.total, weeklyQuotaSessions: group.weekly, usedQuotaSessions: group.used,
    remainingQuota: group.total - group.used, academicYear: group.year, semester: group.semester,
    startDate: null, endDate: null, status: group.status, notes: group.notes, createdAt: sampleStart, updatedAt: sampleStart,
    courses: coursesList.filter(({ id }) => group.courseIds.includes(id)),
    members: group.members.flatMap(({ userId, role }) => {
      const person = data.users.find(({ id }) => id === userId);
      return person ? [{ id: userId, userId, role, joinedAt: sampleStart, user: { ...person, image: null, role: "student" } }] : [];
    }),
    memberCount: group.members.length,
    bookingsCount: group.used,
  }));
  const groupStats = {
    totalGroups: groups.length,
    activeGroups: groups.filter(({ status }) => status === "active").length,
    totalMembers: groups.reduce((sum, group) => sum + group.memberCount, 0),
    avgQuotaUsed: groups.length ? Math.round(groups.reduce((sum, group) => sum + group.usedQuotaSessions / group.totalQuotaSessions * 100, 0) / groups.length) : 0,
  };
  return <GroupsDashboard initialGroups={groups} initialStats={groupStats} initialTotal={groups.length} coursesList={coursesList} />;
}

export function tokensView(empty: boolean) {
  const data = records(empty);
  return <TokensDashboard coursesList={coursesList} initialTokens={data.tokens.map((token) => {
    const group = data.groups.find(({ id }) => id === token.groupId);
    return {
      id: token.id, token: token.code, capacity: token.capacity, createdAt: sampleStart, expiresAt: new Date(token.expires),
      courses: coursesList.filter(({ id }) => token.courseIds.includes(id)),
      group: group && {
        ...group,
        packageName: packagePresets[group.packageType].title, totalQuotaSessions: group.total, weeklyQuotaSessions: group.weekly,
        members: group.members.flatMap(({ userId }) => {
          const user = data.users.find(({ id }) => id === userId);
          return user ? [{ userId, user, joinedAt: sampleStart }] : [];
        }),
      } || null,
    };
  })} />;
}
