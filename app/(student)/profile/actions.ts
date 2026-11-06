"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateAcademicProfile } from "@/lib/student/academic-profile";

export interface StudentProfileActionState {
  success: boolean;
  message: string;
  errorCode?: "sessionExpired" | "facultyRequired" | "majorRequired" | "entryYearInvalid" | "saveFailed";
  submittedAt: number;
}

/**
 * Updates the academic profile fields (faculty, major, entryYear) of the authenticated student.
 * Validates selections against canonical ITB academic data before persisting to the database.
 */
export async function updateStudentProfileAction(
  _previousState: StudentProfileActionState,
  formData: FormData,
): Promise<StudentProfileActionState> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return {
        success: false,
        message: "Sesi telah berakhir. Silakan masuk kembali.",
        errorCode: "sessionExpired",
        submittedAt: Date.now(),
      };
    }

    const faculty = (formData.get("faculty") as string | null)?.trim() ?? "";
    const major = (formData.get("major") as string | null)?.trim() ?? "";
    const entryYearStr = (formData.get("entryYear") as string | null)?.trim() ?? "";

    const validated = validateAcademicProfile({ faculty, major, entryYear: entryYearStr });
    if (validated.errorCode) return { success: false, message: "Periksa profil akademis.", errorCode: validated.errorCode, submittedAt: Date.now() };
    const { entryYear } = validated.profile;

    await db
      .update(userTable)
      .set({
        faculty,
        major,
        entryYear,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, session.user.id));

    revalidatePath("/profile");
    revalidatePath("/profile/edit");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Profil akademis berhasil disimpan.",
      submittedAt: Date.now(),
    };
  } catch (error) {
    console.error("[updateStudentProfileAction]", error);
    return {
      success: false,
      message: "Gagal menyimpan profil akademis. Coba lagi beberapa saat lagi.",
      errorCode: "saveFailed",
      submittedAt: Date.now(),
    };
  }
}
