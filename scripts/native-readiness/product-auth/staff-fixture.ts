import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { customForms, mataKuliah, pengguna, penggunaPeran, penugasanTutor, peran, user } from "@/db/schema";
import { membershipIdFor, peranIdFor, PERAN_SEEDS } from "@/lib/auth/peran";
import { assertFixtureRunner } from "./scope";
import { staffRoles, type StaffRole } from "./staff-role";

export async function seedStaffRole(accountId: string, role: StaffRole) {
  assertFixtureRunner();
  const { recordId, recordTitle } = staffRoles[role];
  await db.transaction(async tx => {
    // Better Auth's signup hook provisions the default Murid role. Replace it
    // for this runner-only generated user, leaving no additional memberships.
    await tx.update(user).set({ role: role === "tutor" ? "teacher" : "admin" }).where(eq(user.id, accountId));
    await tx.insert(peran).values([...PERAN_SEEDS]).onConflictDoNothing();
    await tx.insert(pengguna).values({ id: accountId, status: "active" }).onConflictDoNothing();
    await tx.delete(penggunaPeran).where(eq(penggunaPeran.penggunaId, accountId));
    await tx.insert(penggunaPeran).values({
      id: membershipIdFor(accountId, role), penggunaId: accountId, peranId: peranIdFor(role), source: "native_preview",
    });

    if (role === "tutor") {
      await tx.insert(mataKuliah).values({ id: recordId, code: "PREVIEW-TUTOR", title: recordTitle }).onConflictDoNothing();
      await tx.insert(penugasanTutor).values({
        id: `${recordId}-${accountId}`, penggunaId: accountId, mataKuliahId: recordId,
      }).onConflictDoNothing();
    } else {
      await tx.insert(customForms).values({
        id: recordId, slug: recordId, title: recordTitle, questions: [], createdById: accountId,
        settings: { acceptingResponses: false },
      }).onConflictDoNothing();
    }
  });
}

export async function loadStaffReads() {
  assertFixtureRunner();
  const [{ GET: academic }, { GET: forms }] = await Promise.all([
    import("@/app/api/native/academic/[...resource]/route"),
    import("@/app/api/admin/custom-forms/route"),
  ]);
  return {
    tutor: (request: NextRequest) => academic(request, { params: Promise.resolve({ resource: ["tutor", "dashboard"] }) }),
    admin: () => forms(),
  };
}
