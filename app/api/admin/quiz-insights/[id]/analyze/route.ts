import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { quizTemplates, studentQuizAttempts, courses, quizAiInsights, QuizAiInsightData } from "@/db/schema";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { generateContentWithFallback } from "@/lib/gemini";

type Context = { params: Promise<{ id: string }> };

function safeParseJson<T>(rawText: string): T {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (_firstErr) {
    try {
      // Escape unescaped backslashes (e.g. \alpha, \frac, \theta, \pm) that are not valid JSON escape sequences
      const sanitized = cleaned.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
      return JSON.parse(sanitized) as T;
    } catch (_secondErr) {

      const aggressiveSanitize = cleaned
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
        .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, "\\\\");
      return JSON.parse(aggressiveSanitize) as T;
    }
  }
}

export async function POST(req: NextRequest, { params }: Context) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: templateId } = await params;

  // 1. Fetch Template
  const [template] = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      courseId: quizTemplates.courseId,
      courseName: courses.title,
    })
    .from(quizTemplates)
    .leftJoin(courses, eq(quizTemplates.courseId, courses.id))
    .where(eq(quizTemplates.id, templateId))
    .limit(1);

  if (!template) {
    return NextResponse.json({ error: "Quiz template not found" }, { status: 404 });
  }

  // 2. Fetch completed attempts
  const attempts = await db
    .select({
      score: studentQuizAttempts.score,
      durationSeconds: studentQuizAttempts.durationSeconds,
      questionsSnapshot: studentQuizAttempts.questionsSnapshot,
      answersSnapshot: studentQuizAttempts.answersSnapshot,
    })
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.templateId, templateId));

  const completed = attempts.filter((a) => a.score !== null);
  if (completed.length === 0) {
    return NextResponse.json(
      { error: "Belum ada pengerjaan siswa yang selesai untuk kuis ini. Analisis AI memerlukan minimal 1 hasil pengerjaan." },
      { status: 400 }
    );
  }

  // Calculate statistics for AI context
  const scores = completed.map((a) => Number(a.score || 0));
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / completed.length);
  const passCount = scores.filter((s) => s >= 70).length;
  const passRate = Math.round((passCount / completed.length) * 100);

  // Compile Question Item Breakdown
  const questionMap = new Map<string, {
    id: string;
    prompt: string;
    options: string[];
    correctIndices: number[];
    tags: string[];
    distractorMap?: any[];
    totalAnswered: number;
    correctCount: number;
    optionCounts: Record<number, number>;
  }>();

  for (const att of completed) {
    const questions = (att.questionsSnapshot as any[]) || [];
    const answers = (att.answersSnapshot as Record<string, number[]>) || {};

    for (const q of questions) {
      if (!q.id) continue;
      if (!questionMap.has(q.id)) {
        questionMap.set(q.id, {
          id: q.id,
          prompt: (q.prompt || q.content || "").substring(0, 300),
          options: Array.isArray(q.options) ? q.options.map((o: any) => (typeof o === "string" ? o : o.text || "")) : [],
          correctIndices: Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [],
          tags: Array.isArray(q.tags) ? q.tags : [],
          distractorMap: Array.isArray(q.distractorMap) ? q.distractorMap : [],
          totalAnswered: 0,
          correctCount: 0,
          optionCounts: {},
        });
      }
      const item = questionMap.get(q.id)!;
      const userSelected = answers[q.id] || [];
      item.totalAnswered += 1;

      const isCorrect =
        userSelected.length === item.correctIndices.length &&
        userSelected.every((idx) => item.correctIndices.includes(idx));
      if (isCorrect) item.correctCount += 1;

      for (const sel of userSelected) {
        item.optionCounts[sel] = (item.optionCounts[sel] || 0) + 1;
      }
    }
  }

  const questionSummaries = Array.from(questionMap.values()).map((q, idx) => {
    const accuracy = q.totalAnswered > 0 ? Math.round((q.correctCount / q.totalAnswered) * 100) : 0;
    const optionDist = q.options.map((optText, oIdx) => {
      const count = q.optionCounts[oIdx] || 0;
      const pct = q.totalAnswered > 0 ? Math.round((count / q.totalAnswered) * 100) : 0;
      const isCorrect = q.correctIndices.includes(oIdx);
      return `Pilihan ${String.fromCharCode(65 + oIdx)} (${isCorrect ? 'BENAR' : 'SALAH'}): ${pct}% (${count}/${q.totalAnswered} siswa) -> "${optText.substring(0, 80)}"`;
    }).join("\n    ");

    return `Soal #${idx + 1} (ID: ${q.id}) [Tingkat Akurasi: ${accuracy}%]
  Teks Soal: "${q.prompt}"
  Topik/Tag: ${q.tags.join(", ") || "Tanpa tag"}
  Distribusi Jawaban Siswa:
    ${optionDist}`;
  });

  // Construct System & User Prompt for Gemini AI
  const prompt = `Anda adalah pakar pedagogi & analitik asesmen pendidikan tinggi senior di Zyx Academy.
Tugas Anda adalah melakukan analisis mendalam mengenai hasil pengerjaan kuis/simulasi oleh para siswa untuk memberikan insight komprehensif bagi Pengajar, Tutor, dan Admin.

INFORMASI KUIS / EXAM:
- Judul: "${template.title}"
- Mata Kuliah: "${template.courseName || template.courseId}"
- Kategori: ${template.category}
- Jumlah Pengerjaan Selesai: ${completed.length} siswa
- Rata-rata Nilai: ${avgScore}/100
- Tingkat Kelulusan (Skor >= 70): ${passRate}%

RINGKASAN DATA BUTIR SOAL & PILIHAN JAWABAN SISWA:
${questionSummaries.join("\n\n")}

PETUNJUK OUTPUT:
1. Berikan analisis mendalam dalam format JSON yang VALID dan terstruktur rapi dengan kunci-kunci berikut (seluruh teks menggunakan Bahasa Indonesia formal dan profesional).
2. PENTING: Gunakan JSON yang murni tanpa adanya unescaped control characters atau unescaped backslashes.

\`\`\`json
{
  "summaryOverview": "Ringkasan eksekutif menyeluruh tentang tingkat pemahaman siswa, tren nilai, dan poin utama hasil pengerjaan kuis ini.",
  "misconceptions": [
    {
      "concept": "Nama Konsep / Miskonsepsi",
      "description": "Penjelasan detail mengapa siswa bingung dan kesalahan logika apa yang terjadi.",
      "frequency": "high",
      "targetedQuestions": ["ID_SOAL_1"]
    }
  ],
  "teachingRecommendations": [
    {
      "topic": "Topik Materi",
      "actionItem": "Langkah pengajaran konkret yang harus dilakukan tutor dalam sesi live / pengayaan.",
      "rationale": "Alasan pedagogis dibalik rekomendasi tersebut berdasarkan data distraktor."
    }
  ],
  "hardestQuestionsAnalysis": [
    {
      "questionId": "ID_SOAL",
      "promptSnippet": "Potongan teks soal",
      "accuracyRate": 25,
      "diagnosis": "Mengapa soal ini sangat sulit bagi siswa.",
      "distractorTrap": "Pilihan distraktor mana yang paling menjebak siswa dan alasannya."
    }
  ],
  "easiestQuestionsAnalysis": [
    {
      "questionId": "ID_SOAL",
      "promptSnippet": "Potongan teks soal",
      "accuracyRate": 90,
      "reason": "Alasan mengapa soal ini berhasil dikuasai dengan baik oleh mayoritas siswa."
    }
  ],
  "actionableNextSteps": [
    "Poin tindakan konkret 1 bagi admin/tutor",
    "Poin tindakan konkret 2",
    "Poin tindakan konkret 3"
  ]
}
\`\`\`

Pastikan balasan Anda HANYA berupa objek JSON yang valid.`;

  try {
    const { response } = await generateContentWithFallback({
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
      useCase: "tutoring",
    });

    const rawText = response.text || "";
    const parsedInsights: QuizAiInsightData = safeParseJson<QuizAiInsightData>(rawText);

    // Save/Upsert into DB
    const insightId = `qai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.insert(quizAiInsights).values({
      id: insightId,
      templateId,
      sampleSize: completed.length,
      insights: parsedInsights,
      summary: parsedInsights.summaryOverview || "",
      generatedById: session.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      insight: {
        id: insightId,
        templateId,
        sampleSize: completed.length,
        insights: parsedInsights,
        summary: parsedInsights.summaryOverview,
        createdAt: new Date(),
      },
    });
  } catch (err: any) {
    console.error("Failed to generate AI quiz insights:", err);
    return NextResponse.json(
      { error: `Gagal menghasilkan analisis AI: ${err?.message || "Terjadi kesalahan pada layanan AI"}` },
      { status: 500 }
    );
  }
}

