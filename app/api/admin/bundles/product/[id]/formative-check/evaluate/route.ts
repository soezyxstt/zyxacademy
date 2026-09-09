import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  evaluateChoiceResponse,
  evaluateNumericResponse,
  evaluateTextExactResponse,
} from "@/lib/materials/formative-evaluation";
import { evaluateConceptualResponse } from "@/lib/materials/formative-ai-evaluator";
import type {
  FormativeAiEvaluationResult,
  FormativeAiOutput,
} from "@/lib/materials/formative-ai-evaluator";
import type { FormativeEvaluationResult } from "@/lib/materials/formative-evaluation";
import {
  formativeCheckEvaluationRequestSchema,
  responseKindForCheckKind,
} from "@/lib/materials/formative-check-server";
import { resolveDraftProductFormativeCheck } from "@/lib/materials/formative-check-draft-server";

export const dynamic = "force-dynamic";

function resolutionError(code: string): { status: number; error: string } {
  switch (code) {
    case "BUNDLE_NOT_FOUND":
      return { status: 404, error: "Draft Product Bundle tidak ditemukan." };
    case "DRAFT_REQUIRED":
      return { status: 409, error: "Pratinjau interaktif hanya tersedia untuk draft Product Bundle." };
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
      return { status: 500, error: "Cek pemahaman draft tidak dapat diproses." };
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

  const parsed = formativeCheckEvaluationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Respons cek pemahaman tidak valid." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const resolved = await resolveDraftProductFormativeCheck(id, parsed.data);
    if (!resolved.ok) {
      const failure = resolutionError(resolved.code);
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    const { formativeCheck, block, section } = resolved.context;
    const expectedKind = responseKindForCheckKind(formativeCheck.checkKind);
    if (parsed.data.response.kind !== expectedKind) {
      return NextResponse.json(
        { error: "Jenis respons tidak sesuai dengan cek pemahaman." },
        { status: 422 },
      );
    }

    const evaluationConfig = formativeCheck.evaluation;
    if (!evaluationConfig) {
      return NextResponse.json(
        { error: "Cek pemahaman ini hanya menyediakan pembahasan." },
        { status: 422 },
      );
    }

    let evaluation: FormativeEvaluationResult | FormativeAiEvaluationResult;
    switch (evaluationConfig.mode) {
      case "choice":
        evaluation = evaluateChoiceResponse(parsed.data.response, formativeCheck.options ?? []);
        break;
      case "text_exact":
        evaluation = evaluateTextExactResponse(parsed.data.response, evaluationConfig);
        break;
      case "numeric":
        evaluation = evaluateNumericResponse(parsed.data.response, evaluationConfig);
        break;
      case "ai_rubric":
        if (parsed.data.response.kind !== "conceptual") {
          return NextResponse.json(
            { error: "Jenis respons tidak sesuai dengan cek pemahaman." },
            { status: 422 },
          );
        }
        evaluation = await evaluateConceptualResponse(session.user.id, {
          question: block.content,
          canonicalAnswer: formativeCheck.answer,
          rubric: evaluationConfig,
          studentResponse: parsed.data.response.text,
          learningObjective: section.learningObjective,
          sectionTitle: section.title,
        });
        break;
      default:
        return NextResponse.json({ error: "Mode evaluasi tidak didukung." }, { status: 422 });
    }

    const response: {
      verdict: typeof evaluation.verdict;
      feedback: string;
      criteria?: FormativeAiOutput["criteria"];
      misconceptions?: string[];
      canRetry: boolean;
      revealAllowed: true;
    } = {
      verdict: evaluation.verdict,
      feedback: evaluation.feedback,
      canRetry: formativeCheck.feedbackPolicy?.allowRetry ?? true,
      revealAllowed: true,
    };

    if ("criteria" in evaluation && evaluation.criteria) {
      response.criteria = evaluation.criteria;
    }
    if (
      "misconceptionIds" in evaluation
      && evaluation.misconceptionIds
      && evaluationConfig.mode === "ai_rubric"
    ) {
      response.misconceptions = evaluation.misconceptionIds
        .map((misconceptionId) => evaluationConfig.misconceptionSignals[Number(misconceptionId)])
        .filter((value): value is string => Boolean(value));
    }

    return NextResponse.json({ ok: true, result: response });
  } catch (error) {
    console.error(
      "POST admin Product Bundle draft formative evaluation failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json(
      { error: "Cek pemahaman draft tidak dapat diproses sekarang." },
      { status: 500 },
    );
  }
}
