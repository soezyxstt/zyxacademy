"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ITB_FACULTIES, getMajorsForFaculty } from "@/lib/student/itb-academic-data";

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

    if (!ITB_FACULTIES.some((item) => item.code === faculty)) {
      return {
        success: false,
        message: "Pilih fakultas atau sekolah ITB Anda.",
        errorCode: "facultyRequired",
        submittedAt: Date.now(),
      };
    }

    if (!getMajorsForFaculty(faculty).includes(major)) {
      return {
        success: false,
        message: "Pilih jurusan atau program studi Anda.",
        errorCode: "majorRequired",
        submittedAt: Date.now(),
      };
    }

    const entryYear = Number.parseInt(entryYearStr, 10);
    const currentYear = new Date().getFullYear();
    if (Number.isNaN(entryYear) || entryYear < 2000 || entryYear > currentYear + 1) {
      return {
        success: false,
        message: "Pilih tahun masuk ITB yang valid.",
        errorCode: "entryYearInvalid",
        submittedAt: Date.now(),
      };
    }

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
