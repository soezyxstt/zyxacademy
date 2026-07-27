export type ConceptMasteryStatus =
  | "strong"
  | "adequate"
  | "developing"
  | "needs_reinforcement"
  | "insufficient_evidence";

export type ErrorCategory =
  | "conceptual_misunderstanding"
  | "procedural_error"
  | "calculation_error"
  | "question_misinterpretation"
  | "representation_error"
  | "prerequisite_gap"
  | "incomplete_reasoning"
  | "inconsistent_application"
  | "insufficient_evidence";

export type TrendDirection =
  | "improving"
  | "stable"
  | "inconsistent"
  | "declining"
  | "insufficient_evidence";

export interface ConceptMasteryFact {
  concept: string;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPercent: number;
  status: ConceptMasteryStatus;
  previousAccuracyPercent?: number;
  trend?: TrendDirection;
  subconcepts?: string[];
}

export interface CognitiveSkillFact {
  skill: string; // e.g. "Mengingat", "Memahami", "Menerapkan", "Menganalisis", "Multilangkah"
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
  status: ConceptMasteryStatus;
}

export interface DifficultyFact {
  difficulty: "easy" | "medium" | "hard" | string;
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
}

export interface TimeSpeedFact {
  totalDurationSeconds: number;
  avgTimePerQuestionSeconds: number;
  fastAnswerCount: number; // < 15s
  fastIncorrectCount: number; // careless candidate
  slowAnswerCount: number; // > 120s
}

export interface HistoricalComparisonFact {
  totalAttemptsAnalyzed: number;
  scoreTrend: number[]; // e.g., [60, 68, 75]
  overallImprovementDelta: number;
  consistentlyWeakConcepts: string[];
  improvedConcepts: string[];
}

export interface ComputedQuizMetrics {
  quizTitle: string;
  courseId: string;
  templateId: string;
  attemptId: string;
  score: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  totalQuestions: number;
  durationSeconds: number;
  conceptMastery: ConceptMasteryFact[];
  cognitiveSkills: CognitiveSkillFact[];
  difficultyBreakdown: DifficultyFact[];
  timeAnalysis: TimeSpeedFact;
  historicalComparison: HistoricalComparisonFact;
}

export interface StudentQuizDiagnosis {
  headline: string; // max 15 words
  overall_summary: string; // 2-4 sentences
  performance_level: "excellent" | "good" | "developing" | "needs_support";
  strengths: Array<{
    title: string;
    description: string;
    evidence: Array<{
      question_id?: string;
      observation: string;
    }>;
  }>;
  focus_areas: Array<{
    title: string;
    description: string;
    importance: string;
    evidence: Array<{
      question_id?: string;
      observation: string;
    }>;
  }>;
  concept_diagnostics: Array<{
    concept: string;
    status: ConceptMasteryStatus;
    summary: string;
    evidence: string[];
    recommended_action: string;
  }>;
  error_patterns: Array<{
    category: ErrorCategory;
    title: string;
    description: string;
    confidence: "high" | "medium" | "low";
    supporting_questions: string[];
    correction_strategy: string;
  }>;
  skill_diagnostics: Array<{
    skill: string;
    status: ConceptMasteryStatus;
    summary: string;
  }>;
  time_insights: Array<{
    observation: string;
    interpretation: string;
    suggestion: string;
  }>;
  confidence_insights?: Array<{
    observation: string;
    interpretation: string;
    suggestion: string;
  }>;
  progress_insights: Array<{
    concept_or_skill: string;
    trend: TrendDirection;
    description: string;
  }>;
  study_plan: Array<{
    priority: number;
    focus: string;
    reason: string;
    action: string;
    success_check: string;
    resource_type?: "material" | "ko" | "flashcard" | "zyra" | "quiz";
    resource_id?: string;
    resource_url?: string;
  }>;
  encouragement: string;
  limitations: string[];
}
