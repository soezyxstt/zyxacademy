import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isEnrolled } from "@/lib/course-utils";
import {
  formativeCheckLocatorSchema,
  resolvePublishedFormativeCheck,
} from "@/lib/materials/formative-check-server";
import type { FormativeCheckPayload } from "@/lib/materials/pedagogy-contract";

export const dynamic = "force-dynamic";

function resolutionError(code: string): { status: number; error: string } {
  switch (code) {
    case "ARTICLE_NOT_FOUND":
      return { status: 404, error: "Materi artikel tidak ditemukan." };
    case "VERSION_MISMATCH":
      return { status: 409, error: "Versi materi sudah berubah. Muat ulang artikel sebelum mencoba lagi." };
    case "SECTION_NOT_FOUND":
      return { status: 404, error: "Bagian artikel tidak ditemukan." };
    case "BLOCK_NOT_FOUND":
      return { status: 404, error: "Cek pemahaman tidak ditemukan." };
    case "BLOCK_NOT_FORMATIVE":
      return { status: 422, error: "Blok artikel ini bukan cek pemahaman." };
    case "PAYLOAD_INVALID":
      return { status: 422, error: "Konfigurasi cek pemahaman tidak tersedia." };
    default:
      return { status: 500, error: "Pembahasan tidak dapat dibuka." };
  }
}

function answerForReveal(formativeCheck: FormativeCheckPayload): string {
  if (formativeCheck.checkKind !== "multiple_choice") return formativeCheck.answer;

  const correctIndex = formativeCheck.options?.findIndex((option) => option.isCorrect) ?? -1;
  const correctOption = correctIndex >= 0 ? formativeCheck.options?.[correctIndex] : undefined;
  if (!correctOption) return formativeCheck.answer;

  const label = correctIndex < 26 ? String.fromCharCode(65 + correctIndex) : String(correctIndex + 1);
  return `${label}. ${correctOption.text}`;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sesi masuk diperlukan." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const parsed = formativeCheckLocatorSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Lokasi cek pemahaman tidak valid." }, { status: 400 });

  try {
    const resolved = await resolvePublishedFormativeCheck(parsed.data);
    if (!resolved.ok) {
      const failure = resolutionError(resolved.code);
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    if (session.user.role !== "admin" && !(await isEnrolled(session.user.id, resolved.context.article.courseId))) {
      return NextResponse.json({ error: "Anda belum terdaftar pada mata kuliah ini." }, { status: 403 });
    }

    return NextResponse.json({
      answer: answerForReveal(resolved.context.formativeCheck),
      explanation: resolved.context.formativeCheck.explanation,
    });
  } catch (error) {
    console.error(
      "POST /api/materials/formative-check/reveal failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Pembahasan tidak dapat dibuka sekarang." }, { status: 500 });
  }
}
