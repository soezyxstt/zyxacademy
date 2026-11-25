"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { getAppScrollBehavior, useAppReducedMotion } from "@/components/appearance-preferences";
import {
  AlertCircle,
  RefreshCw,
  UploadCloud,
  Star,
  Calendar,
  Clock,
  ZoomIn,
  ArrowRight,
  ArrowLeft,
  FileCheck2,
  Layers,
  Tag,
  Check,
  Send,
  Eraser,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/course/math-text";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { buildFormSteps, formFileSizeLimitMb, isEmptyFormAnswer, type FormStep, type FormDisplayMode } from "@/lib/forms/presentation";
import { formFileAccept, type FormFileMime } from "@/lib/forms/file-types";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { customFormMessage, type FormClosure } from "@/lib/forms/response-policy";
import { useFormatter } from "next-intl";
import { useTranslations } from "@/lib/i18n/client";

interface QuestionItem {
  title: string;
  description?: string;
  imageUrl?: string;
  type: string;
  required?: boolean;
  options?: string[];
  otherOption?: { enabled: boolean; label: string };
  scaleLow?: number;
  scaleHigh?: number;
  scaleLowLabel?: string;
  scaleHighLabel?: string;
  gridRows?: string[];
  gridColumns?: string[];
  maxFileSizeMb?: number;
  allowedFileTypes?: FormFileMime[];
}

const OTHER_OPTION_MARKER = "\uE000__other__";

interface FormPayload {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  questions: QuestionItem[];
  settings?: {
    customSuccessMessage?: string;
    collectEmail?: "none" | "input" | "verified";
    requireLogin?: boolean;
    displayMode?: FormDisplayMode;
  };
}

function formChoiceRowClass(selected: boolean) {
  return cn(
    "flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 px-2 py-2 text-left text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    selected ? "bg-muted/60" : "hover:bg-muted/40",
  );
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];

export function PublicFormViewer({
  idOrSlug,
  previewForm,
  isPreview = false,
  initialStepIndex = 0,
}: {
  idOrSlug?: string;
  previewForm?: FormPayload;
  isPreview?: boolean;
  initialStepIndex?: number;
}) {
  const t = useTranslations("publicForms");
  const format = useFormatter();
  const tRef = useRef(t);
  tRef.current = t;
  const reducedMotion = useAppReducedMotion();
  const [form, setForm] = useState<FormPayload | null>(previewForm || null);
  const [loading, setLoading] = useState(!previewForm);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  // Form input answers state (with ref to eliminate race conditions / stale closures)
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const answersRef = useRef<Record<number, any>>({});

  const [uploadingQIdx, setUploadingQIdx] = useState<number | null>(null);
  const uploadInFlightRef = useRef(false);
  const uploadPreviews = useRef<Record<number, { url: string; name: string }>>({});
  const mounted = useRef(true);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const clearUploadPreviews = () => {
    Object.values(uploadPreviews.current).forEach(({ url }) => URL.revokeObjectURL(url));
    uploadPreviews.current = {};
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearUploadPreviews(); };
  }, []);

  // Email collection state
  const [responderEmail, setResponderEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // "Lainnya" free text state
  const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
  const otherTextsRef = useRef<Record<number, string>>({});

  // Lightbox Image Dialog State
  const [zoomImageUri, setZoomImageUri] = useState<{ url: string; title: string } | null>(null);

  const [isClosed, setIsClosed] = useState(false);
  const [closure, setClosure] = useState<FormClosure | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);

  // Typeform Step Navigation State
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex);
  const [direction, setDirection] = useState<1 | -1>(1);

  const activeFocusRef = useRef<HTMLElement | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const focusActiveElement = useCallback(() => {
    if (activeFocusRef.current) {
      const el = activeFocusRef.current;
      try {
        el.focus();
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          if (typeof el.value === "string") {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
        }
      } catch {
        // Silently catch unsupported selection ranges (e.g. date inputs)
      }
    }
  }, []);

  const isFlowing = form?.settings?.displayMode === "section";

  const setFocusableRef = useCallback((el: HTMLElement | null) => {
    if (isFlowing) return;
    if (el) {
      activeFocusRef.current = el;
      requestAnimationFrame(() => {
        try {
          el.focus();
        } catch {
          // Ignore
        }
      });
    }
  }, [isFlowing]);

  const fetchForm = useCallback(async () => {
    if (!idOrSlug) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/forms/${idOrSlug}`);
      const data = await res.json();
      if (data.form) {
        setForm(data.form);
        if (data.isClosed) {
          setIsClosed(true);
          setClosure(data.closure ?? null);
          setClosedReason(data.closedReason || tRef.current("publicForm.closedDescription"));
        }
      } else {
        setErrorMsg(tRef.current("publicForm.notFoundDescription"));
      }
    } catch {
      setErrorMsg(tRef.current("publicForm.loadError"));
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => {
    if (isPreview && previewForm) {
      setForm(previewForm);
      setLoading(false);
      setErrorMsg(null);
      return;
    }
    fetchForm();
  }, [isPreview, previewForm, fetchForm]);

  const collectEmail = form?.settings?.collectEmail || "none";

  const steps = useMemo(() => buildFormSteps(
    form?.questions || [], isFlowing ? "section" : "question", collectEmail === "input",
  ), [form, isFlowing, collectEmail]);

  // A preview can change modes or remove questions while mounted.
  const stepIndex = Math.min(currentStepIndex, steps.length - 1);
  // Number only answerable questions.
  const questionNumberMap = useMemo(() => {
    const map = new Map<number, number>();
    if (!form?.questions) return map;
    let n = 0;
    form.questions.forEach((q, idx) => {
      if (q.type !== "SECTION" && q.type !== "STATEMENT") {
        n += 1;
        map.set(idx, n);
      }
    });
    return map;
  }, [form]);

  const totalQuestions = useMemo(() => {
    if (!form?.questions) return 0;
    return form.questions.filter((q) => q.type !== "SECTION" && q.type !== "STATEMENT").length;
  }, [form]);

  // Calculate overall percentage progress
  const progressPercent = Math.round((stepIndex / Math.max(steps.length, 1)) * 100);

  const currentStep = steps[stepIndex];
  const visibleSteps: FormStep[] = currentStep?.kind === "page"
    ? [
        ...(currentStep.includeCover ? [{ kind: "cover" as const }] : []),
        ...(currentStep.includeEmail ? [{ kind: "email" as const }] : []),
        ...currentStep.questionIndices.map((questionIndex) => ({
          kind: form?.questions[questionIndex].type === "SECTION" ? "section" as const
            : form?.questions[questionIndex].type === "STATEMENT" ? "statement" as const : "question" as const,
          questionIndex,
        })),
      ]
    : currentStep ? [currentStep] : [];
  const isLastStep = stepIndex === steps.length - 1;


  // Auto focus input on step change with animation completion fallback
  useEffect(() => {
    const timer = setTimeout(() => {
      focusActiveElement();
    }, 320);
    return () => clearTimeout(timer);
  }, [currentStepIndex, focusActiveElement]);

  const otherLabelFor = (qIdx: number) => form?.questions?.[qIdx]?.otherOption?.label || t("publicForm.other");

  const handleAnswerChange = (qIdx: number, val: any) => {
    answersRef.current[qIdx] = val;
    setAnswers((prev) => ({ ...prev, [qIdx]: val }));
  };

  const handleClearAnswer = (qIdx: number) => {
    if (uploadPreviews.current[qIdx]) {
      URL.revokeObjectURL(uploadPreviews.current[qIdx].url);
      delete uploadPreviews.current[qIdx];
    }
    delete answersRef.current[qIdx];
    delete otherTextsRef.current[qIdx];
    setAnswers((prev) => {
      const copy = { ...prev };
      delete copy[qIdx];
      return copy;
    });
    setOtherTexts((prev) => {
      const copy = { ...prev };
      delete copy[qIdx];
      return copy;
    });
    toast.success(t("publicForm.clearedAnswer"));
  };

  const handleCheckboxToggle = (qIdx: number, opt: string) => {
    const currentList: string[] = Array.isArray(answersRef.current[qIdx]) ? answersRef.current[qIdx] : [];
    const updated = currentList.includes(opt)
      ? currentList.filter((item) => item !== opt)
      : [...currentList, opt];
    answersRef.current[qIdx] = updated;
    setAnswers((prev) => ({ ...prev, [qIdx]: updated }));
  };

  const handleGridChoice = (qIdx: number, rowVal: string, colVal: string, isCheckbox = false) => {
    const currentGridObj =
      typeof answersRef.current[qIdx] === "object" && !Array.isArray(answersRef.current[qIdx])
        ? { ...answersRef.current[qIdx] }
        : {};
    if (isCheckbox) {
      const rowList: string[] = Array.isArray(currentGridObj[rowVal]) ? currentGridObj[rowVal] : [];
      const updatedRowList = rowList.includes(colVal)
        ? rowList.filter((c) => c !== colVal)
        : [...rowList, colVal];
      currentGridObj[rowVal] = updatedRowList;
    } else {
      currentGridObj[rowVal] = colVal;
    }
    answersRef.current[qIdx] = currentGridObj;
    setAnswers((prev) => ({ ...prev, [qIdx]: currentGridObj }));
  };

  const handleFileUpload = async (qIdx: number, file: File) => {
    if (uploadInFlightRef.current) return;
    const maxSizeMb = formFileSizeLimitMb(form?.questions[qIdx]?.maxFileSizeMb);
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`Maksimal ${maxSizeMb} MB per berkas.`);
      return;
    }
    const saveUploadPreview = (storageUrl?: string) => {
      if (uploadPreviews.current[qIdx]) URL.revokeObjectURL(uploadPreviews.current[qIdx].url);
      const localUrl = URL.createObjectURL(new Blob([file], { type: "application/octet-stream" }));
      uploadPreviews.current[qIdx] = { url: localUrl, name: file.name };
      handleAnswerChange(qIdx, storageUrl ?? localUrl);
    };
    if (isPreview) {
      saveUploadPreview();
      return;
    }
    uploadInFlightRef.current = true;
    setUploadingQIdx(qIdx);
    setUploadProgress(20);
    let interval: ReturnType<typeof setInterval> | undefined;
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (form?.slug || form?.id) {
        formData.append("formSlug", form.id || form.slug);
      }
      formData.append("questionNumber", String(qIdx + 1));

      interval = setInterval(() => {
        setUploadProgress((prev) => (prev >= 85 ? prev : prev + 15));
      }, 200);

      const res = await fetch("/api/forms/upload", {
        method: "POST",
        body: formData,
      });
      clearInterval(interval);
      setUploadProgress(100);

      const data = await res.json();
      if (data.success && data.url) {
        if (!mounted.current) return;
        saveUploadPreview(data.url);
        toast.success(t("publicForm.uploadSuccess"));
      } else {
        if (res.status === 401) setLoginRequired(true);
        toast.error(data.error || t("publicForm.uploadFailed"));
      }
    } catch {
      toast.error(t("publicForm.uploadError"));
    } finally {
      clearInterval(interval);
      uploadInFlightRef.current = false;
      setUploadingQIdx(null);
      setUploadProgress(0);
    }
  };

  const validateEmail = () => {
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responderEmail.trim());
    setEmailError(valid ? null : t("publicForm.emailInvalid"));
    return valid;
  };

  const validateQuestion = (qIdx: number) => {
    const q = form?.questions[qIdx];
    if (!q || q.type === "SECTION" || q.type === "STATEMENT") return true;
    const value = answersRef.current[qIdx];
    const isOtherEmpty = (value === OTHER_OPTION_MARKER ||
      (Array.isArray(value) && value.includes(OTHER_OPTION_MARKER))) && !otherTextsRef.current[qIdx]?.trim();
    if (isOtherEmpty || (q.required && isEmptyFormAnswer(q, value))) {
      toast.error(isOtherEmpty ? t("publicForm.otherRequired") : t("publicForm.requiredNamed", { title: q.title }));
      requestAnimationFrame(() => {
        const field = mainScrollRef.current?.querySelector<HTMLElement>(`[data-question-index="${qIdx}"]`);
        field?.scrollIntoView({ block: "center", behavior: getAppScrollBehavior() });
        field?.focus({ preventScroll: true });
      });
      return false;
    }
    return true;
  };

  const validateCurrentStep = () => {
    if (!currentStep) return true;
    if (currentStep.kind === "email") return validateEmail();
    if (currentStep.kind === "question") return validateQuestion(currentStep.questionIndex);
    if (currentStep.kind === "page") {
      if (currentStep.includeEmail && !validateEmail()) return false;
      return currentStep.questionIndices.every(validateQuestion);
    }
    return true;
  };

  const resetScroll = () => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: getAppScrollBehavior() });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: getAppScrollBehavior() });
    }
  };

  const goToNextStep = () => {
    if (uploadInFlightRef.current || submittingRef.current) return;
    if (!validateCurrentStep()) return;
    if (isLastStep) {
      void handleSubmit();
      return;
    }
    if (stepIndex < steps.length - 1) {
      setDirection(1);
      setCurrentStepIndex(stepIndex + 1);
      resetScroll();
    }
  };

  const goToPrevStep = () => {
    if (uploadInFlightRef.current || submittingRef.current) return;
    if (stepIndex > 0) {
      setDirection(-1);
      setCurrentStepIndex(stepIndex - 1);
      resetScroll();
    }
  };

  const jumpToStep = (index: number) => {
    if (index >= 0 && index < steps.length) {
      setDirection(index > currentStepIndex ? 1 : -1);
      setCurrentStepIndex(index);
      resetScroll();
    }
  };

  // Single-choice auto advance never submits or opens a dialog.
  const advanceAfterChoice = () => {
    if (!isFlowing && !isLastStep) goToNextStep();
  };

  const handleSubmit = async (confirmed = false) => {
    if (!form || submittingRef.current || uploadInFlightRef.current || submittedMessage) return;

    // Validate all required questions
    for (let qIdx = 0; qIdx < form.questions.length; qIdx += 1) {
      const question = form.questions[qIdx];
      if (question.type === "SECTION" || question.type === "STATEMENT") continue;
      const value = answersRef.current[qIdx] ?? answers[qIdx];
      const otherTextVal = otherTextsRef.current[qIdx] ?? otherTexts[qIdx];
      const hasEmptyOther =
        (value === OTHER_OPTION_MARKER ||
          (Array.isArray(value) && value.includes(OTHER_OPTION_MARKER))) &&
        !otherTextVal?.trim();
      const isEmpty = isEmptyFormAnswer(question, value);

      if (hasEmptyOther || (question.required && isEmpty)) {
        const stepTarget = steps.findIndex(
          (s) => (s.kind === "question" && s.questionIndex === qIdx) || (s.kind === "page" && s.questionIndices.includes(qIdx))
        );
        if (stepTarget >= 0) {
          jumpToStep(stepTarget);
        }
        setConfirmSubmitOpen(false);
        toast.error(
          hasEmptyOther
            ? t("publicForm.otherRequiredNamed", { title: question.title || `#${questionNumberMap.get(qIdx) || qIdx + 1}` })
            : t("publicForm.requiredNamed", { title: question.title || `#${questionNumberMap.get(qIdx) || qIdx + 1}` })
        );
        return;
      }
    }

    const trimmedEmail = responderEmail.trim();
    if (collectEmail === "input") {
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        const emailStepTarget = steps.findIndex((s) => s.kind === "email" || (s.kind === "page" && s.includeEmail));
        if (emailStepTarget >= 0) jumpToStep(emailStepTarget);
        setEmailError(t("publicForm.emailInvalid"));
        toast.error(t("publicForm.emailInvalid"));
        return;
      }
      setEmailError(null);
    }

    if (!confirmed) {
      setErrorMsg(null);
      setConfirmSubmitOpen(true);
      return;
    }

    if (isPreview) {
      setConfirmSubmitOpen(false);
      clearUploadPreviews();
      answersRef.current = {};
      otherTextsRef.current = {};
      setAnswers({});
      setOtherTexts({});
      setResponderEmail("");
      setEmailError(null);
      setCurrentStepIndex(0);
      setSubmittedMessage(
        customFormMessage("customSuccessMessage", form?.settings?.customSuccessMessage) || t("publicForm.previewSuccess")
      );
      toast.success(t("publicForm.previewSubmitted"));
      return;
    }

    const finalAnswers: Record<number, any> = {};
    for (const [key, val] of Object.entries(answersRef.current)) {
      const idx = Number(key);
      const otherTextVal = otherTextsRef.current[idx] ?? otherTexts[idx];
      if (val === OTHER_OPTION_MARKER) {
        finalAnswers[idx] = otherTextVal?.trim() || otherLabelFor(idx);
      } else if (Array.isArray(val) && val.includes(OTHER_OPTION_MARKER)) {
        finalAnswers[idx] = val.map((item) =>
          item === OTHER_OPTION_MARKER ? otherTextVal?.trim() || otherLabelFor(idx) : item
        );
      } else {
        finalAnswers[idx] = val;
      }
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrorMsg(null);
    setLoginRequired(false);
    try {
      const res = await fetch(`/api/forms/${idOrSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers, responderEmail: trimmedEmail || undefined }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setLoginRequired(true);
        setErrorMsg(t("publicForm.loginDescription"));
      } else if (data.success) {
        setConfirmSubmitOpen(false);
        clearUploadPreviews();
        answersRef.current = {};
        otherTextsRef.current = {};
        setAnswers({});
        setOtherTexts({});
        setResponderEmail("");
        setEmailError(null);
        setCurrentStepIndex(0);
        setSubmittedMessage(customFormMessage("customSuccessMessage", form?.settings?.customSuccessMessage) || t("publicForm.submitSuccess"));
      } else {
        toast.error(t("publicForm.submitFailed"));
        setErrorMsg(t("publicForm.submitFailed"));
      }
    } catch {
      toast.error(t("publicForm.networkError"));
      setErrorMsg(t("publicForm.networkError"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (confirmSubmitOpen || zoomImageUri || submitting || submittedMessage || loading || (!form && errorMsg) || isClosed) return;
      if (target?.closest('[role="dialog"], [role="listbox"], [role="combobox"], [role="menu"]')) return;
      const isTextarea = target?.tagName === "TEXTAREA";
      const isInput = target?.tagName === "INPUT";

      // Ctrl + Enter or Cmd + Enter to submit form
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }

      if (isFlowing) return;
      if (target?.closest("button, a")) return;

      // Enter key for advancing steps
      if (e.key === "Enter" && !e.shiftKey) {
        if (!isTextarea) {
          e.preventDefault();
          if (currentStepIndex === steps.length - 1) {
            handleSubmit();
          } else {
            goToNextStep();
          }
        }
      }

      // Shortcut letters (A, B, C...) for radio/checkbox choices when not typing inside text input
      if (!isInput && !isTextarea && currentStep?.kind === "question") {
        const qIdx = currentStep.questionIndex;
        const q = form?.questions[qIdx];
        if (q && (q.type === "RADIO" || q.type === "CHECKBOX")) {
          const keyUpper = e.key.toUpperCase();
          const optionIndex = OPTION_LETTERS.indexOf(keyUpper);
          if (optionIndex >= 0 && q.options && optionIndex < q.options.length) {
            e.preventDefault();
            const chosenOption = q.options[optionIndex];
            if (q.type === "RADIO") {
              handleAnswerChange(qIdx, chosenOption);
              advanceAfterChoice();
            } else {
              handleCheckboxToggle(qIdx, chosenOption);
            }
          }
        }

        // Numbers 1-5 for Linear Scale
        if (q && q.type === "SCALE") {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= 5) {
            e.preventDefault();
            handleAnswerChange(qIdx, num.toString());
            advanceAfterChoice();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Motion variants for smooth vertical slide & fade transitions
  const slideVariants = {
    enter: (dir: number) => ({
      y: reducedMotion ? 0 : dir > 0 ? 16 : -16,
      opacity: reducedMotion ? 1 : 0,
      filter: "none",
    }),
    center: {
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: reducedMotion ? { duration: 0 } : {
        y: { type: "spring" as const, stiffness: 350, damping: 30 },
        opacity: { duration: 0.25 },
        filter: { duration: 0.2 },
      },
    },
    exit: (dir: number) => ({
      y: reducedMotion ? 0 : dir > 0 ? -16 : 16,
      opacity: reducedMotion ? 1 : 0,
      filter: "none",
      transition: reducedMotion ? { duration: 0 } : {
        y: { type: "spring" as const, stiffness: 350, damping: 30 },
        opacity: { duration: 0.2 },
        filter: { duration: 0.15 },
      },
    }),
  };

  if (loading) {
    return (
      <div className="relative flex h-screen h-[100dvh] flex-col items-center justify-center space-y-4 overflow-hidden bg-background">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="size-8 animate-spin text-brand-primary" />
          <p className="text-body-sm font-medium text-muted-foreground animate-pulse">
            {t("publicForm.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (loginRequired) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-(--page-gutter) py-(--section-gap)">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 mx-auto w-full max-w-md space-y-(--related-gap) text-center">
          <div className="mx-auto flex size-10 items-center justify-center text-primary">
            <AlertCircle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-h5 font-bold text-foreground">{t("publicForm.loginRequired")}</h1>
            <p className="text-body-sm text-muted-foreground">
              {errorMsg || t("publicForm.loginDescription")}
            </p>
          </div>
          <Button asChild size="lg" className="w-full font-bold">
            <Link href="/login">{t("publicForm.loginAction")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (errorMsg && !form) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-(--page-gutter) py-(--section-gap)">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 mx-auto w-full max-w-md space-y-(--related-gap) text-center">
          <div className="mx-auto flex size-10 items-center justify-center text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-h5 font-bold text-foreground">{t("publicForm.notFoundTitle")}</h1>
            <p className="text-body-sm text-muted-foreground">{errorMsg || t("publicForm.notFoundDescription")}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">{t("publicForm.home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isClosed && form) {
    const dateLabel = (value: string) => format.dateTime(new Date(value), {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
    });
    const description = closure?.kind === "scheduled"
      ? t("publicForm.opensAt", { date: dateLabel(closure.opensAt) })
      : closure?.message || (closure?.kind === "ended"
        ? t("publicForm.endedAt", { date: dateLabel(closure.endedAt) })
        : (!closure && closedReason) || t("publicForm.closedDescription"));
    return (
      <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background px-(--page-gutter) py-(--section-gap)">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 mx-auto w-full max-w-lg space-y-(--related-gap) text-center">
          <span className="inline-block rounded-md bg-status-warning/10 px-3 py-1 text-body-2xs font-bold uppercase tracking-wider text-status-warning">
            {t("publicForm.closed")}
          </span>
          <h1 className="font-heading text-h5 font-bold text-foreground">{form.title}</h1>
          <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-4">
            {description}
          </p>
          <Button asChild variant="outline">
            <Link href="/">{t("publicForm.home")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (submittedMessage && form) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden bg-background px-(--page-gutter) py-(--section-gap)",
          isPreview ? "min-h-[500px] rounded-xl border border-border" : "min-h-dvh"
        )}
      >
        <PageOrnaments variant="testimonial" />
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mx-auto w-full max-w-lg space-y-(--related-gap) text-center"
        >
          <div className="mx-auto flex size-10 items-center justify-center text-status-success">
            <Check className="size-6" aria-hidden />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-h5 font-bold text-foreground">{t("publicForm.thankYou")}</h1>
            <p className="text-body-sm text-muted-foreground whitespace-pre-line">
              {submittedMessage}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              onClick={() => {
                setSubmittedMessage(null);
                setCurrentStepIndex(0);
              }}
              variant="outline"
              className="font-medium"
            >
              {isPreview ? t("publicForm.previewAgain") : t("publicForm.fillAgain")}
            </Button>
            {!isPreview && (
              <Button asChild className="font-semibold">
                <Link href="/">{t("publicForm.done")}</Link>
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  if (!form) return null;

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden bg-background text-foreground selection:bg-brand-primary/20",
        isPreview ? "min-h-[620px] h-[78vh] rounded-xl border border-border" : "h-screen h-[100dvh]"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden="true">
        <PageOrnaments variant="plans" />
      </div>

      {/* Top Fixed Minimal Progress Header */}
      <header className="shrink-0 z-40 w-full backdrop-blur-md bg-background/85 border-b border-border/40">
        <div className="h-1 w-full bg-muted/60">
          <motion.div
            className="h-full bg-brand-primary"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: reducedMotion ? 0 : 0.3, ease: "easeOut" }}
          />
        </div>
        <div className="mx-auto flex min-h-11 max-w-2xl items-center justify-between gap-3 px-(--page-gutter) text-body-xs font-semibold text-muted-foreground">
          <span className="min-w-0 flex-1 truncate font-medium text-foreground">
            {form.title}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {currentStep?.kind === "page" && <span>Bagian {stepIndex + 1} / {steps.length}</span>}
            {currentStep?.kind === "question" && (
              <span className="font-mono text-body-xs text-muted-foreground">
                {questionNumberMap.get(currentStep.questionIndex) || 1} / {totalQuestions}
              </span>
            )}
            <span className="font-mono text-body-xs font-bold text-brand-primary">
              {progressPercent}%
            </span>
          </div>
        </div>
      </header>

      {/* Main Interactive Screen Area */}
      <main ref={mainScrollRef} className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full min-w-0 max-w-2xl shrink-0 px-(--page-gutter) py-(--page-top)">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div key={`${isFlowing ? "section" : "step"}-${stepIndex}`} className={isFlowing ? "divide-y divide-border/70 [&>div]:py-(--group-gap) [&>div:first-child]:pt-0" : ""}>
            {visibleSteps.map((currentStep, visibleIndex) => (
              <div key={visibleIndex}>
            {/* 1. COVER / WELCOME SCREEN */}
            {currentStep?.kind === "cover" && (
              <motion.div
                key="cover"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={focusActiveElement}
                className="space-y-(--related-gap) text-left"
              >
                <div className={cn("inline-flex items-center gap-1.5 text-body-xs font-medium text-muted-foreground", isFlowing && "hidden")}>
                  <Tag className="size-3.5" />
                  {form.category}
                </div>

                <h1 className="font-heading text-h5 font-bold text-foreground tracking-tight leading-tight">
                  <MathText as="span">{form.title}</MathText>
                </h1>

                {form.description && (
                  <div className="text-body-base text-muted-foreground whitespace-pre-line">
                    <MathText as="div">{form.description}</MathText>
                  </div>
                )}

                <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-body-xs text-muted-foreground", isFlowing && "hidden")}>
                  <span>{t("publicForm.estimatedMinutes", { count: Math.max(1, Math.round(totalQuestions * 0.5)) })}</span>
                  <span>•</span>
                  <span>{t("publicForm.questionCount", { count: totalQuestions })}</span>
                </div>

                <div className={cn("flex items-center gap-3", isFlowing && "hidden")}>
                  <Button
                    ref={setFocusableRef as any}
                    size="lg"
                    onClick={goToNextStep}
                    className="gap-2"
                  >
                    <span>{t("publicForm.start")}</span>
                    <ArrowRight className="size-4" />
                  </Button>
                  <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                    {t("publicForm.keyboardEnter")}
                  </span>
                </div>
              </motion.div>
            )}

            {/* 2. EMAIL COLLECTION SCREEN */}
            {currentStep?.kind === "email" && (
              <motion.div
                key="email-screen"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={focusActiveElement}
                className="space-y-(--related-gap) text-left"
              >
                <div className="space-y-2">
                  <div className={cn("flex items-center gap-2 text-brand-primary font-mono text-body-sm font-bold", isFlowing && "hidden")}>
                    <span>*</span>
                    <span>{t("publicForm.respondentIdentification")}</span>
                  </div>
                  <h2 className="font-heading text-body-base font-semibold text-foreground leading-snug">
                    {t("publicForm.emailTitle")}
                  </h2>
                  <p className={cn("text-body-sm text-muted-foreground", isFlowing && "hidden")}>
                    {t("publicForm.emailExplanation")}
                  </p>
                </div>

                <div className="space-y-2">
                  <input
                    ref={setFocusableRef as any}
                    type="email"
                    aria-label={t("publicForm.email")}
                    required
                    value={responderEmail}
                    onChange={(e) => {
                      setResponderEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder={t("publicForm.emailPlaceholder")}
                    className="w-full bg-transparent border-b-2 border-border/80 focus:border-brand-primary pb-3 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                  />
                  {emailError && (
                    <p className="flex items-center gap-1.5 text-body-xs font-semibold text-destructive pt-1">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {emailError}
                    </p>
                  )}
                </div>

                <div className={cn("flex items-center gap-3", isFlowing && "hidden")}>
                  <Button
                    size="lg"
                    onClick={goToNextStep}
                    className="gap-2"
                  >
                    <span>{isLastStep ? t("publicForm.submit") : t("publicForm.next")}</span>
                    <Check className="size-4 ml-1.5" />
                  </Button>
                  <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                    {t("publicForm.keyboardEnter")}
                  </span>
                </div>
              </motion.div>
            )}

            {/* 3. SECTION TRANSITION SCREEN */}
            {currentStep?.kind === "section" && (() => {
              const q = form.questions[currentStep.questionIndex];
              if (!q) return null;

              const hasUpcomingQuestions = steps
                .slice(currentStepIndex + 1)
                .some((s) => s.kind === "question");

              return (
                <motion.div
                  key={`section-${currentStep.questionIndex}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={focusActiveElement}
                  className="space-y-(--related-gap) text-left"
                >
                  <div className={cn("inline-flex items-center gap-1.5 text-body-xs font-medium text-muted-foreground", isFlowing && "hidden")}>
                    <Layers className="size-3.5" />
                    {hasUpcomingQuestions ? t("publicForm.newSection") : t("publicForm.closing")}
                  </div>

                  <h2 className="font-heading text-body-base font-bold text-foreground tracking-tight leading-tight">
                    <MathText as="span">{q.title || t("publicForm.sectionFallback")}</MathText>
                  </h2>

                  {q.description && (
                    <div className="text-body-base text-muted-foreground whitespace-pre-line">
                      <MathText as="div">{q.description}</MathText>
                    </div>
                  )}

                  {q.imageUrl && (
                    <div className="relative inline-block rounded-xl border border-border bg-card p-2 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={q.imageUrl}
                        alt={q.title}
                        className="max-h-64 rounded-lg object-contain cursor-pointer"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                        className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/75 px-2.5 py-1 text-body-xs font-semibold text-white backdrop-blur-xs cursor-pointer"
                      >
                        <ZoomIn className="size-3" />
                        {t("publicForm.enlarge")}
                      </button>
                    </div>
                  )}

                  <div className={cn("flex items-center gap-3", isFlowing && "hidden")}>
                    <Button
                      ref={setFocusableRef as any}
                      size="lg"
                      onClick={goToNextStep}
                      className="gap-2"
                    >
                      <span>{isLastStep ? t("publicForm.submit") : t("publicForm.next")}</span>
                      <ArrowRight className="size-4" />
                    </Button>
                    <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      {t("publicForm.keyboardEnter")}
                    </span>
                  </div>
                </motion.div>
              );
            })()}

            {/* 3b. STATEMENT / INFORMATIONAL SCREEN */}
            {currentStep?.kind === "statement" && (() => {
              const q = form.questions[currentStep.questionIndex];
              if (!q) return null;

              return (
                <motion.div
                  key={`statement-${currentStep.questionIndex}`}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={focusActiveElement}
                  className="space-y-(--related-gap) text-left"
                >
                  <div className="inline-flex items-center gap-1.5 text-body-xs font-medium text-muted-foreground">
                    <Info className="size-3.5" />
                    {t("publicForm.information")}
                  </div>

                  {q.title && (
                    <h2 className="font-heading text-body-base sm:text-h5 font-bold text-foreground tracking-tight leading-tight">
                      <MathText as="span">{q.title}</MathText>
                    </h2>
                  )}

                  {q.description && (
                    <div className="text-body-base text-muted-foreground whitespace-pre-line">
                      <MathText as="div">{q.description}</MathText>
                    </div>
                  )}

                  {q.imageUrl && (
                    <div className="relative inline-block rounded-xl border border-border bg-card p-2 group max-w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={q.imageUrl}
                        alt={q.title || t("publicForm.information")}
                        className="max-h-72 rounded-lg object-contain cursor-pointer"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title || t("publicForm.information") })}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title || t("publicForm.information") })}
                        className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/75 px-2.5 py-1 text-body-xs font-semibold text-white backdrop-blur-xs cursor-pointer hover:bg-black"
                      >
                        <ZoomIn className="size-3" />
                        {t("publicForm.enlarge")}
                      </button>
                    </div>
                  )}

                  <div className={cn("flex items-center gap-3", isFlowing && "hidden")}>
                    <Button
                      ref={setFocusableRef as any}
                      size="lg"
                      onClick={goToNextStep}
                      className="gap-2"
                    >
                      <span>{isLastStep ? t("publicForm.submit") : t("publicForm.next")}</span>
                      <ArrowRight className="size-4" />
                    </Button>
                    <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      {t("publicForm.keyboardEnter")}
                    </span>
                  </div>
                </motion.div>
              );
            })()}

            {/* 4. INDIVIDUAL QUESTION SCREEN */}
            {currentStep?.kind === "question" && (() => {
              const qIdx = currentStep.questionIndex;
              const q = form.questions[qIdx];
              if (!q) return null;

              const qNumber = questionNumberMap.get(qIdx) || 1;
              const answerVal = answers[qIdx];
              const hasAnswer =
                answerVal !== undefined &&
                answerVal !== null &&
                answerVal !== "" &&
                (!Array.isArray(answerVal) || answerVal.length > 0) &&
                (typeof answerVal !== "object" || Object.keys(answerVal).length > 0);

              return (
                <motion.div
                  key={`q-${qIdx}`}
                  data-question-index={qIdx}
                  tabIndex={-1}
                  role="group"
                  aria-label={q.title}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={focusActiveElement}
                  className="space-y-(--related-gap) text-left"
                >
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-brand-primary font-mono text-body-sm pt-0.5">{qNumber}.</span>
                      <h2 className="min-w-0 flex-1 wrap-anywhere font-heading text-body-base font-semibold leading-snug text-foreground">
                        <MathText as="span">{q.title}</MathText>
                        {q.required && <span className="ml-1 text-destructive">*</span>}
                      </h2>
                      {hasAnswer && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleClearAnswer(qIdx)} aria-label={t("publicForm.clearNamed", { title: q.title })} title={t("publicForm.clearQuestionTitle")}>
                          <Eraser className="size-3.5" />
                        </Button>
                      )}
                    </div>
                    {q.description && <MathText as="div" className="text-body-sm text-muted-foreground whitespace-pre-line">{q.description}</MathText>}
                  </div>

                  {/* Question Image Attachment */}
                  {q.imageUrl && (
                    <div className="relative inline-block rounded-xl border border-border bg-card p-2 group">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={q.imageUrl}
                        alt={q.title}
                        className="max-h-60 rounded-lg object-contain cursor-pointer"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title })}
                        className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/75 px-2.5 py-1 text-body-xs font-semibold text-white backdrop-blur-xs cursor-pointer"
                      >
                        <ZoomIn className="size-3" />
                        {t("publicForm.enlarge")}
                      </button>
                    </div>
                  )}

                  {/* Question Input Types */}
                  <div>
                    {/* 1. TEXT */}
                    {q.type === "TEXT" && (
                      <div className="space-y-3">
                        <input
                          ref={setFocusableRef as any}
                          type="text"
                          aria-label={q.title}
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          placeholder={t("publicForm.textPlaceholder")}
                          className="w-full bg-transparent border-b-2 border-border/80 focus:border-brand-primary pb-3 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                        />
                      </div>
                    )}

                    {/* 2. PARAGRAPH */}
                    {q.type === "PARAGRAPH" && (
                      <div className="space-y-2">
                        <textarea
                          ref={setFocusableRef as any}
                          rows={4}
                          aria-label={q.title}
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          placeholder={t("publicForm.paragraphPlaceholder")}
                          className="w-full rounded-md border border-input bg-background p-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground/40 resize-y leading-relaxed"
                        />
                        <p className="text-body-xs text-muted-foreground">
                          {t("publicForm.newLineHelp")}
                        </p>
                      </div>
                    )}

                    {/* 3. RADIO */}
                    {q.type === "RADIO" && (
                      <div className="divide-y divide-border/60 border-y border-border/60">
                        {(q.options || []).map((opt, oIdx) => {
                          const isSelected = answerVal === opt;
                          const letter = OPTION_LETTERS[oIdx] || String(oIdx + 1);

                          return (
                            <button
                              key={oIdx}
                              ref={oIdx === 0 && answerVal !== OTHER_OPTION_MARKER ? (setFocusableRef as any) : undefined}
                              type="button"
                              onClick={() => {
                                handleAnswerChange(qIdx, opt);
                                advanceAfterChoice();
                              }}
                              aria-pressed={isSelected}
                              className={formChoiceRowClass(isSelected)}
                            >
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span
                                  className="w-5 shrink-0 text-center font-mono text-body-xs font-semibold text-muted-foreground"
                                >
                                  {letter}
                                </span>
                                <span className="min-w-0 wrap-anywhere text-body-sm font-medium">
                                  <MathText as="span">{opt}</MathText>
                                </span>
                              </div>
                              {isSelected && <Check className="size-4 shrink-0 text-foreground" aria-hidden />}
                            </button>
                          );
                        })}

                        {q.otherOption?.enabled && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => handleAnswerChange(qIdx, OTHER_OPTION_MARKER)}
                              aria-pressed={answerVal === OTHER_OPTION_MARKER}
                              className={formChoiceRowClass(answerVal === OTHER_OPTION_MARKER)}
                            >
                              <div className="flex min-w-0 items-start gap-2.5">
                                <span
                                  className="w-5 shrink-0 text-center font-mono text-body-xs font-semibold text-muted-foreground"
                                >
                                  {OPTION_LETTERS[q.options?.length || 0] || "•"}
                                </span>
                                <span className="min-w-0 wrap-anywhere text-body-sm font-medium">
                                  <MathText as="span">{q.otherOption.label || t("publicForm.other")}</MathText>
                                </span>
                              </div>
                              {answerVal === OTHER_OPTION_MARKER && <Check className="size-4 shrink-0 text-foreground" aria-hidden />}
                            </button>

                            {answerVal === OTHER_OPTION_MARKER && (
                              <input
                                ref={setFocusableRef as any}
                                type="text"
                                autoFocus
                                value={otherTexts[qIdx] || ""}
                                onChange={(e) => {
                                  otherTextsRef.current[qIdx] = e.target.value;
                                  setOtherTexts((prev) => ({ ...prev, [qIdx]: e.target.value }));
                                }}
                                placeholder={t("publicForm.otherDetailPlaceholder")}
                                className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. CHECKBOX */}
                    {q.type === "CHECKBOX" && (
                      <div className="space-y-2">
                        <p className="text-body-xs font-medium text-muted-foreground">
                          {t("publicForm.chooseAnswers")}
                        </p>
                        <div className="divide-y divide-border/60 border-y border-border/60">
                          {(q.options || []).map((opt, oIdx) => {
                            const selectedList: string[] = Array.isArray(answerVal) ? answerVal : [];
                            const isSelected = selectedList.includes(opt);
                            const letter = OPTION_LETTERS[oIdx] || String(oIdx + 1);

                            return (
                              <button
                                key={oIdx}
                                ref={oIdx === 0 && !selectedList.includes(OTHER_OPTION_MARKER) ? (setFocusableRef as any) : undefined}
                                type="button"
                                onClick={() => handleCheckboxToggle(qIdx, opt)}
                                aria-pressed={isSelected}
                                className={formChoiceRowClass(isSelected)}
                              >
                                <div className="flex min-w-0 items-start gap-2.5">
                                  <span
                                    className="w-5 shrink-0 text-center font-mono text-body-xs font-semibold text-muted-foreground"
                                  >
                                    {letter}
                                  </span>
                                  <span className="min-w-0 wrap-anywhere text-body-sm font-medium">
                                    <MathText as="span">{opt}</MathText>
                                  </span>
                                </div>
                                <div
                                  className={`size-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                                    isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-input bg-background"
                                  }`}
                                >
                                  {isSelected && <Check className="size-3" aria-hidden />}
                                </div>
                              </button>
                            );
                          })}

                          {q.otherOption?.enabled && (
                            <div className="space-y-3">
                              {(() => {
                                const selectedList: string[] = Array.isArray(answerVal) ? answerVal : [];
                                const isSelected = selectedList.includes(OTHER_OPTION_MARKER);

                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const currentList: string[] = Array.isArray(answersRef.current[qIdx])
                                          ? answersRef.current[qIdx]
                                          : [];
                                        const updated = currentList.includes(OTHER_OPTION_MARKER)
                                          ? currentList.filter((item) => item !== OTHER_OPTION_MARKER)
                                          : [...currentList, OTHER_OPTION_MARKER];
                                        answersRef.current[qIdx] = updated;
                                        setAnswers((prev) => ({ ...prev, [qIdx]: updated }));
                                      }}
                                      aria-pressed={isSelected}
                                      className={formChoiceRowClass(isSelected)}
                                    >
                                      <div className="flex min-w-0 items-start gap-2.5">
                                        <span
                                          className="w-5 shrink-0 text-center font-mono text-body-xs font-semibold text-muted-foreground"
                                        >
                                          {OPTION_LETTERS[q.options?.length || 0] || "•"}
                                        </span>
                                        <span className="min-w-0 wrap-anywhere text-body-sm font-medium">
                                          <MathText as="span">{q.otherOption?.label || t("publicForm.other")}</MathText>
                                        </span>
                                      </div>
                                      <div
                                        className={`size-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors ${
                                          isSelected
                                            ? "bg-primary border-primary text-primary-foreground"
                                            : "border-input bg-background"
                                        }`}
                                      >
                                        {isSelected && <Check className="size-3" aria-hidden />}
                                      </div>
                                    </button>

                                    {isSelected && (
                                      <input
                                        ref={setFocusableRef as any}
                                        type="text"
                                        autoFocus
                                        value={otherTexts[qIdx] || ""}
                                        onChange={(e) => {
                                          otherTextsRef.current[qIdx] = e.target.value;
                                          setOtherTexts((prev) => ({ ...prev, [qIdx]: e.target.value }));
                                        }}
                                        placeholder={t("publicForm.otherDetailPlaceholder")}
                                        className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                                      />
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 5. DROP_DOWN */}
                    {q.type === "DROP_DOWN" && (
                      <div className="space-y-2 max-w-md">
                        <Select
                          value={answerVal || ""}
                          onValueChange={(val) => {
                            handleAnswerChange(qIdx, val);
                            if (val !== OTHER_OPTION_MARKER) {
                              advanceAfterChoice();
                            }
                          }}
                        >
                          <SelectTrigger
                            variant="outline"
                            aria-label={q.title}
                            ref={answerVal !== OTHER_OPTION_MARKER ? (setFocusableRef as any) : undefined}
                            className="w-full h-10 text-body-sm font-medium rounded-md"
                          >
                            <SelectValue placeholder={t("publicForm.dropdownPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent className="max-h-56">
                            {(q.options || []).map((opt, oIdx) => (
                              <SelectItem key={oIdx} value={opt} className="text-body-sm py-2.5">
                                {opt}
                              </SelectItem>
                            ))}
                            {q.otherOption?.enabled && (
                              <SelectItem value={OTHER_OPTION_MARKER} className="text-body-sm py-2.5">
                                {q.otherOption.label || t("publicForm.other")}
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>

                        {answerVal === OTHER_OPTION_MARKER && (
                          <input
                            ref={setFocusableRef as any}
                            type="text"
                            autoFocus
                            value={otherTexts[qIdx] || ""}
                            onChange={(e) => {
                              otherTextsRef.current[qIdx] = e.target.value;
                              setOtherTexts((prev) => ({ ...prev, [qIdx]: e.target.value }));
                            }}
                            placeholder={t("publicForm.otherDetailPlaceholder")}
                            className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* 6. FILE_UPLOAD (Modern Dropzone) */}
                    {q.type === "FILE_UPLOAD" && (
                      <div className="space-y-2">
                        <p className="text-body-xs text-muted-foreground">Maksimal {formFileSizeLimitMb(q.maxFileSizeMb)} MB per berkas</p>
                        {!answerVal ? (
                          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input p-(--compact-gap) text-center transition-colors hover:bg-muted/40 focus-within:ring-2 focus-within:ring-ring">
                            <input
                              type="file"
                              accept={formFileAccept(q.allowedFileTypes)}
                              aria-label={q.title}
                              className="sr-only"
                              disabled={uploadingQIdx !== null}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(qIdx, f);
                              }}
                            />
                            {uploadingQIdx === qIdx ? (
                              <div className="flex min-w-0 items-center gap-2">
                                <RefreshCw className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                                <p className="text-body-sm font-semibold text-foreground">
                                  {t("publicForm.uploadingFile", { progress: uploadProgress })}
                                </p>
                              </div>
                            ) : (
                              <div className="flex min-w-0 items-center gap-2">
                                <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                                <p className="text-body-sm font-semibold text-foreground">
                                  {t("publicForm.chooseFile")}
                                </p>

                              </div>
                            )}
                          </label>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2 border-y border-border/60 py-(--row-padding)">
                            <div className="flex min-w-0 flex-1 basis-44 items-start gap-2">
                              <FileCheck2 className="mt-0.5 size-5 shrink-0 text-status-success" aria-hidden />
                              <div className="min-w-0">
                                <p className="text-body-sm font-semibold text-foreground">
                                  {t(isPreview ? "publicForm.fileSelected" : "publicForm.uploadedFile")}
                                </p>
                                <a
                                  href={uploadPreviews.current[qIdx]?.url ?? String(answerVal)}
                                  download={uploadPreviews.current[qIdx]?.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block wrap-anywhere text-body-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                                >
                                  {uploadPreviews.current[qIdx]?.name ?? String(answerVal)}
                                </a>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => handleClearAnswer(qIdx)}
                            >
                              {t("publicForm.replaceFile")}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 7. SCALE (Linear Scale 1-5) */}
                    {q.type === "SCALE" && (
                      <div className="max-w-lg space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
                          <span className="font-semibold">{q.scaleLowLabel || t("publicForm.scaleLow")}</span>
                          <span className="font-semibold">{q.scaleHighLabel || t("publicForm.scaleHigh")}</span>
                        </div>

                        <div className="grid grid-cols-5 divide-x divide-border/60 border-y border-border/60">
                          {[1, 2, 3, 4, 5].map((num) => {
                            const isSelected = answerVal === num.toString();
                            return (
                              <Button
                                key={num}
                                type="button"
                                variant="ghost"
                                aria-pressed={isSelected}
                                onClick={() => {
                                  handleAnswerChange(qIdx, num.toString());
                                  advanceAfterChoice();
                                }}
                                className="min-h-11 rounded-none focus-visible:outline-offset-[-3px] aria-pressed:bg-foreground aria-pressed:text-background"
                              >
                                {num}
                              </Button>
                            );
                          })}
                        </div>
                        <p className={cn("text-body-xs text-muted-foreground", isFlowing && "hidden")}>
                          {t("publicForm.scaleTip")}
                        </p>
                      </div>
                    )}

                    {/* 8. RATING (Stars) */}
                    {q.type === "RATING" && (
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1">
                          {[1, 2, 3, 4, 5].map((starIdx) => {
                            const currentRating = parseInt(answerVal || "0", 10);
                            const isFilled = starIdx <= currentRating;
                            return (
                              <Button
                                key={starIdx}
                                type="button"
                                size="icon-lg"
                                variant="ghost"
                                aria-label={t("publicForm.starRating", { rating: starIdx })}
                                aria-pressed={starIdx === currentRating}
                                onClick={() => {
                                  handleAnswerChange(qIdx, starIdx.toString());
                                  advanceAfterChoice();
                                }}
                                className="size-11"
                              >
                                <Star
                                  className={`size-6 ${
                                    isFilled
                                      ? "fill-status-warning text-status-warning"
                                      : "text-muted-foreground"
                                  }`}
                                  aria-hidden
                                />
                              </Button>
                            );
                          })}
                        </div>
                        {answerVal && (
                          <p className="text-body-xs font-semibold text-foreground">
                            {t("publicForm.starRating", { rating: answerVal })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* 9. GRID_RADIO & 10. GRID_CHECKBOX */}
                    {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                      <div className="overflow-x-auto border-y border-border">
                        <table className="w-full text-left text-body-xs">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground font-semibold">
                              <th scope="col" className="w-1/3 px-2 py-2">{t("publicForm.gridCriteria")}</th>
                              {(q.gridColumns || []).map((col, cIdx) => (
                                <th scope="col" key={cIdx} className="px-2 py-2 text-center font-semibold text-foreground">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {(q.gridRows || []).map((rowName, rIdx) => {
                              const currentObj = typeof answerVal === "object" && !Array.isArray(answerVal) ? answerVal : {};
                              const rowAns = currentObj[rowName];

                              return (
                                <tr key={rIdx} className="hover:bg-muted/20">
                                  <th scope="row" className="px-2 py-2 font-semibold text-foreground">{rowName}</th>
                                  {(q.gridColumns || []).map((colName, cIdx) => {
                                    const isChecked = q.type === "GRID_CHECKBOX"
                                      ? Array.isArray(rowAns) && rowAns.includes(colName)
                                      : rowAns === colName;

                                    return (
                                      <td key={cIdx} className="px-2 py-1 text-center">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="icon-sm"
                                          aria-label={`${rowName}, ${colName}`}
                                          aria-pressed={isChecked}
                                          onClick={() => handleGridChoice(qIdx, rowName, colName, q.type === "GRID_CHECKBOX")}
                                          className="mx-auto aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                                        >
                                          {isChecked && <Check className="size-3.5" aria-hidden />}
                                        </Button>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* 11. DATE */}
                    {q.type === "DATE" && (
                      <div className="flex items-center gap-3 max-w-sm">
                        <Calendar className="size-6 text-brand-primary shrink-0" />
                        <input
                          ref={setFocusableRef as any}
                          type="date"
                          aria-label={q.title}
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          className="w-full rounded-xl border border-input bg-card px-4 py-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                    )}

                    {/* 12. TIME */}
                    {q.type === "TIME" && (
                      <div className="flex items-center gap-3 max-w-sm">
                        <Clock className="size-6 text-brand-primary shrink-0" />
                        <input
                          ref={setFocusableRef as any}
                          type="time"
                          aria-label={q.title}
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          className="w-full rounded-xl border border-input bg-card px-4 py-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                    )}
                  </div>

                </motion.div>
              );
            })()}

              </div>
            ))}
            </motion.div>
          </AnimatePresence>
          {isFlowing && (
            <div className="mt-(--related-gap) flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-(--compact-gap)">
              <Button variant="outline" onClick={goToPrevStep} disabled={stepIndex === 0 || uploadingQIdx !== null}>{t("publicForm.back")}</Button>
              <Button onClick={goToNextStep} disabled={uploadingQIdx !== null || submitting}>
                {isLastStep ? t("publicForm.submit") : t("publicForm.next")}
                {isLastStep ? <Send className="size-4" /> : <ArrowRight className="size-4" />}
              </Button>
            </div>
          )}
        </div>
      </main>

      {!isFlowing && (currentStepIndex > 0 || currentStep?.kind === "question") && (
        <div className="z-30 shrink-0 border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-2xl items-center justify-end gap-2 px-(--page-gutter) py-2">
            <Button variant="ghost" size="lg" onClick={goToPrevStep} disabled={currentStepIndex === 0 || uploadingQIdx !== null || submitting}>
              <ArrowLeft className="size-4" aria-hidden />
              {t("publicForm.back")}
            </Button>
            {currentStep?.kind === "question" && (
              <Button type="button" size="lg" onClick={goToNextStep} disabled={uploadingQIdx !== null || submitting}>
                {isLastStep ? t("publicForm.submit") : t("publicForm.next")}
                {isLastStep ? <Send className="size-4" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
              </Button>
            )}
          </div>
        </div>
      )}

      <Dialog open={confirmSubmitOpen} onOpenChange={(open) => { if (!submitting) setConfirmSubmitOpen(open); }}>
        <DialogContent showCloseButton={false} className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader className="pr-0">
            <DialogTitle>{t("publicForm.confirmTitle")}</DialogTitle>
          </DialogHeader>
          {errorMsg && <p role="alert" className="text-body-xs text-destructive">{errorMsg}</p>}
          <DialogFooter className="flex-row flex-wrap items-center justify-end border-t border-border/55 pt-(--row-padding)">
            <Button variant="ghost" className="h-10" disabled={submitting} onClick={() => setConfirmSubmitOpen(false)}>{t("publicForm.keepEditing")}</Button>
            <Button className="h-10" disabled={submitting} onClick={() => void handleSubmit(true)}>
              {submitting ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
              {submitting ? t("publicForm.submitting") : t("publicForm.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox Zoom Dialog for Question and Section Images */}
      <Dialog
        open={Boolean(zoomImageUri)}
        onOpenChange={(open) => {
          if (!open) setZoomImageUri(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{zoomImageUri?.title || t("publicForm.imagePreview")}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {zoomImageUri && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={zoomImageUri.url}
                alt={zoomImageUri.title}
                className="max-h-[75vh] rounded-xl object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
