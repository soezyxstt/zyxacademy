"use client";

import { useCallback, useMemo } from "react";
import { usePersistentDraft } from "@/hooks/use-persistent-draft";
import type {
  AttemptDetails,
  QuizGradeDraftMap,
  QuizGradeInput,
  SubmissionItem,
  TryoutGradeDraft,
} from "./types";

export const QUIZ_GRADING_DRAFT_VERSION = 1;
export const TRYOUT_GRADING_DRAFT_VERSION = 1;

export function getQuizGradingDraftKey(courseId: string, attemptId: string): string {
  return `zyx:tutor-quiz-grading:v${QUIZ_GRADING_DRAFT_VERSION}:${courseId}:${attemptId}`;
}

export function getTryoutGradingDraftKey(courseId: string, submissionId: string): string {
  return `zyx:tutor-tryout-grading:v${TRYOUT_GRADING_DRAFT_VERSION}:${courseId}:${submissionId}`;
}

export function buildServerQuizGradeInputs(attempt: AttemptDetails | null): QuizGradeDraftMap {
  if (!attempt) return {};
  const initial: QuizGradeDraftMap = {};
  for (const q of attempt.questions) {
    if (q.isFreeResponse) {
      initial[q.id] = {
        score: q.currentScore !== null ? String(q.currentScore) : "",
        notes: q.reviewNotes || "",
        expectedRevision: q.reviewRevision,
      };
    }
  }
  return initial;
}

export function buildServerTryoutGradeDraft(submission: SubmissionItem | null): TryoutGradeDraft {
  if (!submission) {
    return { score: "", notes: "" };
  }
  return {
    score: submission.score != null ? String(submission.score) : "",
    notes: submission.teacherNotes || "",
  };
}

export function validateQuizGradingDraft(raw: unknown): QuizGradeDraftMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const validated: QuizGradeDraftMap = {};

  for (const [questionId, entry] of Object.entries(record)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return null;
    }
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.score !== "string" ||
      typeof candidate.notes !== "string" ||
      typeof candidate.expectedRevision !== "number" ||
      !Number.isFinite(candidate.expectedRevision)
    ) {
      return null;
    }
    validated[questionId] = {
      score: candidate.score,
      notes: candidate.notes,
      expectedRevision: candidate.expectedRevision,
    };
  }

  return validated;
}

export function validateTryoutGradingDraft(raw: unknown): TryoutGradeDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.score !== "string" || typeof candidate.notes !== "string") {
    return null;
  }

  return {
    score: candidate.score,
    notes: candidate.notes,
  };
}

/**
 * Merges a persisted tutor draft on top of server-loaded question inputs so
 * unsaved scores and feedback survive viewport switches and reloads while
 * keeping the latest server expectedRevision per question.
 */
export function mergeQuizGradeInputs(
  serverInitial: QuizGradeDraftMap,
  draft: QuizGradeDraftMap | null
): QuizGradeDraftMap {
  if (!draft) return serverInitial;

  const merged: QuizGradeDraftMap = {};
  for (const [questionId, serverEntry] of Object.entries(serverInitial)) {
    const draftEntry: QuizGradeInput | undefined = draft[questionId];
    if (draftEntry) {
      merged[questionId] = {
        score: draftEntry.score,
        notes: draftEntry.notes,
        expectedRevision: serverEntry.expectedRevision,
      };
    } else {
      merged[questionId] = serverEntry;
    }
  }
  return merged;
}

export interface UseQuizGradingDraftResult {
  gradeInputs: QuizGradeDraftMap;
  setScore: (questionId: string, score: string) => void;
  setNotes: (questionId: string, notes: string) => void;
  clearDraft: () => void;
  flushDraft: () => void;
  hasRestoredDraft: boolean;
}

