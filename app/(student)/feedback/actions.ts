"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { nanoid } from "nanoid";

export type StudentFeedbackInput = {
  category: "materi" | "kuis" | "tutor" | "fitur" | "lainnya";
  rating: number;
  message: string;
  email?: string;
};

export type StudentFeedbackResponse = {
  success: boolean;
  message: string;
};

export async function submitStudentFeedbackAction(
  data: StudentFeedbackInput
): Promise<StudentFeedbackResponse> {
  let session = null;
  try {
    const h = await headers();
    session = await auth.api.getSession({ headers: h });
  } catch {
    // Headers unavailable outside Next.js request store (e.g. in test script)
  }
  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? data.email ?? null;

  const message = data.message?.trim();
  if (!message || message.length < 5) {
    return {
      success: false,
      message: "Mohon tuliskan pesan masukan minimal 5 karakter.",
    };
  }

  const rating = Math.min(5, Math.max(1, Number(data.rating) || 5));
  const category = data.category || "lainnya";

  try {
    const feedbackId = `fb-${nanoid(12)}`;

    await db.insert(auditMutasi).values({
      id: `audit-${nanoid(16)}`,
      actorId: userId,
      entityType: "student_feedback",
      entityId: feedbackId,
      action: "submit",
      outcome: "success",
      reason: `Masukan mahasiswa kategori ${category} (Rating: ${rating}/5)`,
      afterSnapshot: {
        feedbackId,
        category,
        rating,
        message,
        email: userEmail,
        submittedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      message: "Masukan Anda telah berhasil dikirim. Terima kasih atas kontribusi Anda.",
    };
  } catch (error) {
    console.error("Gagal menyimpan masukan mahasiswa:", error);
    return {
      success: false,
      message: "Terjadi kendala saat mengirim masukan. Silakan coba lagi.",
    };
  }
}
