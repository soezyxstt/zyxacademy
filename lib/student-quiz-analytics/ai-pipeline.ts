import { db } from "@/db";
import { studentQuizAttempts, aiQuestionBank, knowledgeObjects } from "@/db/schema";
import { generateContentWithFallback } from "@/lib/gemini";
import { USE_CASES } from "@/lib/ai-router";
import { eq, inArray } from "drizzle-orm";
import type { ComputedQuizMetrics, StudentQuizDiagnosis } from "./types";

interface QuestionMicroDiagnosis {
  questionId: string;
  prompt: string;
  selectedOptionText: string;
  correctOptionText: string;
  distractorTrap: string;
  possibleMisconception: string;
  isCorrect: boolean;
}

export async function generateStudentQuizDiagnosis(
  attemptId: string,
  metrics: ComputedQuizMetrics
): Promise<StudentQuizDiagnosis> {
  const [attempt] = await db
    .select()
    .from(studentQuizAttempts)
    .where(eq(studentQuizAttempts.id, attemptId))
    .limit(1);

  if (!attempt) {
    throw new Error(`Attempt ${attemptId} not found`);
  }

  const snapshot = (attempt.questionsSnapshot || []) as Array<{
    id: string;
    prompt: string;
    options: string[];
    correct_indices: number[];
    explanation?: string;
  }>;
  const answers = (attempt.answersSnapshot || {}) as Record<string, number[]>;

  const questionIds = snapshot.map((q) => q.id);
  const bankRows = questionIds.length > 0
    ? await db
        .select({
          id: aiQuestionBank.id,
          conceptName: knowledgeObjects.conceptName,
          explanation: aiQuestionBank.explanation,
        })
        .from(aiQuestionBank)
        .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
        .where(inArray(aiQuestionBank.id, questionIds))
    : [];
  const bankMap = new Map(bankRows.map((r) => [r.id, r]));

  // Tier 1: Micro-analyze student errors
  const questionDiagnoses: QuestionMicroDiagnosis[] = [];
  for (const q of snapshot) {
    const submitted = answers[q.id] || [];
    const isCorrect =
      submitted.length === q.correct_indices.length &&
      submitted.every((val) => q.correct_indices.includes(val));

    const selectedIdx = submitted[0];
    const correctIdx = q.correct_indices[0];
    const selectedOptionText = selectedIdx !== undefined && q.options[selectedIdx] ? q.options[selectedIdx] : "(Tidak dijawab)";
    const correctOptionText = correctIdx !== undefined && q.options[correctIdx] ? q.options[correctIdx] : "(Kunci)";
    const bank = bankMap.get(q.id);

    questionDiagnoses.push({
      questionId: q.id,
      prompt: q.prompt.slice(0, 150),
      selectedOptionText,
      correctOptionText,
      distractorTrap: bank?.explanation || q.explanation || "Analisis pilihan distractor",
      possibleMisconception: isCorrect ? "Konsep dikuasai" : `Terjadi kekeliruan saat memilih '${selectedOptionText}' dibanding '${correctOptionText}'`,
      isCorrect,
    });
  }

  // Tier 2: Synthesize quiz-level diagnosis using Gemini
  const promptPayload = {
    quiz: {
      quiz_id: metrics.templateId,
      course_id: metrics.courseId,
      quiz_title: metrics.quizTitle,
      score: metrics.score,
      correct_count: metrics.correctCount,
      incorrect_count: metrics.incorrectCount,
      unanswered_count: metrics.unansweredCount,
      duration_seconds: metrics.durationSeconds,
    },
    computed_metrics: {
      concept_mastery: metrics.conceptMastery,
      cognitive_skills: metrics.cognitiveSkills,
      difficulty_breakdown: metrics.difficultyBreakdown,
      time_analysis: metrics.timeAnalysis,
      historical_comparison: metrics.historicalComparison,
    },
    micro_diagnoses: questionDiagnoses,
  };

  const systemInstructions = `Anda adalah AI Learning Analytics Assistant untuk Zyx Academy.
Tugas Anda adalah menganalisis hasil kuis siswa berdasarkan data terstruktur yang diberikan dan menghasilkan diagnosis pembelajaran yang akurat, suportif, spesifik, dan dapat ditindaklanjuti.

## PRINSIP PENTING
1. Gunakan HANYA data yang diberikan. Jangan mengarang metrik, statistik, atau persentase baru yang tidak ada pada input.
2. JANGAN mengubah angka persentase atau status numerik dari computed_metrics.
3. Bedakan secara jelas antara fakta yang terlihat dari data dan interpretasi pembelajaran.
4. Gunakan bahasa Indonesia yang suportif, profesional, dan objektif. Hindari kata-kata bernada menghakimi seperti 'ceroboh', 'lemah', 'buruk', atau 'malas'. Gunakan 'belum konsisten' atau 'masih perlu diperkuat'.
5. Maksimal berikan 3 prioritas rencana belajar (study_plan). Setiap langkah harus sangat spesifik dan memiliki indikator keberhasilan.
6. Kategorikan pola kesalahan ke dalam salah satu kategori:
   - conceptual_misunderstanding
   - procedural_error
   - calculation_error
   - question_misinterpretation
   - representation_error
   - prerequisite_gap
   - incomplete_reasoning
   - inconsistent_application
   - insufficient_evidence

## FORMAT OUTPUT (HARUS JSON VALID TANPA MARKDOWN BACKTICKS)
{
  "headline": "Ringkasan utama maksimal 15 kata",
  "overall_summary": "Ringkasan performa dalam 2-4 kalimat",
  "performance_level": "excellent | good | developing | needs_support",
  "strengths": [
    {
      "title": "Nama kekuatan",
      "description": "Penjelasan spesifik",
      "evidence": [{ "question_id": "ID", "observation": "Bukti dari data" }]
    }
  ],
  "focus_areas": [
    {
      "title": "Area yang perlu diperkuat",
      "description": "Diagnosis spesifik",
      "importance": "Mengapa ini penting",
      "evidence": [{ "question_id": "ID", "observation": "Bukti jawaban" }]
    }
  ],
  "concept_diagnostics": [
    {
      "concept": "Nama konsep",
      "status": "strong | adequate | developing | needs_reinforcement | insufficient_evidence",
      "summary": "Diagnosis singkat",
      "evidence": ["Bukti terpenting"],
      "recommended_action": "Tindakan perbaikan"
    }
  ],
  "error_patterns": [
    {
      "category": "conceptual_misunderstanding",
      "title": "Nama pola kesalahan",
      "description": "Penjelasan pola",
      "confidence": "high | medium | low",
      "supporting_questions": ["ID"],
      "correction_strategy": "Cara memperbaiki"
    }
  ],
  "skill_diagnostics": [
    {
      "skill": "Nama kemampuan",
      "status": "strong | adequate | developing | needs_reinforcement | insufficient_evidence",
      "summary": "Penjelasan performa"
    }
  ],
  "time_insights": [
    {
      "observation": "Pola waktu",
      "interpretation": "Interpretasi",
      "suggestion": "Saran konkret"
    }
  ],
  "progress_insights": [
    {
      "concept_or_skill": "Konsep/kemampuan",
      "trend": "improving | stable | inconsistent | declining | insufficient_evidence",
      "description": "Penjelasan perubahan"
    }
  ],
  "study_plan": [
    {
      "priority": 1,
      "focus": "Fokus belajar",
      "reason": "Alasan dari hasil kuis",
      "action": "Aktivitas konkret",
      "success_check": "Indikator keberhasilan",
      "resource_type": "material | ko | flashcard | zyra | quiz",
      "resource_id": "ID opsional"
    }
  ],
  "encouragement": "Satu-dua kalimat suportif spesifik",
  "limitations": ["Hal yang belum dapat disimpulkan karena data"]
}`;

  try {
    const { response } = await generateContentWithFallback({
      contents: [
        { role: "user", parts: [{ text: `${systemInstructions}\n\nDATA INPUT:\n${JSON.stringify(promptPayload, null, 2)}` }] },
      ],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
      useCase: USE_CASES.WEAK_CONCEPT_GUIDANCE,
    });

    const rawText = response.text || "{}";
    const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleanedText) as StudentQuizDiagnosis;

    // Provide default fallbacks if any essential field is missing
    return {
      headline: parsed.headline || `Hasil Kuis: ${metrics.score}% pada ${metrics.quizTitle}`,
      overall_summary: parsed.overall_summary || `Anda menyelesaikan ${metrics.totalQuestions} soal dengan skor ${metrics.score}%.`,
      performance_level: parsed.performance_level || (metrics.score >= 80 ? "excellent" : metrics.score >= 65 ? "good" : "developing"),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
      focus_areas: Array.isArray(parsed.focus_areas) ? parsed.focus_areas.slice(0, 3) : [],
      concept_diagnostics: Array.isArray(parsed.concept_diagnostics) ? parsed.concept_diagnostics : [],
      error_patterns: Array.isArray(parsed.error_patterns) ? parsed.error_patterns.slice(0, 4) : [],
      skill_diagnostics: Array.isArray(parsed.skill_diagnostics) ? parsed.skill_diagnostics : [],
      time_insights: Array.isArray(parsed.time_insights) ? parsed.time_insights : [],
      progress_insights: Array.isArray(parsed.progress_insights) ? parsed.progress_insights : [],
      study_plan: Array.isArray(parsed.study_plan) ? parsed.study_plan.slice(0, 3) : [],
      encouragement: parsed.encouragement || "Tetap semangat belajar! Tingkatkan ketelitian dan konsep pada sesi latihan berikutnya.",
      limitations: Array.isArray(parsed.limitations) ? parsed.limitations : [],
    };
  } catch (err: any) {
    console.error("Failed to generate AI quiz diagnosis:", err);
    // Deterministic fallback if AI call fails
    return buildFallbackDiagnosis(metrics);
  }
}

