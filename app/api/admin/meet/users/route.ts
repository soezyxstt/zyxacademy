import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { env } from "@/lib/env";
import { hasPeran } from "@/lib/auth/authorization";
import { db } from "@/db";
import { user, pengguna, penggunaPeran, peran, enrollments, courses } from "@/db/schema";
import { eq, gt } from "drizzle-orm";
import { slugifySegment } from "@/lib/storage/keys";

export async function GET() {
  try {
    if (env.FEATURE_PERAN_V2 === "1") {
      const session = await auth.api.getSession({ headers: await headers() });
      if (!session?.user || !(await hasPeran(session.user.id, "admin"))) {
        return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
      }
    }

    const [userRows, roleRows, enrollmentRows, courseRows] = await Promise.all([
      db
        .select({ id: user.id, name: user.name, email: user.email, legacyRole: user.role })
        .from(user)
        .innerJoin(pengguna, eq(pengguna.id, user.id))
        .where(eq(pengguna.status, "active")),
      db
        .select({ penggunaId: penggunaPeran.penggunaId, code: peran.code })
        .from(penggunaPeran)
        .innerJoin(peran, eq(penggunaPeran.peranId, peran.id)),
      db
        .select({ userId: enrollments.userId, courseId: enrollments.courseId })
        .from(enrollments)
        .where(gt(enrollments.expiresAt, new Date())),
      db.select({ id: courses.id, title: courses.title }).from(courses),
    ]);

    const rolesByUser = new Map<string, string[]>();
    for (const row of roleRows) {
      const list = rolesByUser.get(row.penggunaId) ?? [];
      if (!list.includes(row.code)) list.push(row.code);
      rolesByUser.set(row.penggunaId, list);
    }

    const coursesByUser = new Map<string, string[]>();
    for (const row of enrollmentRows) {
      const list = coursesByUser.get(row.userId) ?? [];
      if (!list.includes(row.courseId)) list.push(row.courseId);
      coursesByUser.set(row.userId, list);
    }

    const users = userRows.map((u) => {
      const roles = rolesByUser.get(u.id) ?? [];
      const legacyRole =
        u.legacyRole === "teacher" ? "tutor" : u.legacyRole === "student" ? "murid" : u.legacyRole;
      if (legacyRole && !roles.includes(legacyRole)) roles.push(legacyRole);
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        roles,
        courseIds: coursesByUser.get(u.id) ?? [],
      };
    });

    const courseList = courseRows.map((c) => ({
      id: c.id,
      title: c.title,
      slug: slugifySegment(c.title),
    }));

    return NextResponse.json({ success: true, users, courses: courseList });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load meet users" }, { status: 500 });
  }
}
