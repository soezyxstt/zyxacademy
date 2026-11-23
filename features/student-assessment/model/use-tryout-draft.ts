"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useTranslations } from "@/lib/i18n/client";
import { usePersistentDraft } from "@/hooks/use-persistent-draft";
import { submitTryoutAction } from "@/app/actions/tutor-management";
import {
  TRYOUT_DRAFT_VERSION,
  createInitialTryoutDraft,
  emptyTryoutAnswer,
  getTryoutDraftStorageKey,
  isTryoutQuestionAnswered,
  validateTryoutDraft,
  type AnswerState,
  type PublicQuestion,
  type TryoutDraftPayload,
  type TryoutPresentationExam,
} from "./tryout-draft-state";

export {
  TRYOUT_DRAFT_VERSION,
  createInitialTryoutDraft,
  emptyTryoutAnswer,
  getTryoutDraftStorageKey,
  isTryoutQuestionAnswered,
  validateTryoutDraft,
  type AnswerState,
  type PublicQuestion,
  type TryoutDraftPayload,
  type TryoutPresentationExam,
};

export type TryoutFormProps = {
  courseId: string;
  visualCourseId?: string;
  exam: TryoutPresentationExam;
  transport?: {
    submit: (answers: Record<string, AnswerState>) => Promise<void>;
    afterSubmitHref?: string;
  };
};

export type TryoutFormController = ReturnType<typeof useTryoutForm>;

/**
 * Shared tryout controller lifted above ViewportSwitch.
 * Uses usePersistentDraft so answers, flags, and active question index
 * survive both 767px <-> 768px viewport transitions and page reloads.
 */