function buildFallbackDiagnosis(metrics: ComputedQuizMetrics): StudentQuizDiagnosis {
  const weakConcepts = metrics.conceptMastery.filter(
    (c) => c.status === "needs_reinforcement" || c.status === "developing"
  );
  const strongConcepts = metrics.conceptMastery.filter((c) => c.status === "strong" || c.status === "adequate");

  return {
    headline: `Hasil ${metrics.quizTitle}: Skor ${metrics.score}% (${metrics.correctCount}/${metrics.totalQuestions} Benar)`,
    overall_summary: `Anda memperoleh skor ${metrics.score}%. Pemahaman konsep Anda sudah menunjukkan perkembangan pada ${strongConcepts.length} topik, namun masih ada ${weakConcepts.length} topik yang perlu diperkuat.`,
    performance_level: metrics.score >= 80 ? "excellent" : metrics.score >= 65 ? "good" : "developing",
    strengths: strongConcepts.map((c) => ({
      title: `Penguasaan ${c.concept}`,
      description: `Akurasi ${c.accuracyPercent}% pada soal-soal terkait ${c.concept}.`,
      evidence: [{ observation: `Menjawab ${c.correctCount} dari ${c.totalQuestions} soal dengan benar.` }],
    })),
    focus_areas: weakConcepts.map((c) => ({
      title: `Perkuat Konsep ${c.concept}`,
      description: `Akurasi ${c.accuracyPercent}%. Perlu latihan tambahan pada subkonsep pendukung.`,
      importance: "Penting untuk memahami topik multilangkah berikutnya.",
      evidence: [{ observation: `Terjadi ${c.incorrectCount} kesalahan pada soal terkait.` }],
    })),
    concept_diagnostics: metrics.conceptMastery.map((c) => ({
      concept: c.concept,
      status: c.status,
      summary: `Akurasi ${c.accuracyPercent}% dari ${c.totalQuestions} soal.`,
      evidence: [`${c.correctCount} benar, ${c.incorrectCount} salah`],
      recommended_action: c.status === "strong" ? "Pertahankan pemahaman dengan latihan berkala." : "Pelajari kembali materi dasar dan latihan soal 1-konsep.",
    })),
    error_patterns: weakConcepts.length > 0 ? [
      {
        category: "conceptual_misunderstanding",
        title: "Pemahaman Konsep Belum Konsisten",
        description: `Beberapa kesalahan muncul pada konsep ${weakConcepts.map((w) => w.concept).join(", ")}.`,
        confidence: "medium",
        supporting_questions: [],
        correction_strategy: "Buka ringkasan materi Zyx dan pelajari ulang definisi serta contoh soal.",
      },
    ] : [],
    skill_diagnostics: metrics.cognitiveSkills.map((s) => ({
      skill: s.skill,
      status: s.status,
      summary: `Performa ${s.accuracyPercent}% pada level kognitif ini.`,
    })),
    time_insights: [
      {
        observation: `Waktu pengerjaan ${Math.round(metrics.durationSeconds / 60)} menit (rata-rata ${metrics.timeAnalysis.avgTimePerQuestionSeconds} detik/soal).`,
        interpretation: metrics.timeAnalysis.fastIncorrectCount > 0 ? "Beberapa soal dijawab terlalu cepat dengan kesalahan." : "Pace pengerjaan sudah cukup seimbang.",
        suggestion: "Beri jeda 5-10 detik untuk me-review pilihan sebelum mengkonfirmasi jawaban.",
      },
    ],
    progress_insights: [],
    study_plan: weakConcepts.slice(0, 3).map((w, idx) => ({
      priority: idx + 1,
      focus: `Pelajari ulang ${w.concept}`,
      reason: `Akurasi kuis masih ${w.accuracyPercent}%.`,
      action: "Baca materi di Zyx Academy dan kerjakan 3 latihan soal bertahap.",
      success_check: "Mampu menyelesaikan kuis remedial dengan skor di atas 75%.",
      resource_type: "material",
    })),
    encouragement: "Setiap latihan adalah langkah menuju penguasaan sempurna. Tetap fokus!",
    limitations: ["Data berdasarkan 1 percobaan kuis."],
  };
}
