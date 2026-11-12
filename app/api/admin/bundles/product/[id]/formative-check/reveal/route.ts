import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { formativeCheckLocatorSchema } from "@/lib/materials/formative-check-server";
import { resolveDraftProductFormativeCheck } from "@/lib/materials/formative-check-draft-server";
import { formativeAnswerForReveal } from "@/lib/materials/formative-check-answer";
import { interactiveDocumentsInMarkdown } from "@/lib/materials/interactive-document-authorization";
import { mintInteractiveDocumentGrant } from "@/lib/materials/interactive-document-grant";

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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const answer = formativeAnswerForReveal(resolved.context.formativeCheck);
    const explanation = resolved.context.formativeCheck.explanation;
    const hasDocuments = interactiveDocumentsInMarkdown(answer).length || interactiveDocumentsInMarkdown(explanation).length;
    const draft = hasDocuments ? await (await import("@/lib/bundle/product-staging")).getProductBundleImport(id) : null;
    if (hasDocuments && (!draft || draft.status !== "draft")) return NextResponse.json({ error: "Draft tidak tersedia." }, { status: 409 });
    const visualAccess = Object.fromEntries(([ ["answer", answer], ["explanation", explanation] ] as const).flatMap(([field, text]) => interactiveDocumentsInMarkdown(text).length ? [[field, mintInteractiveDocumentGrant({ userId: session.user.id, ...parsed.data, field, draftId: id, draftChecksum: draft!.checksum }, process.env.BETTER_AUTH_SECRET ?? "")]] : []));
    return NextResponse.json({ answer, explanation, visualAccess }, { headers: { "Cache-Control": "private, no-store" } });
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
