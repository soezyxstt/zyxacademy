export type QuizPlayerProps = {
  courseId: string;
  visualCourseId?: string;
  /** Isolated client transport. No student endpoints or uploads are used when supplied. */
  transport?: { submit: (answers: Record<string, unknown>, durationSeconds: number) => Promise<void> };
  exam: {
    id: string;
    title: string;
    questions: Array<{
      id: string;
      order: number;
      type: string;
      prompt: string;
      options: string[];
      origin?: "zyx_original" | "historical_reference" | "itb_example";
      sourceEventName?: string | null;
      sourceReferenceId?: string | null;
    }>;
    settings?: {
      timeLimitMinutes?: number;
      timeLimitSeconds?: number;
      canGoBack?: boolean;
      requireAllAnswered?: boolean;
      perQuestionTimerEnabled?: boolean;
      perQuestionTimers?: Record<string, number>;
      defaultQuestionTimerSeconds?: number;
      shuffleQuestions?: boolean;
      shuffleOptions?: boolean;
    };
  };
  attemptId: string;
  /** Override the post-submit review redirect (defaults to the standard course quiz URL). */
  getRedirectPath?: (attemptId: string) => string;
  /** Serializable variant of getRedirectPath for server-component callers; `?attemptId=` is appended. */
  redirectBasePath?: string;
  /** Pre-populated answers snapshot from DB if resuming an attempt */
  initialAnswers?: Record<string, any>;
  /** Start time timestamp in ms to calculate exact remaining time relative to real time */
  startedAtMs?: number;
  /** Absolute closing timestamp in ms (e.g. quiz window closes at 20:00). Timer will not exceed this. */
  closeAtMs?: number;
};


/** Checks whether a question allows selecting multiple answers. */
export function isMultipleChoiceQuestion(type?: string): boolean {
  return type === "multiple_choices" || type === "multi_select" || type === "checkbox";
}
