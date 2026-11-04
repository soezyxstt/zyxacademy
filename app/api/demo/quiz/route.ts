import { NextResponse } from "next/server";
import {
  getDemoQuizSet,
  gradeDemoAnswers,
  verifyDemoQuestionSetToken,
} from "@/app/(marketing)/demo/demo-data";

export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function sameQuestionOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return response({ error: "Format jawaban tidak valid." }, 400);
  }

  const rawAnswers =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { answers?: unknown }).answers
      : undefined;
  const rawQuestionIds =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { questionIds?: unknown }).questionIds
      : undefined;
  const questionSetToken =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as { questionSetToken?: unknown }).questionSetToken
      : undefined;

  const courseId = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { courseId?: unknown }).courseId : undefined;
  if (typeof courseId !== "string" || !courseId.trim() || courseId !== courseId.trim() || courseId.length > 128) {
    return response({ error: "Mata kuliah demo tidak valid." }, 400);
  }

  const rawOffset = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as { quizOffset?: unknown }).quizOffset : undefined;
  const quizOffset = rawOffset === undefined ? 0 : rawOffset;
  if (typeof quizOffset !== "number" || !Number.isSafeInteger(quizOffset) || quizOffset < 0 || quizOffset % 3 !== 0) return response({ error: "Halaman kuis tidak valid." }, 400);
  if (!Array.isArray(rawAnswers) || rawAnswers.length < 1 || rawAnswers.length > 3) {
    return response({ error: "Jumlah jawaban tidak valid." }, 400);
  }

  if (!Array.isArray(rawQuestionIds) || rawQuestionIds.length !== rawAnswers.length
    || rawQuestionIds.some((id) => typeof id !== "string" || !id.trim())
    || new Set(rawQuestionIds).size !== rawQuestionIds.length) {
    return response({ error: "Daftar soal kuis demo tidak valid." }, 400);
  }
  const questionIds = rawQuestionIds.map((id) => (id as string).trim());

  const answers = rawAnswers.map((answer) => {
    if (Array.isArray(answer)) {
      return [...new Set(answer.filter(isInteger))];
    }
    return isInteger(answer) ? [answer] : [];
  });

  if (answers.some((answer) => answer.some((value) => value < 0 || value > 20))) {
    return response({ error: "Pilihan jawaban tidak valid." }, 400);
  }

  const quizSet = await getDemoQuizSet(courseId, quizOffset);
  if (!quizSet) {
    return response({ error: "Kuis demo belum tersedia." }, 404);
  }

  if (rawAnswers.length !== quizSet.questions.length) return response({ error: "Jumlah jawaban tidak valid." }, 400);

  const expectedQuestionIds = quizSet.questions.map((question) => question.id);
  const expectedQuestionVersions = quizSet.questions.map((question) => question.version);
  if (!verifyDemoQuestionSetToken(questionSetToken, {
    courseId: quizSet.courseId,
    contentPolicy: quizSet.contentPolicy,
    contentRevision: quizSet.contentRevision,
    questionIds: expectedQuestionIds,
    questionVersions: expectedQuestionVersions,
  }) || !sameQuestionOrder(questionIds, expectedQuestionIds)) {
    return response({ error: "Sesi kuis demo sudah tidak valid. Muat ulang halaman." }, 409);
  }

  const result = gradeDemoAnswers(quizSet.questions, answers);
  return response({
    score: result.score,
    total: result.total,
    results: result.results.map(({ index, isCorrect, explanation }) => ({
      index,
      isCorrect,
      explanation,
    })),
  });
}

export async function GET() {
  return response({ error: "Metode tidak tersedia." }, 405);
}
