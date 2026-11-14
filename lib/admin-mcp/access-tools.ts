import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { and, asc, eq, ne, or, exists } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { user, pengguna, penggunaPeran, peran, groups, groupCourses, groupMembers } from "@/db/schema";
import { membershipIdFor, PERAN_SEEDS, peranIdFor } from "@/lib/auth/peran";
import { requireMcpScope, type McpPrincipal } from "@/lib/authoring/mcp-auth";
import { adminId, adminPagination, adminRevision, adminToolkit } from "./toolkit";
import { AdminMcpError, revisionOf, type AdminTransaction } from "./mutations";
import { lockAuthoringIdentityChange } from "@/lib/auth/authoring-actor";

async function identity(client: typeof db | AdminTransaction, id: string) {
  const [row] = await client.select({ id: user.id, name: user.name, legacyRole: user.role, status: pengguna.status }).from(user).innerJoin(pengguna, eq(user.id, pengguna.id)).where(eq(user.id, id)).limit(1);
  if (!row) throw new AdminMcpError("NOT_FOUND");
  const roles = await client.select({ code: peran.code }).from(penggunaPeran).innerJoin(peran, eq(penggunaPeran.peranId, peran.id)).where(eq(penggunaPeran.penggunaId, id)).orderBy(asc(peran.code));
  return { ...row, roles: roles.map(r => r.code) };
}
async function guardAdmin(tx: AdminTransaction, actor: string, target: Awaited<ReturnType<typeof identity>>) {
  if (target.id === actor) throw new AdminMcpError("SELF_ADMIN_CHANGE");
  if (target.status !== "active" || (target.legacyRole !== "admin" && !target.roles.includes("admin"))) return;
  const otherRole = tx.select({ id: penggunaPeran.id }).from(penggunaPeran).innerJoin(peran, eq(peran.id, penggunaPeran.peranId)).where(and(eq(penggunaPeran.penggunaId, pengguna.id), eq(peran.code, "admin")));
  const others = await tx.select({ id: user.id }).from(user).innerJoin(pengguna, eq(user.id, pengguna.id)).where(and(ne(user.id, target.id), eq(pengguna.status, "active"), or(eq(user.role, "admin"), exists(otherRole)))).limit(1);
  if (!others.length) throw new AdminMcpError("LAST_ADMIN");
}

export function registerAccessTools(server: McpServer, principal: McpPrincipal): void {
  const { read, write } = adminToolkit(server, principal);
  read("users.list", "users:read", z.object({ ...adminPagination, includeEmail: z.boolean().default(false) }), "List user metadata. Email requires users:pii:read.", async ({ limit, offset, includeEmail }) => {
    if (includeEmail) requireMcpScope(principal, "users:pii:read");
    const rows = await db.select({ id: user.id }).from(user).innerJoin(pengguna, eq(user.id, pengguna.id)).orderBy(asc(user.id)).limit(limit).offset(offset);
    return Promise.all(rows.map(async ({ id }) => {
      const data = await identity(db, id);
      const email = includeEmail ? (await db.select({ email: user.email }).from(user).where(eq(user.id, id)).limit(1))[0]?.email : undefined;
      return { ...data, revision: revisionOf(data), ...(includeEmail ? { email } : {}) };
    }));
  });
  read("users.get", "users:read", z.object({ id: adminId, includeEmail: z.boolean().default(false) }), "Get user metadata and revision. Email requires users:pii:read.", async ({ id, includeEmail }) => {
    if (includeEmail) requireMcpScope(principal, "users:pii:read");
    const data = await identity(db, id);
    const email = includeEmail ? (await db.select({ email: user.email }).from(user).where(eq(user.id, id)).limit(1))[0]?.email : undefined;
    return { ...data, revision: revisionOf(data), ...(includeEmail ? { email } : {}) };
  });
  write("users.set_status", "users:status:write", z.object({ id: adminId, expectedRevision: adminRevision, status: z.enum(["active", "suspended"]) }), "Change user status.", async (tx, input) => {
    const current = await identity(tx, input.id);
    if (revisionOf(current) !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.status === "suspended") await guardAdmin(tx, principal.actorId, current);
    await tx.update(pengguna).set({ status: input.status, updatedAt: new Date() }).where(eq(pengguna.id, input.id));
    return { id: input.id, revision: revisionOf(await identity(tx, input.id)) };
  });
  write("users.set_roles", "users:roles:write", z.object({ id: adminId, expectedRevision: adminRevision, roles: z.array(z.enum(["admin", "tutor", "murid"])).min(1).max(3).refine(v => new Set(v).size === v.length) }), "Replace user roles. Granting admin requires users:roles:admin.", async (tx, input) => {
    if (!(await lockAuthoringIdentityChange(tx, input.id))) throw new AdminMcpError("NOT_FOUND");
    const current = await identity(tx, input.id);
    if (revisionOf(current) !== input.expectedRevision) throw new AdminMcpError("REVISION_CONFLICT");
    if (input.roles.includes("admin") && !current.roles.includes("admin") && current.legacyRole !== "admin") requireMcpScope(principal, "users:roles:admin");
    if (!input.roles.includes("admin") && (current.roles.includes("admin") || current.legacyRole === "admin")) await guardAdmin(tx, principal.actorId, current);
    for (const seed of PERAN_SEEDS) await tx.insert(peran).values(seed).onConflictDoNothing();
    await tx.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, input.id));
    for (const role of input.roles) await tx.insert(penggunaPeran).values({ id: membershipIdFor(input.id, role), penggunaId: input.id, peranId: peranIdFor(role), source: "admin_role_management", auditActorPenggunaId: principal.actorId });
    await tx.update(user).set({ role: input.roles.includes("admin") ? "admin" : input.roles.includes("tutor") ? "teacher" : "student", updatedAt: new Date() }).where(eq(user.id, input.id));
    return { id: input.id, revision: revisionOf(await identity(tx, input.id)) };
  });
  read("groups.get", "groups:read", z.object({ id: adminId }), "Get group metadata and revision.", async ({ id }) => {
    const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (!group) throw new AdminMcpError("NOT_FOUND");
    const courses = await db.select({ courseId: groupCourses.courseId }).from(groupCourses).where(eq(groupCourses.groupId, id)).orderBy(asc(groupCourses.courseId));
    return { ...group, courses, revision: revisionOf({ group, courses }) };
  });
  read("groups.members.list", "groups:members:read", z.object({ id: adminId, ...adminPagination }), "List group membership metadata.", async ({ id, limit, offset }) => db.select({ id: groupMembers.id, userId: groupMembers.userId, role: groupMembers.role, joinedAt: groupMembers.joinedAt }).from(groupMembers).where(eq(groupMembers.groupId, id)).orderBy(asc(groupMembers.id)).limit(limit).offset(offset));
}
