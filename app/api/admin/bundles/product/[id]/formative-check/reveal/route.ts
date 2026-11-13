import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { formativeCheckLocatorSchema } from "@/lib/materials/formative-check-server";
import { resolveDraftProductFormativeCheck } from "@/lib/materials/formative-check-draft-server";
import type { FormativeCheckPayload } from "@/lib/materials/pedagogy-contract";

export const dynamic = "force-dynamic";

function resolutionError(code: string): { status: number; error: string } {
  switch (code) {
    case "BUNDLE_NOT_FOUND":
      return { status: 404, error: "Draft Product Bundle tidak ditemukan." };
    case "DRAFT_REQUIRED":
      return { status: 409, error: "Pratinjau pembahasan hanya tersedia untuk draft Product Bundle." };
    case "ARTICLE_NOT_FOUND":
      return { status: 404, error: "Draft artikel tidak ditemukan." };
    case "VERSION_MISMATCH":
      return { status: 409, error: "Versi draft artikel sudah berubah. Muat ulang halaman review." };
    case "SECTION_NOT_FOUND":
      return { status: 404, error: "Bagian draft artikel tidak ditemukan." };
    case "BLOCK_NOT_FOUND":
      return { status: 404, error: "Cek pemahaman draft tidak ditemukan." };
    case "BLOCK_NOT_FORMATIVE":
      return { status: 422, error: "Blok draft ini bukan cek pemahaman." };
    case "PAYLOAD_INVALID":
      return { status: 422, error: "Konfigurasi cek pemahaman draft tidak valid." };
    default:
      return { status: 500, error: "Pembahasan draft tidak dapat dibuka." };
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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await hasAuthoringActor(session.user.id, ["admin"]))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const parsed = formativeCheckLocatorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lokasi cek pemahaman tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const resolved = await resolveDraftProductFormativeCheck(id, parsed.data);
    if (!resolved.ok) {
      const failure = resolutionError(resolved.code);
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    return NextResponse.json({
      answer: answerForReveal(resolved.context.formativeCheck),
      explanation: resolved.context.formativeCheck.explanation,
    });
  } catch (error) {
    console.error(
      "POST admin Product Bundle draft formative reveal failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Pembahasan draft tidak dapat dibuka sekarang." },
      { status: 500 },
    );
  }
}
