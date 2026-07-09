import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "@/db";
import { aiQuestionBank } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const RequestSchema = z.object({
  courseId: z.string().min(1),
  rawMarkdown: z.string().min(1),
});

interface ExtractedQuestion {
  prompt: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  options: string[];
  correctIndices: number[];
  explanation: string;
}

export function parseQuestionsMarkdown(markdown: string): ExtractedQuestion[] {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  const lines = normalized.split("\n");
  
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("## ")) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock);
      }
      currentBlock = [line];
    } else {
      currentBlock.push(line);
    }
  }
  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  const questions: ExtractedQuestion[] = [];

  for (const blockLines of blocks) {
    const heading = blockLines[0]?.trim() || "";
    if (!/^##\s+(soal|question|pertanyaan|\d+)/i.test(heading)) {
      continue;
    }

    let promptLines: string[] = [];
    let options: string[] = [];
    let correctIndices: number[] = [];
    let difficulty: "easy" | "medium" | "hard" = "medium";
    let tags: string[] = [];
    let explanationLines: string[] = [];
    let parsingExplanation = false;

    for (let i = 1; i < blockLines.length; i++) {
      const line = blockLines[i];
      const trimmed = line.trim();

      // Check for tags
      if (/^\*\*tags?:\*\*/i.test(trimmed)) {
        const content = trimmed.replace(/^\*\*tags?:\*\*/i, "").trim();
        tags = content.split(",").map(t => t.trim()).filter(Boolean);
        continue;
      }

      // Check for difficulty (supports Indonesian translations)
      if (/^\*\*kesulitan:\*\*/i.test(trimmed)) {
        const content = trimmed.replace(/^\*\*kesulitan:\*\*/i, "").trim().toLowerCase();
        if (content === "easy" || content === "mudah") {
          difficulty = "easy";
        } else if (content === "medium" || content === "sedang" || content === "normal") {
          difficulty = "medium";
        } else if (content === "hard" || content === "sulit" || content === "susah") {
          difficulty = "hard";
        }
        continue;
      }

      // Check for correct answer (letters A-E, single or multiple comma-separated)
      if (/^\*\*(jawaban|kunci|kunci jawaban):\*\*/i.test(trimmed)) {
        const content = trimmed.replace(/^\*\*(jawaban|kunci|kunci jawaban):\*\*/i, "").trim().toUpperCase();
        const letters = content.match(/[A-E]/g) || [];
        correctIndices = letters.map(letter => letter.charCodeAt(0) - 65);
        continue;
      }

      // Check for explanation start
      if (/^\*\*(pembahasan|solusi):\*\*/i.test(trimmed)) {
        parsingExplanation = true;
        const firstLine = trimmed.replace(/^\*\*(pembahasan|solusi):\*\*/i, "").trim();
        if (firstLine) {
          explanationLines.push(firstLine);
        }
        continue;
      }

      // Check for options (e.g. A. or B. or A) or B))
      const optionMatch = trimmed.match(/^([A-E])[\.\)]\s+(.*)/i);
      if (optionMatch) {
        if (!parsingExplanation) {
          const letter = optionMatch[1].toUpperCase();
          const optionText = optionMatch[2].trim();
          const idx = letter.charCodeAt(0) - 65;
          options[idx] = optionText;
          continue;
        }
      }

      // Collect prompt or explanation lines
      if (parsingExplanation) {
        explanationLines.push(line);
      } else {
        promptLines.push(line);
      }
    }

    // Filter out undefined and trim options
    const cleanedOptions: string[] = [];
    for (let i = 0; i < 5; i++) {
      if (options[i] !== undefined && options[i].trim() !== "") {
        cleanedOptions.push(options[i]);
      }
    }

    const prompt = promptLines.join("\n").trim();
    const explanation = explanationLines.join("\n").trim();

    questions.push({
      prompt,
      difficulty,
      tags,
      options: cleanedOptions,
      correctIndices,
      explanation,
    });
  }

  return questions;
}

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

  const parsedQuestions = parseQuestionsMarkdown(rawMarkdown);

  if (parsedQuestions.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada soal yang berhasil diurai. Pastikan format penulisan benar dengan pemisah '## Soal [Nomor]'." },
      { status: 400 }
    );
  }

  // Syntax and content validation
  for (let i = 0; i < parsedQuestions.length; i++) {
    const q = parsedQuestions[i];
    const questionIndex = i + 1;
    if (!q.prompt.trim()) {
      return NextResponse.json(
        { error: `Soal nomor ${questionIndex} tidak memiliki teks pertanyaan (prompt) yang valid.` },
        { status: 400 }
      );
    }
    if (q.options.length < 2) {
      return NextResponse.json(
        { error: `Soal nomor ${questionIndex} minimal harus memiliki 2 pilihan jawaban (A. ..., B. ...).` },
        { status: 400 }
      );
    }
    if (q.correctIndices.length === 0) {
      return NextResponse.json(
        { error: `Soal nomor ${questionIndex} tidak memiliki kunci jawaban yang valid. Gunakan format '**Jawaban:** A' atau '**Jawaban:** B'.` },
        { status: 400 }
      );
    }
    for (const idx of q.correctIndices) {
      if (idx < 0 || idx >= q.options.length) {
        return NextResponse.json(
          { error: `Soal nomor ${questionIndex} memiliki kunci jawaban yang di luar rentang pilihan yang disediakan.` },
          { status: 400 }
        );
      }
    }
  }

  // Database transaction insertion
  const createdIds: string[] = [];
  try {
    await db.transaction(async (tx) => {
      for (const q of parsedQuestions) {
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
    console.error("[Deterministic Bulk Ingest] Database transaction failed:", err);
    return NextResponse.json({ error: "Gagal menyimpan soal ke database." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: createdIds.length,
    message: `${createdIds.length} soal berhasil diimpor ke bank soal secara utuh.`,
  });
}
