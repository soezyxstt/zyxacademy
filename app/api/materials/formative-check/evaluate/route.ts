import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessCourseContent, resolveCourseAccess } from "@/lib/student/course-access";
import {
  evaluateChoiceResponse,
  evaluateNumericResponse,
  evaluateTextExactResponse,
} from "@/lib/materials/formative-evaluation";
import { evaluateConceptualResponse } from "@/lib/materials/formative-ai-evaluator";
import type { FormativeAiEvaluationResult, FormativeAiOutput } from "@/lib/materials/formative-ai-evaluator";
import type { FormativeEvaluationResult } from "@/lib/materials/formative-evaluation";
import {
  formativeCheckEvaluationRequestSchema,
  resolvePublishedFormativeCheck,
  responseKindForCheckKind,
} from "@/lib/materials/formative-check-server";

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
      return { status: 500, error: "Cek pemahaman tidak dapat diproses." };
  }
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

  const parsed = formativeCheckEvaluationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Respons cek pemahaman tidak valid." }, { status: 400 });

  try {
    const resolved = await resolvePublishedFormativeCheck(parsed.data);
    if (!resolved.ok) {
      const failure = resolutionError(resolved.code);
      return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    const access = await resolveCourseAccess({ courseId: resolved.context.article.courseId, userId: session.user.id });
    if (!canAccessCourseContent(access, "article", [resolved.context.article.chapterId])) {
      return NextResponse.json({ error: "Anda belum terdaftar pada mata kuliah ini." }, { status: 403 });
    }

    const { formativeCheck, block, section } = resolved.context;
    const expectedKind = responseKindForCheckKind(formativeCheck.checkKind);
    if (parsed.data.response.kind !== expectedKind) {
      return NextResponse.json({ error: "Jenis respons tidak sesuai dengan cek pemahaman." }, { status: 422 });
    }

    const evaluationConfig = formativeCheck.evaluation;
    if (!evaluationConfig) {
      return NextResponse.json({ error: "Cek pemahaman ini hanya menyediakan pembahasan." }, { status: 422 });
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
          return NextResponse.json({ error: "Jenis respons tidak sesuai dengan cek pemahaman." }, { status: 422 });
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

    if ("criteria" in evaluation && evaluation.criteria) response.criteria = evaluation.criteria;
    if ("misconceptionIds" in evaluation && evaluation.misconceptionIds && evaluationConfig.mode === "ai_rubric") {
      response.misconceptions = evaluation.misconceptionIds
        .map((id) => evaluationConfig.misconceptionSignals[Number(id)])
        .filter((value): value is string => Boolean(value));
    }

    return NextResponse.json({ ok: true, result: response });
  } catch (error) {
    console.error(
      "POST /api/materials/formative-check/evaluate failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ error: "Cek pemahaman tidak dapat diproses sekarang." }, { status: 500 });
  }
}
