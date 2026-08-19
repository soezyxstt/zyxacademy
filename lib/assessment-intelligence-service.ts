import { db } from "@/db";
import { assessmentObjects, assessmentProfiles, assessmentSources } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Deterministically checks if a student query is asking about exam patterns, structures, or formats (Type B query).
 */
export function isMetaExamQuery(query: string): Promise<boolean> | boolean {
  const normalized = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const mentionsAssessment = /\b(uts|uas|ujian|midterm|soal|kuis|tutorial)\b/.test(normalized);
  const asksHistoricalPattern = /\b(pola|tren|historis|riwayat|sering muncul|biasanya keluar|prediksi|distribusi|format|struktur|tipe|bentuk)\b/.test(normalized);
  return mentionsAssessment && asksHistoricalPattern;
}

export function isCurrentQuizContextQuery(query: string): boolean {
  const normalized = query.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const asksForSummary = /\b(ringkas|ringkasan|rangkuman|summary|topik|tentang apa)\b/.test(normalized);
  const pointsToCurrentQuiz = /\b(kuis|soal|pembahasan)\b/.test(normalized)
    && /\b(ini|tersebut|tadi|sekarang)\b/.test(normalized);
  return asksForSummary && pointsToCurrentQuiz;
}

/**
 * Compiles a factual markdown summary of historical exam statistics for a course.
 * This summary is fed directly to the Socratic LLM tutor to answer meta queries.
 */
export async function executeMetaQuery(courseId: string, _query: string): Promise<string> {
  // 1. Fetch course assessment profile
  const [profile] = await db
    .select()
    .from(assessmentProfiles)
    .where(eq(assessmentProfiles.courseId, courseId));

  if (!profile) {
    return `Belum ada data profile ujian historis yang diunggah untuk kuliah ini. Kami tidak dapat mengidentifikasi pola soal UTS/UAS saat ini.`;
  }

  // 2. Fetch all historical assessment objects for the course to extract detailed counts
  const objects = await db
    .select({
      id: assessmentObjects.id,
      questionType: assessmentObjects.questionType,
      difficulty: assessmentObjects.difficulty,
      applicationLevel: assessmentObjects.applicationLevel,
      pattern: assessmentObjects.pattern,
      reasoningType: assessmentObjects.reasoningType,
      estimatedSteps: assessmentObjects.estimatedSteps,
    })
    .from(assessmentObjects)
    .innerJoin(assessmentSources, eq(assessmentObjects.sourceId, assessmentSources.id))
    .where(and(eq(assessmentSources.courseId, courseId), eq(assessmentSources.ingestionStatus, "completed")));

  if (objects.length === 0) {
    return `Belum ada soal ujian historis yang diunggah untuk kelas ini.`;
  }

  // Calculate question types distribution
  const typeCounts: Record<string, number> = {};
  for (const obj of objects) {
    typeCounts[obj.questionType] = (typeCounts[obj.questionType] || 0) + 1;
  }
  const formattedTypes = Object.entries(typeCounts)
    .map(([type, count]) => `- **${type}**: ${count} soal`)
    .join("\n");

  // Format top concepts from the profile
  const formattedTopContexts = profile.topContexts
    ? profile.topContexts
        .slice(0, 5)
        .map(ctx => `- **${ctx.conceptName}**: ${ctx.percentage}% dari total sebaran soal`)
        .join("\n")
    : "Tidak ada data";

  // Format common patterns
  const formattedPatterns = profile.commonPatterns
    ? profile.commonPatterns
        .map(pat => `- **${pat.replace("_", " ")}**`)
        .join("\n")
    : "Tidak ada data";

  // Construct Markdown Summary
  return `### DATA HISTORIS UJIAN (UTS/UAS)
* **Total Soal Terindeks**: ${objects.length} soal
* **Tingkat Kognitif Bloom (Rata-rata)**: Level ${profile.applicationLevel} (Skala 0-5)
* **Distribusi Kesulitan**:
  - Mudah: ${profile.difficultyDistribution.easy}%
  - Sedang: ${profile.difficultyDistribution.medium}%
  - Sulit: ${profile.difficultyDistribution.hard}%
  
### TIPE SOAL YANG SERING MUNCUL:
${formattedTypes}

### SEBARAN POLA SOAL (Diurutkan dari yang paling sering):
${formattedPatterns}

### TOPIK KUNCI YANG PALING SERING DIUJI:
${formattedTopContexts}

### INFORMASI TAMBAHAN:
- Rata-rata langkah pengerjaan per soal: ${Math.round(
    objects.reduce((sum, obj) => sum + obj.estimatedSteps, 0) / objects.length
  )} langkah pengerjaan.
- Jenis penalaran dominan: ${
    objects.filter(obj => obj.reasoningType === "conceptual").length >
    objects.filter(obj => obj.reasoningType === "procedural").length
      ? "Konseptual"
      : "Prosedural/Perhitungan"
  }.`;
}
