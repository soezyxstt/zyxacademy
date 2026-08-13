export interface TutorSource {
  type: "chapter" | "ko" | "question" | "practice_question" | "past_exam";
  id: string;
  label: string;
  href: string;
}

export interface ConversationMemory {
  recentMessages: Array<{
    id: string;
    role: "student" | "ai";
    content: string;
    sources?: TutorSource[];
    createdAt: Date;
  }>;
  activeTopic: string | null;
  sessionId: string | null;
  messageCount: number;
}

export interface CourseMemory {
  courseId: string;
  courseTitle: string;
  activeChapterId: string | null;
  activeChapterTitle: string | null;
  activeMaterialId: string | null;
  enrolledAt: Date | null;
}

export interface LearningMemory {
  summary: {
    completedMaterials: number;
    flashcardsReviewed: number;
    quizzesCompleted: number;
    lastActiveDate: Date | null;
    totalStudyTimeMinutes: number;
  };
  recentActivity: Array<{
    type: "material" | "flashcard" | "quiz";
    conceptName: string | null;
    timestamp: Date;
    metadata: Record<string, unknown>;
  }>;
}

export interface WeakConcept {
  conceptName: string;
  masteryScore: number;
}

export interface ChapterMasterySummary {
  chapterId: string;
  chapterTitle: string;
  masteryScore: number;
  confidence: number;
}

export interface IdeaMasterySummary {
  ideaId: string;
  score: number;
  confidence: number;
  evidenceCount: number;
}

export interface MasteryMemory {
  strongestConcepts: WeakConcept[];
  weakestConcepts: WeakConcept[];
  chapterMastery: ChapterMasterySummary[];
  overallMasteryScore: number;
  ideaMastery?: IdeaMasterySummary[];
}

export interface RetrievalMemory {
  sources: TutorSource[];
  retrievedAt: Date;
  query: string;
}

export interface ContextBudget {
  maxTokens: number;
  allocated: {
    currentQuestion: number;
    retrievalMemory: number;
    conversationMemory: number;
    courseMemory: number;
    masteryMemory: number;
    learningMemory: number;
  };
  remaining: number;
}

export interface ZyraContext {
  conversationMemory: ConversationMemory;
  courseMemory: CourseMemory;
  learningMemory: LearningMemory;
  masteryMemory: MasteryMemory;
  retrievalMemory: RetrievalMemory;
  budget: ContextBudget;
  metadata: {
    builtAt: Date;
    studentId: string;
    courseId: string;
    sessionId: string | null;
  };
}

export interface Attribution {
  type: "mastery" | "quiz_performance" | "flashcard_failure" | "material_progress" | "conversation_history";
  label: string;
  detail: string;
  confidence: number;
  sourceId?: string;
}

export interface ExplainableResponse {
  response: string;
  attributions: Attribution[];
}

export interface MemoryLayerProvider<MemoryType, Input = unknown> {
  (input: Input): Promise<MemoryType>;
}
