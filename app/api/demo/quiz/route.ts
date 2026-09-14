import { NextResponse } from "next/server";
import { getDemoQuizAnswers, gradeDemoAnswers } from "@/app/(marketing)/demo/demo-data";

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

  if (!Array.isArray(rawAnswers) || rawAnswers.length !== 3) {
    return response({ error: "Kuis demo membutuhkan tiga jawaban." }, 400);
  }

  const answers = rawAnswers.map((answer) => {
    if (Array.isArray(answer)) {
      return [...new Set(answer.filter(isInteger))];
    }
    return isInteger(answer) ? [answer] : [];
  });

  if (answers.some((answer) => answer.some((value) => value < 0 || value > 20))) {
    return response({ error: "Pilihan jawaban tidak valid." }, 400);
  }

  const questions = await getDemoQuizAnswers();
  if (!questions) {
    return response({ error: "Kuis demo belum tersedia." }, 404);
  }

  const result = gradeDemoAnswers(questions, answers);
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