export function useTryoutForm({ courseId, exam, transport }: TryoutFormProps) {
  const t = useTranslations("studentCourse");
  const router = useRouter();

  const sorted = useMemo(
    () => [...exam.questions].sort((a, b) => a.order - b.order),
    [exam.questions]
  );

  const initialDraft = useMemo(() => createInitialTryoutDraft(sorted), [sorted]);
  const storageKey = getTryoutDraftStorageKey(courseId, exam.id, Boolean(transport));

  const validate = useCallback(
    (raw: unknown) => validateTryoutDraft(raw, sorted),
    [sorted]
  );

  const { value: draft, setValue: setDraft, clearDraft } =
    usePersistentDraft<TryoutDraftPayload>({
      key: storageKey,
      version: TRYOUT_DRAFT_VERSION,
      initialValue: initialDraft,
      storage: "local",
      validate,
      debounceMs: 120,
    });

  const answers = draft.answers;
  const flags = draft.flags;
  const index = Math.min(Math.max(0, draft.index), Math.max(0, sorted.length - 1));

  const setIndex = useCallback(
    (next: number | ((prev: number) => number)) => {
      setDraft((prev) => {
        const resolved = typeof next === "function" ? next(prev.index) : next;
        const clamped = Math.min(Math.max(0, resolved), Math.max(0, sorted.length - 1));
        if (clamped === prev.index) return prev;
        return { ...prev, index: clamped };
      });
    },
    [setDraft, sorted.length]
  );

  const setAnswerFor = useCallback(
    (id: string, next: AnswerState) => {
      setDraft((prev) => ({
        ...prev,
        answers: { ...prev.answers, [id]: next },
      }));
    },
    [setDraft]
  );

  const toggleFlag = useCallback(
    (id: string) => {
      setDraft((prev) => ({
        ...prev,
        flags: { ...prev.flags, [id]: !prev.flags[id] },
      }));
    },
    [setDraft]
  );

  const [timeLeft, setTimeLeft] = useState<number>(() => {
    return (exam.settings?.timeLimitMinutes ?? 90) * 60;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submissionInFlight = useRef(false);
  const expirationHandled = useRef(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [questionMapOpen, setQuestionMapOpen] = useState(false);

  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadingFile, setUploadingFile] = useState<Record<string, string>>({});

  const handleSubmit = useCallback(async () => {
    if (submissionInFlight.current || submitted) return;
    submissionInFlight.current = true;
    setIsSubmitting(true);
    try {
      if (transport) {
        await transport.submit(answers);
      } else {
        const result = await submitTryoutAction(courseId, exam.id, answers);
        if (!result.success) {
          toast.error(t("tryout.submitFailed"));
          return;
        }
      }
      clearDraft();
      setSubmitted(true);
      const href = transport
        ? transport.afterSubmitHref
        : `/courses/${courseId}/my-results`;
      if (href) {
        toast.success(t("tryout.submitted"));
        router.push(href);
      }
    } catch (err) {
      console.error("Error submitting tryout:", err);
      toast.error(t("tryout.submitFailed"));
    } finally {
      submissionInFlight.current = false;
      setIsSubmitting(false);
    }
  }, [answers, clearDraft, courseId, exam.id, router, submitted, t, transport]);

  const timeExpired = timeLeft === 0;
  useEffect(() => {
    if (submitted || timeExpired) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, timeExpired]);

  useEffect(() => {
    if (!timeExpired || submitted || expirationHandled.current) return;
    expirationHandled.current = true;
    toast.warning(t("tryout.timeExpired"));
    void handleSubmit();
  }, [timeExpired, submitted, handleSubmit, t]);

  const uploadEssayAttachment = useCallback(
    (questionId: string, file: File) => {
      if (transport) {
        toast.error(t("tryout.uploadFailed"));
        return;
      }
      setUploadingFile((prev) => ({ ...prev, [questionId]: file.name }));
      setUploadProgress((prev) => ({ ...prev, [questionId]: 0 }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("examId", exam.id);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/exams/attachments");
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable) {
          const pct = Math.round((ev.loaded / ev.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [questionId]: pct }));
        }
      });
      xhr.addEventListener("load", () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data.success) {
            setDraft((prev) => ({
              ...prev,
              answers: {
                ...prev.answers,
                [questionId]: {
                  ...prev.answers[questionId],
                  fileName: data.fileName as string,
                  fileSize: data.fileSize as string,
                  fileKey: data.key as string,
                } as AnswerState,
              },
            }));
            toast.success(t("tryout.fileUploaded", { fileName: file.name }));
          } else {
            toast.error(t("tryout.uploadFailed"));
          }
        } catch {
          toast.error(t("tryout.uploadFailed"));
        }
        setUploadingFile((prev) => {
          const copy = { ...prev };
          delete copy[questionId];
          return copy;
        });
      });
      xhr.addEventListener("error", () => {
        toast.error(t("tryout.uploadFailed"));
        setUploadingFile((prev) => {
          const copy = { ...prev };
          delete copy[questionId];
          return copy;
        });
      });
      xhr.send(formData);
    },
    [exam.id, setDraft, t, transport]
  );

  const handleFileChange = useCallback(
    (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) {
        uploadEssayAttachment(questionId, f);
        e.target.value = "";
      }
    },
    [uploadEssayAttachment]
  );

  const handleRemoveFile = useCallback(
    (questionId: string) => {
      setDraft((prev) => ({
        ...prev,
        answers: {
          ...prev.answers,
          [questionId]: {
            ...prev.answers[questionId],
            fileName: null,
            fileSize: undefined,
            fileKey: null,
          } as AnswerState,
        },
      }));
      setUploadProgress((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
      setUploadingFile((prev) => {
        const copy = { ...prev };
        delete copy[questionId];
        return copy;
      });
      toast.info(t("tryout.attachmentRemoved"));
    },
    [setDraft, t]
  );

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, [setIndex]);

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(sorted.length - 1, i + 1));
  }, [setIndex, sorted.length]);

  const isQuestionAnswered = useCallback(
    (question: PublicQuestion) => isTryoutQuestionAnswered(question, answers),
    [answers]
  );

  const q = sorted[index];
  const answeredCount = sorted.filter((question) => isQuestionAnswered(question)).length;
  const unansweredCount = sorted.length - answeredCount;
  const flaggedCount = sorted.filter((question) => flags[question.id]).length;
  const progress = sorted.length > 0 ? ((index + 1) / sorted.length) * 100 : 0;

  return {
    t,
    sorted,
    q,
    index,
    setIndex,
    answers,
    flags,
    timeLeft,
    isSubmitting,
    submitted,
    showConfirmModal,
    setShowConfirmModal,
    questionMapOpen,
    setQuestionMapOpen,
    uploadProgress,
    uploadingFile,
    answeredCount,
    unansweredCount,
    flaggedCount,
    progress,
    setAnswerFor,
    toggleFlag,
    handleFileChange,
    handleRemoveFile,
    handleSubmit,
    goPrev,
    goNext,
    isQuestionAnswered,
    clearDraft,
  };
}
