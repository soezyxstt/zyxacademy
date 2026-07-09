import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { aiQuestionBank } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { repairJsonString } from "@/lib/ko-utils";

const RequestSchema = z.object({
  courseId: z.string().min(1),
  rawMarkdown: z.string().min(1),
});

const ExtractedQuestionSchema = z.object({
  prompt: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"]),
  tags: z.array(z.string()).default([]),
  options: z.array(z.string()).min(2),
  correctIndices: z.array(z.number().int().min(0)),
  explanation: z.string().default(""),
});

const ExtractedListSchema = z.object({
  questions: z.array(ExtractedQuestionSchema),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user.role !== "admin" && session.user.role !== "teacher")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { courseId, rawMarkdown } = parsed.data;

  let extractedQuestions: z.infer<typeof ExtractedListSchema>["questions"] = [];

  const isMock = process.env.MOCK_GEMINI === "true";
  if (isMock) {
    // Generate dummy questions for mock mode
    extractedQuestions = [
      {
        prompt: "Diberikan matriks $A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$. Tentukan determinan dari matriks $A$.",
        difficulty: "easy",
        tags: ["matriks", "determinan"],
        options: ["-2", "2", "-10", "10", "0"],
        correctIndices: [0],
        explanation: "Determinan dari matriks $A$ adalah $(1)(4) - (2)(3) = 4 - 6 = -2$.",
      },
      {
        prompt: "Sebuah partikel bergerak dengan persamaan posisi $s(t) = 2t^3 - 5t^2 + 3t$. Tentukan kecepatan partikel pada saat $t = 2$ sekon.",
        difficulty: "medium",
        tags: ["turunan", "kecepatan"],
        options: ["7 m/s", "11 m/s", "15 m/s", "19 m/s", "23 m/s"],
        correctIndices: [1],
        explanation: "Kecepatan adalah turunan pertama posisi terhadap waktu: $v(t) = s'(t) = 6t^2 - 10t + 3$. Pada $t = 2$, $v(2) = 6(2)^2 - 10(2) + 3 = 24 - 20 + 3 = 7$ m/s. Pilihan A benar.",
      },
    ];
  } else {
    const prompt = `Analyze the following markdown text containing multiple test questions. Extract all questions and return a JSON object with a single "questions" key containing a list of parsed questions matching the schema.

MARKDOWN CONTENT:
"""
${rawMarkdown}
"""

You must return a single JSON object matching this schema:
{
  "questions": [
    {
      "prompt": "Pertanyaan lengkap soal (mendukung markdown dan LaTeX seperti $x^2$ atau $\\frac{a}{b}$)",
      "difficulty": "easy | medium | hard",
      "tags": ["nama_tag1", "nama_tag2"],
      "options": ["Opsi A", "Opsi B", "Opsi C", "Opsi D", "Opsi E"],
      "correctIndices": [indeks 0-based opsi yang benar, misal [2] jika opsi C benar],
      "explanation": "Penjelasan solusi pengerjaan soal dalam format markdown"
    }
  ]
}

Ensure all questions from the text are parsed. For options, make sure to extract all options present in the markdown. For correctIndices, extract the correct option index (e.g. A=0, B=1, C=2, D=3, E=4).
Return only valid JSON. Do not wrap in markdown code blocks.`;

    try {
      const { response } = await generateContentWithFallback({
        useCase: USE_CASES.KO_EXTRACTION,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const rawText = response.text || "{}";
      const cleanJson = repairJsonString(rawText);
      const parsedData = JSON.parse(cleanJson);
      const validated = ExtractedListSchema.parse(parsedData);
      extractedQuestions = validated.questions;
    } catch (err: any) {
      console.error("[Bulk Ingest] Failed to parse questions using LLM:", err);
      return NextResponse.json(
        { error: "Gagal mengekstrak soal dari Markdown. Pastikan format penulisan benar." },
        { status: 500 }
      );
    }
  }

  if (extractedQuestions.length === 0) {
    return NextResponse.json({ error: "Tidak ada soal yang terdeteksi di dalam file." }, { status: 400 });
  }

  // Insert parsed questions into the database
  const createdIds: string[] = [];
  try {
    await db.transaction(async (tx) => {
      for (const q of extractedQuestions) {
        const id = `q-bulk-${randomUUID()}`;
        await tx.insert(aiQuestionBank).values({
          id,
          courseId,
          difficulty: q.difficulty,
          questionType: "multiple_choice",
          tags: q.tags as unknown as Record<string, unknown>,
          prompt: q.prompt,
          options: q.options as unknown as Record<string, unknown>,
          correctIndices: q.correctIndices as unknown as Record<string, unknown>,
          explanation: q.explanation,
          status: "active",
          reviewStatus: "published",
        });
        createdIds.push(id);
      }
    });
  } catch (err: any) {
    console.error("[Bulk Ingest] Database transaction failed:", err);
    return NextResponse.json({ error: "Gagal menyimpan soal ke database." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: createdIds.length,
    message: `${createdIds.length} soal berhasil diimpor ke bank soal.`,
  });
}