export function useQuizGradingDraft(
  courseId: string,
  activeAttempt: AttemptDetails | null
): UseQuizGradingDraftResult {
  const serverInitial = useMemo(
    () => buildServerQuizGradeInputs(activeAttempt),
    [activeAttempt]
  );

  const attemptId = activeAttempt?.attemptId ?? "__idle__";
  const storageKey = getQuizGradingDraftKey(courseId, attemptId);

  const isEmpty = useCallback(
    (value: QuizGradeDraftMap) => {
      if (!activeAttempt) return true;
      const keys = Object.keys(serverInitial);
      if (keys.length === 0) return true;
      return keys.every((questionId) => {
        const current = value[questionId];
        const baseline = serverInitial[questionId];
        if (!current || !baseline) return true;
        return current.score === baseline.score && current.notes === baseline.notes;
      });
    },
    [activeAttempt, serverInitial]
  );

  const {
    value: draftValue,
    setValue: setDraftValue,
    clearDraft,
    flushDraft,
    hasRestoredDraft,
  } = usePersistentDraft<QuizGradeDraftMap>({
    key: storageKey,
    version: QUIZ_GRADING_DRAFT_VERSION,
    initialValue: serverInitial,
    storage: "local",
    validate: validateQuizGradingDraft,
    isEmpty,
    debounceMs: 120,
  });

  const gradeInputs = useMemo(
    () => mergeQuizGradeInputs(serverInitial, draftValue),
    [draftValue, serverInitial]
  );

  const setScore = useCallback(
    (questionId: string, score: string) => {
      setDraftValue((prev) => {
        const merged = mergeQuizGradeInputs(serverInitial, prev);
        const existing = merged[questionId];
        if (!existing) return merged;
        return {
          ...merged,
          [questionId]: {
            ...existing,
            score,
          },
        };
      });
    },
    [serverInitial, setDraftValue]
  );

  const setNotes = useCallback(
    (questionId: string, notes: string) => {
      setDraftValue((prev) => {
        const merged = mergeQuizGradeInputs(serverInitial, prev);
        const existing = merged[questionId];
        if (!existing) return merged;
        return {
          ...merged,
          [questionId]: {
            ...existing,
            notes,
          },
        };
      });
    },
    [serverInitial, setDraftValue]
  );

  return {
    gradeInputs,
    setScore,
    setNotes,
    clearDraft,
    flushDraft,
    hasRestoredDraft,
  };
}

export interface UseTryoutGradingDraftResult {
  scoreInput: string;
  notesInput: string;
  setScoreInput: (score: string) => void;
  setNotesInput: (notes: string) => void;
  clearDraft: () => void;
  flushDraft: () => void;
  hasRestoredDraft: boolean;
}

export function useTryoutGradingDraft(
  courseId: string,
  activeSubmission: SubmissionItem | null
): UseTryoutGradingDraftResult {
  const serverInitial = useMemo(
    () => buildServerTryoutGradeDraft(activeSubmission),
    [activeSubmission]
  );

  const submissionId = activeSubmission?.id ?? "__idle__";
  const storageKey = getTryoutGradingDraftKey(courseId, submissionId);

  const isEmpty = useCallback(
    (value: TryoutGradeDraft) => {
      if (!activeSubmission) return true;
      return value.score === serverInitial.score && value.notes === serverInitial.notes;
    },
    [activeSubmission, serverInitial]
  );

  const {
    value: draft,
    setValue: setDraft,
    clearDraft,
    flushDraft,
    hasRestoredDraft,
  } = usePersistentDraft<TryoutGradeDraft>({
    key: storageKey,
    version: TRYOUT_GRADING_DRAFT_VERSION,
    initialValue: serverInitial,
    storage: "local",
    validate: validateTryoutGradingDraft,
    isEmpty,
    debounceMs: 120,
  });

  const setScoreInput = useCallback(
    (score: string) => {
      setDraft((prev) => ({
        ...prev,
        score,
      }));
    },
    [setDraft]
  );

  const setNotesInput = useCallback(
    (notes: string) => {
      setDraft((prev) => ({
        ...prev,
        notes,
      }));
    },
    [setDraft]
  );

  return {
    scoreInput: draft.score,
    notesInput: draft.notes,
    setScoreInput,
    setNotesInput,
    clearDraft,
    flushDraft,
    hasRestoredDraft,
  };
}
