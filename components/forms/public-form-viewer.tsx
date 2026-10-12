"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
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
  ChevronUp,
  ChevronDown,
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
} from "@/components/ui/dialog";
import { PageOrnaments } from "@/components/ui/page-ornaments";

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
  };
}

type StepType =
  | { kind: "cover" }
  | { kind: "email" }
  | { kind: "section"; questionIndex: number }
  | { kind: "statement"; questionIndex: number }
  | { kind: "question"; questionIndex: number }
  | { kind: "review" };

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"];

export function PublicFormViewer({
  idOrSlug,
  previewForm,
  isPreview = false,
}: {
  idOrSlug?: string;
  previewForm?: FormPayload;
  isPreview?: boolean;
}) {
  const [form, setForm] = useState<FormPayload | null>(previewForm || null);
  const [loading, setLoading] = useState(!previewForm);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  // Form input answers state (with ref to eliminate race conditions / stale closures)
  const [answers, setAnswers] = useState<Record<number, any>>({});
  const answersRef = useRef<Record<number, any>>({});

  const [uploadingQIdx, setUploadingQIdx] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Email collection state
  const [responderEmail, setResponderEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // "Lainnya" free text state
  const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
  const otherTextsRef = useRef<Record<number, string>>({});

  // Lightbox Image Dialog State
  const [zoomImageUri, setZoomImageUri] = useState<{ url: string; title: string } | null>(null);

  const [isClosed, setIsClosed] = useState(false);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);

  // Typeform Step Navigation State
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
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

  const setFocusableRef = useCallback((el: HTMLElement | null) => {
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
  }, []);

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
          setClosedReason(data.closedReason || "Formulir ini tidak lagi menerima tanggapan.");
        }
      } else {
        setErrorMsg(data.error || "Formulir tidak ditemukan.");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan saat mengambil formulir.");
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

  // Build the unified step sequence
  const steps: StepType[] = useMemo(() => {
    if (!form || !form.questions) return [];
    const list: StepType[] = [];

    // 1. Cover / Welcome Step
    list.push({ kind: "cover" });

    // 2. Email step if collectEmail === "input"
    if (collectEmail === "input") {
      list.push({ kind: "email" });
    }

    // 3. Question, Section & Statement steps
    form.questions.forEach((q, qIdx) => {
      if (q.type === "SECTION") {
        list.push({ kind: "section", questionIndex: qIdx });
      } else if (q.type === "STATEMENT") {
        list.push({ kind: "statement", questionIndex: qIdx });
      } else {
        list.push({ kind: "question", questionIndex: qIdx });
      }
    });

    // 4. Final Review Step
    list.push({ kind: "review" });

    return list;
  }, [form, collectEmail]);

  // Question numbering map (excludes SECTION, STATEMENT, cover, review)
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
  const progressPercent = useMemo(() => {
    if (steps.length <= 1) return 0;
    if (currentStepIndex === 0) return 0;
    if (currentStepIndex >= steps.length - 1) return 100;
    return Math.round((currentStepIndex / (steps.length - 1)) * 100);
  }, [currentStepIndex, steps.length]);

  const currentStep = steps[currentStepIndex];

  // Auto focus input on step change with animation completion fallback
  useEffect(() => {
    const timer = setTimeout(() => {
      focusActiveElement();
    }, 320);
    return () => clearTimeout(timer);
  }, [currentStepIndex, focusActiveElement]);

  const otherLabelFor = (qIdx: number) => form?.questions?.[qIdx]?.otherOption?.label || "Lainnya";

  const handleAnswerChange = (qIdx: number, val: any) => {
    answersRef.current[qIdx] = val;
    setAnswers((prev) => ({ ...prev, [qIdx]: val }));
  };

  const handleClearAnswer = (qIdx: number) => {
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
    toast.success("Pilihan jawaban telah dikosongkan.");
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
    setUploadingQIdx(qIdx);
    setUploadProgress(20);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (form?.title) {
        formData.append("formTitle", form.title);
      }
      if (form?.slug || form?.id) {
        formData.append("formSlug", form.slug || form.id);
      }
      formData.append("questionNumber", String(qIdx + 1));

      const interval = setInterval(() => {
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
        handleAnswerChange(qIdx, data.url);
        toast.success("Berkas berhasil terunggah.");
      } else {
        toast.error(data.error || "Gagal mengunggah berkas.");
      }
    } catch {
      toast.error("Terjadi kesalahan pengunggahan.");
    } finally {
      setUploadingQIdx(null);
      setUploadProgress(0);
    }
  };

  // Step validation before moving to next step
  const validateCurrentStep = (): boolean => {
    if (!form || !currentStep) return true;

    if (currentStep.kind === "email") {
      const trimmed = responderEmail.trim();
      if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setEmailError("Alamat email wajib diisi dengan format yang benar.");
        return false;
      }
      setEmailError(null);
      return true;
    }

    if (currentStep.kind === "question") {
      const qIdx = currentStep.questionIndex;
      const q = form.questions[qIdx];
      if (!q) return true;

      // Read from synchronous ref to avoid stale closure race conditions
      const userAns = answersRef.current[qIdx];
      const otherTextVal = otherTextsRef.current[qIdx] || otherTexts[qIdx];
      const isOtherEmpty =
        (userAns === OTHER_OPTION_MARKER ||
          (Array.isArray(userAns) && userAns.includes(OTHER_OPTION_MARKER))) &&
        !(otherTextVal && otherTextVal.trim().length > 0);

      if (q.required) {
        const isEmpty =
          userAns === undefined ||
          userAns === null ||
          userAns === "" ||
          (Array.isArray(userAns) && userAns.length === 0);

        if (isEmpty || isOtherEmpty) {
          toast.error(
            isOtherEmpty
              ? `Jelaskan jawaban opsi lainnya untuk pertanyaan ini.`
              : `Pertanyaan ini wajib diisi sebelum melanjutkan.`
          );
          return false;
        }
      } else if (isOtherEmpty) {
        toast.error(`Jelaskan jawaban opsi lainnya untuk pertanyaan ini.`);
        return false;
      }
    }

    return true;
  };

  const resetScroll = () => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const goToNextStep = () => {
    if (!validateCurrentStep()) return;
    if (currentStepIndex < steps.length - 1) {
      setDirection(1);
      setCurrentStepIndex((prev) => prev + 1);
      resetScroll();
    }
  };

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setDirection(-1);
      setCurrentStepIndex((prev) => prev - 1);
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

  const handleSubmit = async () => {
    if (!form) return;

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
      const isEmpty =
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);

      if (hasEmptyOther || (question.required && isEmpty)) {
        const stepTarget = steps.findIndex(
          (s) => s.kind === "question" && s.questionIndex === qIdx
        );
        if (stepTarget >= 0) {
          jumpToStep(stepTarget);
        }
        toast.error(
          hasEmptyOther
            ? `Jelaskan pilihan lainnya untuk: "${question.title || `Pertanyaan #${questionNumberMap.get(qIdx) || qIdx + 1}`}"`
            : `Harap isi pertanyaan wajib: "${question.title || `Pertanyaan #${questionNumberMap.get(qIdx) || qIdx + 1}`}"`
        );
        return;
      }
    }

    const trimmedEmail = responderEmail.trim();
    if (collectEmail === "input") {
      if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        const emailStepTarget = steps.findIndex((s) => s.kind === "email");
        if (emailStepTarget >= 0) jumpToStep(emailStepTarget);
        setEmailError("Alamat email wajib diisi dengan format yang benar.");
        toast.error("Alamat email wajib diisi dengan format yang benar.");
        return;
      }
      setEmailError(null);
    }

    if (isPreview) {
      answersRef.current = {};
      otherTextsRef.current = {};
      setAnswers({});
      setOtherTexts({});
      setResponderEmail("");
      setEmailError(null);
      setCurrentStepIndex(0);
      setSubmittedMessage(
        form?.settings?.customSuccessMessage || "Jawaban Anda telah berhasil disimpan (Mode Pratinjau)."
      );
      toast.success("Mode Pratinjau: Simulasi pengisian berhasil.");
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
        setErrorMsg(data.error || "Anda harus login ke akun Zyx untuk mengisi formulir ini.");
      } else if (data.success) {
        answersRef.current = {};
        otherTextsRef.current = {};
        setAnswers({});
        setOtherTexts({});
        setResponderEmail("");
        setEmailError(null);
        setCurrentStepIndex(0);
        setSubmittedMessage(data.message || form?.settings?.customSuccessMessage || "Tanggapan Anda telah berhasil disimpan.");
      } else {
        toast.error(data.error || "Gagal mengirim formulir.");
        setErrorMsg(data.error || "Gagal mengirim formulir.");
      }
    } catch (err: any) {
      toast.error(err.message || "Terjadi kesalahan jaringan.");
      setErrorMsg(err.message || "Terjadi kesalahan jaringan.");
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextarea = target?.tagName === "TEXTAREA";
      const isInput = target?.tagName === "INPUT";

      // Ctrl + Enter or Cmd + Enter to submit form
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
        return;
      }

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
              setTimeout(() => {
                goToNextStep();
              }, 180);
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
            setTimeout(() => {
              goToNextStep();
            }, 180);
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
      y: dir > 0 ? 32 : -32,
      opacity: 0,
      filter: "blur(4px)",
    }),
    center: {
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        y: { type: "spring" as const, stiffness: 350, damping: 30 },
        opacity: { duration: 0.25 },
        filter: { duration: 0.2 },
      },
    },
    exit: (dir: number) => ({
      y: dir > 0 ? -32 : 32,
      opacity: 0,
      filter: "blur(4px)",
      transition: {
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
            Memuat formulir...
          </p>
        </div>
      </div>
    );
  }

  if (loginRequired) {
    return (
      <div className="relative flex h-screen h-[100dvh] items-center justify-center p-4 overflow-hidden bg-background">
        <PageOrnaments variant="plans" />
        <div className="mx-auto max-w-md w-full rounded-2xl border border-border bg-card p-8 shadow-sm text-center space-y-5">
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <AlertCircle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-h5 font-bold text-foreground">Login Diperlukan</h1>
            <p className="text-body-sm text-muted-foreground">
              {errorMsg || "Anda harus masuk ke akun Zyx terlebih dahulu untuk mengisi formulir ini."}
            </p>
          </div>
          <Button asChild size="lg" className="w-full font-bold">
            <Link href="/login">Masuk ke Akun Zyx</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (errorMsg && !form) {
    return (
      <div className="relative flex h-screen h-[100dvh] items-center justify-center p-4 overflow-hidden bg-background">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 mx-auto max-w-md w-full rounded-2xl border border-border bg-card/95 backdrop-blur-md p-8 shadow-sm text-center space-y-5">
          <div className="size-12 rounded-xl bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <AlertCircle className="size-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-heading text-h5 font-bold text-foreground">Formulir Tidak Ditemukan</h1>
            <p className="text-body-sm text-muted-foreground">{errorMsg || "Formulir ini mungkin telah dihapus atau tautan tidak valid."}</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/">Kembali ke Beranda</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isClosed && form) {
    return (
      <div className="relative flex h-screen h-[100dvh] items-center justify-center p-4 overflow-hidden bg-background">
        <PageOrnaments variant="plans" />
        <div className="relative z-10 mx-auto max-w-lg w-full rounded-2xl border border-border bg-card/95 backdrop-blur-md p-8 shadow-sm text-center space-y-5 border-t-4 border-t-status-warning">
          <span className="inline-block rounded-md bg-status-warning/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-status-warning">
            Formulir Ditutup
          </span>
          <h1 className="font-heading text-h5 font-bold text-foreground">{form.title}</h1>
          <p className="text-body-sm text-muted-foreground whitespace-pre-line border-t border-border/40 pt-4">
            {closedReason || "Formulir ini telah ditutup dan tidak lagi menerima tanggapan baru."}
          </p>
          <Button asChild variant="outline">
            <Link href="/">Kembali ke Beranda</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (submittedMessage && form) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center p-4 overflow-hidden bg-background",
          isPreview ? "min-h-[500px] rounded-xl border border-border" : "h-screen h-[100dvh]"
        )}
      >
        <PageOrnaments variant="testimonial" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mx-auto max-w-lg w-full rounded-2xl border border-border bg-card/95 backdrop-blur-md p-8 sm:p-10 shadow-sm text-center space-y-6"
        >
          <div className="size-16 rounded-2xl bg-status-success/15 text-status-success flex items-center justify-center mx-auto shadow-inner">
            <Check className="size-8 stroke-[2.5]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-heading text-h5 font-bold text-foreground">Terima Kasih!</h1>
            <p className="text-body-sm text-muted-foreground whitespace-pre-line">
              {submittedMessage}
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={() => {
                setSubmittedMessage(null);
                setCurrentStepIndex(0);
              }}
              variant="outline"
              className="w-full sm:w-auto font-medium"
            >
              {isPreview ? "Ulangi Pratinjau" : "Isi Formulir Lagi"}
            </Button>
            {!isPreview && (
              <Button asChild className="w-full sm:w-auto font-semibold">
                <Link href="/">Selesai</Link>
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
      {/* Background Math Symbols, Radial Glows & Geometric Ornaments */}
      <PageOrnaments variant="plans" />

      {/* Top Fixed Minimal Progress Header */}
      <header className="shrink-0 z-40 w-full backdrop-blur-md bg-background/85 border-b border-border/40">
        <div className="h-1 w-full bg-muted/60">
          <motion.div
            className="h-full bg-brand-primary"
            initial={false}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          />
        </div>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-12 flex items-center justify-between text-body-xs font-semibold text-muted-foreground">
          <span className="truncate max-w-[220px] sm:max-w-md font-medium text-foreground">
            {form.title}
          </span>
          <div className="flex items-center gap-3 shrink-0">
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
      <main ref={mainScrollRef} className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-8 sm:py-10 flex flex-col">
        <div className="w-full max-w-2xl mx-auto my-auto shrink-0">
          <AnimatePresence mode="wait" custom={direction}>
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
                className="space-y-6 text-left"
              >
                <div className="inline-flex items-center gap-2 rounded-md bg-brand-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                  <Tag className="size-3.5" />
                  {form.category}
                </div>

                <h1 className="font-heading text-h5 font-bold text-foreground tracking-tight leading-tight">
                  <MathText as="span">{form.title}</MathText>
                </h1>

                {form.description && (
                  <div className="text-body-base text-muted-foreground whitespace-pre-line leading-relaxed">
                    <MathText as="div">{form.description}</MathText>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-body-xs text-muted-foreground font-medium pt-2">
                  <span>~{Math.max(1, Math.round(totalQuestions * 0.5))} menit pengisian</span>
                  <span>•</span>
                  <span>{totalQuestions} pertanyaan</span>
                </div>

                <div className="pt-4 flex items-center gap-4">
                  <Button
                    ref={setFocusableRef as any}
                    size="lg"
                    onClick={goToNextStep}
                    className="h-12 px-7 text-body-sm font-bold shadow-sm inline-flex items-center gap-2 group cursor-pointer"
                  >
                    <span>Mulai Isi Formulir</span>
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                    Tekan <strong className="font-semibold text-foreground">Enter ↵</strong>
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
                className="space-y-6 text-left"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-brand-primary font-mono text-body-sm font-bold">
                    <span>*</span>
                    <span>Identifikasi Responden</span>
                  </div>
                  <h2 className="font-heading text-body-base font-semibold text-foreground leading-snug">
                    Alamat Email Anda
                  </h2>
                  <p className="text-body-sm text-muted-foreground">
                    Email digunakan untuk konfirmasi identitas dan verifikasi tanggapan.
                  </p>
                </div>

                <div className="space-y-2">
                  <input
                    ref={setFocusableRef as any}
                    type="email"
                    required
                    value={responderEmail}
                    onChange={(e) => {
                      setResponderEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    placeholder="nama@email.com"
                    className="w-full bg-transparent border-b-2 border-border/80 focus:border-brand-primary pb-3 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                  />
                  {emailError && (
                    <p className="flex items-center gap-1.5 text-body-xs font-semibold text-destructive pt-1">
                      <AlertCircle className="size-3.5 shrink-0" />
                      {emailError}
                    </p>
                  )}
                </div>

                <div className="pt-4 flex items-center gap-3">
                  <Button
                    size="lg"
                    onClick={goToNextStep}
                    className="h-11 px-6 text-body-sm font-bold shadow-sm cursor-pointer"
                  >
                    <span>Lanjut</span>
                    <Check className="size-4 ml-1.5" />
                  </Button>
                  <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                    Tekan <strong className="font-semibold text-foreground">Enter ↵</strong>
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
                  className="space-y-6 text-left"
                >
                  <div className="inline-flex items-center gap-2 rounded-md bg-brand-secondary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                    <Layers className="size-3.5" />
                    {hasUpcomingQuestions ? "Bagian Baru" : "Penutup"}
                  </div>

                  <h2 className="font-heading text-body-base font-bold text-foreground tracking-tight leading-tight">
                    <MathText as="span">{q.title || "Bagian Formulir"}</MathText>
                  </h2>

                  {q.description && (
                    <div className="text-body-base text-muted-foreground whitespace-pre-line leading-relaxed">
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
                        Perbesar
                      </button>
                    </div>
                  )}

                  <div className="pt-4 flex items-center gap-4">
                    <Button
                      ref={setFocusableRef as any}
                      size="lg"
                      onClick={goToNextStep}
                      className="h-12 px-7 text-body-sm font-bold shadow-sm inline-flex items-center gap-2 bg-brand-primary text-white cursor-pointer"
                    >
                      <span>Lanjut</span>
                      <ArrowRight className="size-4" />
                    </Button>
                    <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      Tekan <strong className="font-semibold text-foreground">Enter ↵</strong>
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
                  className="space-y-6 text-left"
                >
                  <div className="inline-flex items-center gap-2 rounded-md bg-brand-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                    <Info className="size-3.5" />
                    Informasi
                  </div>

                  {q.title && (
                    <h2 className="font-heading text-body-base sm:text-h5 font-bold text-foreground tracking-tight leading-tight">
                      <MathText as="span">{q.title}</MathText>
                    </h2>
                  )}

                  {q.description && (
                    <div className="text-body-base text-muted-foreground whitespace-pre-line leading-relaxed">
                      <MathText as="div">{q.description}</MathText>
                    </div>
                  )}

                  {q.imageUrl && (
                    <div className="relative inline-block rounded-xl border border-border bg-card p-2 group max-w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={q.imageUrl}
                        alt={q.title || "Ilustrasi Informasi"}
                        className="max-h-72 rounded-lg object-contain cursor-pointer"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title || "Informasi" })}
                      />
                      <button
                        type="button"
                        onClick={() => setZoomImageUri({ url: q.imageUrl!, title: q.title || "Informasi" })}
                        className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-md bg-black/75 px-2.5 py-1 text-body-xs font-semibold text-white backdrop-blur-xs cursor-pointer hover:bg-black"
                      >
                        <ZoomIn className="size-3" />
                        Perbesar
                      </button>
                    </div>
                  )}

                  <div className="pt-4 flex items-center gap-4">
                    <Button
                      ref={setFocusableRef as any}
                      size="lg"
                      onClick={goToNextStep}
                      className="h-12 px-7 text-body-sm font-bold shadow-sm inline-flex items-center gap-2 bg-brand-primary text-white cursor-pointer"
                    >
                      <span>Lanjut</span>
                      <ArrowRight className="size-4" />
                    </Button>
                    <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      Tekan <strong className="font-semibold text-foreground">Enter ↵</strong>
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
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  onAnimationComplete={focusActiveElement}
                  className="space-y-6 text-left"
                >
                  {/* Question Header */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-brand-primary font-mono text-body-sm font-bold">
                        <span>{qNumber}</span>
                        <ArrowRight className="size-3.5 inline" />
                        {q.required && <span className="text-destructive font-bold">*</span>}
                      </div>

                      {/* Clear Answer Button Header Link */}
                      {hasAnswer && (
                        <button
                          type="button"
                          onClick={() => handleClearAnswer(qIdx)}
                          title="Kosongkan jawaban untuk pertanyaan ini"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-body-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                        >
                          <Eraser className="size-3" />
                          <span>Kosongkan Pilihan</span>
                        </button>
                      )}
                    </div>

                    <h2 className="font-heading text-body-base font-semibold text-foreground leading-snug">
                      <MathText as="span">{q.title}</MathText>
                    </h2>

                    {q.description && (
                      <div className="text-body-base text-muted-foreground leading-relaxed whitespace-pre-line">
                        <MathText as="div">{q.description}</MathText>
                      </div>
                    )}
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
                        Perbesar
                      </button>
                    </div>
                  )}

                  {/* Question Input Types */}
                  <div className="pt-2">
                    {/* 1. TEXT */}
                    {q.type === "TEXT" && (
                      <div className="space-y-3">
                        <input
                          ref={setFocusableRef as any}
                          type="text"
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          placeholder="Ketik jawaban Anda di sini..."
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
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          placeholder="Tuliskan jawaban lengkap Anda di sini..."
                          className="w-full rounded-xl border border-input bg-card/60 p-4 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring placeholder:text-muted-foreground/40 resize-y leading-relaxed"
                        />
                        <p className="text-body-xs text-muted-foreground">
                          Gunakan <strong className="font-semibold text-foreground">Shift + Enter</strong> untuk membuat baris baru.
                        </p>
                      </div>
                    )}

                    {/* 3. RADIO (Multiple Choice Cards) */}
                    {q.type === "RADIO" && (
                      <div className="space-y-3">
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
                                setTimeout(() => {
                                  goToNextStep();
                                }, 180);
                              }}
                              className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all cursor-pointer group ${
                                isSelected
                                  ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary text-foreground"
                                  : "border-border bg-card hover:border-brand-primary/50 hover:bg-muted/40 text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <span
                                  className={`size-7 rounded-lg text-body-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? "bg-brand-primary text-white"
                                      : "bg-muted text-muted-foreground group-hover:bg-brand-primary/20 group-hover:text-brand-primary"
                                  }`}
                                >
                                  {letter}
                                </span>
                                <span className="text-body-sm font-medium">{opt}</span>
                              </div>
                              {isSelected && <Check className="size-5 text-brand-primary shrink-0" />}
                            </button>
                          );
                        })}

                        {q.otherOption?.enabled && (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={() => handleAnswerChange(qIdx, OTHER_OPTION_MARKER)}
                              className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all cursor-pointer group ${
                                answerVal === OTHER_OPTION_MARKER
                                  ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary text-foreground"
                                  : "border-border bg-card hover:border-brand-primary/50 hover:bg-muted/40 text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <span
                                  className={`size-7 rounded-lg text-body-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                                    answerVal === OTHER_OPTION_MARKER
                                      ? "bg-brand-primary text-white"
                                      : "bg-muted text-muted-foreground group-hover:bg-brand-primary/20 group-hover:text-brand-primary"
                                  }`}
                                >
                                  {OPTION_LETTERS[q.options?.length || 0] || "•"}
                                </span>
                                <span className="text-body-sm font-medium">
                                  {q.otherOption.label || "Lainnya"}
                                </span>
                              </div>
                              {answerVal === OTHER_OPTION_MARKER && <Check className="size-5 text-brand-primary shrink-0" />}
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
                                placeholder="Tuliskan rincian jawaban Anda..."
                                className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. CHECKBOX (Multi-Select Cards) */}
                    {q.type === "CHECKBOX" && (
                      <div className="space-y-3">
                        <p className="text-body-xs text-muted-foreground uppercase tracking-wider font-semibold">
                          Pilih satu atau beberapa jawaban yang sesuai
                        </p>
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
                              className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all cursor-pointer group ${
                                isSelected
                                  ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary text-foreground"
                                  : "border-border bg-card hover:border-brand-primary/50 hover:bg-muted/40 text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-3.5">
                                <span
                                  className={`size-7 rounded-lg text-body-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? "bg-brand-primary text-white"
                                      : "bg-muted text-muted-foreground group-hover:bg-brand-primary/20 group-hover:text-brand-primary"
                                  }`}
                                >
                                  {letter}
                                </span>
                                <span className="text-body-sm font-medium">{opt}</span>
                              </div>
                              <div
                                className={`size-5 rounded-md border flex items-center justify-center transition-colors ${
                                  isSelected
                                    ? "bg-brand-primary border-brand-primary text-white"
                                    : "border-input bg-background"
                                }`}
                              >
                                {isSelected && <Check className="size-3.5 stroke-[3]" />}
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
                                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all cursor-pointer group ${
                                      isSelected
                                        ? "border-brand-primary bg-brand-primary/10 ring-1 ring-brand-primary text-foreground"
                                        : "border-border bg-card hover:border-brand-primary/50 hover:bg-muted/40 text-foreground"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3.5">
                                      <span
                                        className={`size-7 rounded-lg text-body-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                                          isSelected
                                            ? "bg-brand-primary text-white"
                                            : "bg-muted text-muted-foreground group-hover:bg-brand-primary/20 group-hover:text-brand-primary"
                                        }`}
                                      >
                                        {OPTION_LETTERS[q.options?.length || 0] || "•"}
                                      </span>
                                      <span className="text-body-sm font-medium">
                                        {q.otherOption?.label || "Lainnya"}
                                      </span>
                                    </div>
                                    <div
                                      className={`size-5 rounded-md border flex items-center justify-center transition-colors ${
                                        isSelected
                                          ? "bg-brand-primary border-brand-primary text-white"
                                          : "border-input bg-background"
                                      }`}
                                    >
                                      {isSelected && <Check className="size-3.5 stroke-[3]" />}
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
                                      placeholder="Tuliskan rincian jawaban lainnya..."
                                      className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                                    />
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 5. DROP_DOWN */}
                    {q.type === "DROP_DOWN" && (
                      <div className="space-y-3 max-w-md">
                        <Select
                          value={answerVal || ""}
                          onValueChange={(val) => {
                            handleAnswerChange(qIdx, val);
                            if (val !== OTHER_OPTION_MARKER) {
                              setTimeout(() => goToNextStep(), 180);
                            }
                          }}
                        >
                          <SelectTrigger
                            ref={answerVal !== OTHER_OPTION_MARKER ? (setFocusableRef as any) : undefined}
                            className="w-full h-12 text-body-sm font-medium rounded-xl"
                          >
                            <SelectValue placeholder="Pilih salah satu opsi..." />
                          </SelectTrigger>
                          <SelectContent className="max-h-56">
                            {(q.options || []).map((opt, oIdx) => (
                              <SelectItem key={oIdx} value={opt} className="text-body-sm py-2.5">
                                {opt}
                              </SelectItem>
                            ))}
                            {q.otherOption?.enabled && (
                              <SelectItem value={OTHER_OPTION_MARKER} className="text-body-sm py-2.5">
                                {q.otherOption.label || "Lainnya"}
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
                            placeholder="Tuliskan rincian jawaban Anda..."
                            className="w-full bg-transparent border-b-2 border-brand-primary pb-2 font-heading text-body-sm text-foreground focus:outline-none placeholder:text-muted-foreground/40 transition-colors"
                          />
                        )}
                      </div>
                    )}

                    {/* 6. FILE_UPLOAD (Modern Dropzone) */}
                    {q.type === "FILE_UPLOAD" && (
                      <div className="space-y-4">
                        {!answerVal ? (
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-brand-primary/60 bg-card hover:bg-muted/30 rounded-2xl p-8 transition-colors cursor-pointer text-center group">
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingQIdx === qIdx}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleFileUpload(qIdx, f);
                              }}
                            />
                            {uploadingQIdx === qIdx ? (
                              <div className="space-y-3">
                                <RefreshCw className="size-8 animate-spin text-brand-primary mx-auto" />
                                <p className="text-body-sm font-semibold text-foreground">
                                  Mengunggah ke penyimpanan Zyx ({uploadProgress}%)...
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="size-12 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                  <UploadCloud className="size-6" />
                                </div>
                                <p className="text-body-sm font-semibold text-foreground">
                                  Klik atau Seret Berkas ke Sini
                                </p>
                                <p className="text-body-xs text-muted-foreground">
                                  Mendukung dokumen, PDF, gambar, atau berkas tugas
                                </p>
                              </div>
                            )}
                          </label>
                        ) : (
                          <div className="rounded-2xl border border-status-success/40 bg-status-success/10 p-5 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <FileCheck2 className="size-7 text-status-success shrink-0" />
                              <div className="overflow-hidden">
                                <p className="text-body-sm font-bold text-foreground truncate">
                                  Berkas Berhasil Terunggah
                                </p>
                                <a
                                  href={String(answerVal)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-body-xs font-mono text-brand-primary hover:underline truncate block"
                                >
                                  {String(answerVal)}
                                </a>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleClearAnswer(qIdx)}
                              className="shrink-0 text-body-xs"
                            >
                              Ganti Berkas
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 7. SCALE (Linear Scale 1-5) */}
                    {q.type === "SCALE" && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
                          <span className="font-semibold">{q.scaleLowLabel || "1 (Sangat Buruk)"}</span>
                          <span className="font-semibold">{q.scaleHighLabel || "5 (Sangat Baik)"}</span>
                        </div>

                        <div className="grid grid-cols-5 gap-2.5 sm:gap-4 max-w-lg">
                          {[1, 2, 3, 4, 5].map((num) => {
                            const isSelected = answerVal === num.toString();
                            return (
                              <button
                                key={num}
                                type="button"
                                onClick={() => {
                                  handleAnswerChange(qIdx, num.toString());
                                  setTimeout(() => goToNextStep(), 180);
                                }}
                                className={`h-14 rounded-xl border font-heading text-body-sm font-bold transition-all cursor-pointer flex items-center justify-center ${
                                  isSelected
                                    ? "border-brand-primary bg-brand-primary text-white shadow-sm scale-105"
                                    : "border-border bg-card hover:border-brand-primary/60 hover:bg-muted text-foreground"
                                }`}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-body-xs text-muted-foreground">
                          Tip: Anda juga dapat menekan angka <strong className="font-semibold text-foreground">1-5</strong> di keyboard.
                        </p>
                      </div>
                    )}

                    {/* 8. RATING (Stars) */}
                    {q.type === "RATING" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          {[1, 2, 3, 4, 5].map((starIdx) => {
                            const currentRating = parseInt(answerVal || "0", 10);
                            const isFilled = starIdx <= currentRating;
                            return (
                              <button
                                key={starIdx}
                                type="button"
                                onClick={() => {
                                  handleAnswerChange(qIdx, starIdx.toString());
                                  setTimeout(() => goToNextStep(), 180);
                                }}
                                className="p-1 cursor-pointer transition-transform hover:scale-125 focus:outline-none"
                              >
                                <Star
                                  className={`size-10 ${
                                    isFilled
                                      ? "fill-status-warning text-status-warning drop-shadow-sm"
                                      : "text-muted-foreground/30 hover:text-status-warning/60"
                                  } transition-colors`}
                                />
                              </button>
                            );
                          })}
                        </div>
                        {answerVal && (
                          <p className="text-body-xs font-semibold text-foreground">
                            {answerVal} dari 5 Bintang
                          </p>
                        )}
                      </div>
                    )}

                    {/* 9. GRID_RADIO & 10. GRID_CHECKBOX */}
                    {(q.type === "GRID_RADIO" || q.type === "GRID_CHECKBOX") && (
                      <div className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
                        <table className="w-full text-left text-body-xs">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground font-semibold">
                              <th className="p-3 w-1/3">Kriteria</th>
                              {(q.gridColumns || []).map((col, cIdx) => (
                                <th key={cIdx} className="p-3 text-center text-foreground font-bold">
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
                                  <td className="p-3 font-semibold text-foreground">{rowName}</td>
                                  {(q.gridColumns || []).map((colName, cIdx) => {
                                    const isChecked = q.type === "GRID_CHECKBOX"
                                      ? Array.isArray(rowAns) && rowAns.includes(colName)
                                      : rowAns === colName;

                                    return (
                                      <td key={cIdx} className="p-3 text-center">
                                        <button
                                          type="button"
                                          onClick={() => handleGridChoice(qIdx, rowName, colName, q.type === "GRID_CHECKBOX")}
                                          className={`size-6 mx-auto rounded-md border flex items-center justify-center transition-colors cursor-pointer ${
                                            isChecked
                                              ? "bg-brand-primary border-brand-primary text-white"
                                              : "border-input bg-background hover:border-brand-primary"
                                          }`}
                                        >
                                          {isChecked && <Check className="size-3.5 stroke-[3]" />}
                                        </button>
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
                          required={q.required}
                          value={answerVal || ""}
                          onChange={(e) => handleAnswerChange(qIdx, e.target.value)}
                          className="w-full rounded-xl border border-input bg-card px-4 py-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                    )}
                  </div>

                  {/* Primary OK / Lanjut Button */}
                  <div className="pt-4 flex items-center gap-3">
                    <Button
                      size="lg"
                      onClick={goToNextStep}
                      className="h-11 px-6 text-body-sm font-bold shadow-sm cursor-pointer inline-flex items-center gap-2"
                    >
                      <span>OK</span>
                      <Check className="size-4" />
                    </Button>
                    <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                      Tekan <strong className="font-semibold text-foreground">Enter ↵</strong>
                    </span>
                  </div>
                </motion.div>
              );
            })()}

            {/* 5. REVIEW & SUBMIT SCREEN */}
            {currentStep?.kind === "review" && (
              <motion.div
                key="review"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={focusActiveElement}
                className="space-y-6 text-left"
              >
                <div className="space-y-2">
                  <span className="inline-block rounded-md bg-brand-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-primary">
                    Tahap Akhir
                  </span>
                  <h2 className="font-heading text-body-base font-bold text-foreground">
                    Tinjau Jawaban Anda
                  </h2>
                  <p className="text-body-sm text-muted-foreground">
                    Periksa kembali tanggapan Anda sebelum mengirimkan formulir ini.
                  </p>
                </div>

                {/* Answers Summary List */}
                <div className="rounded-2xl border border-border bg-card divide-y divide-border/60 max-h-[50vh] overflow-y-auto p-2">
                  {collectEmail === "input" && (
                    <div className="p-3.5 flex items-center justify-between gap-3 text-body-sm">
                      <div>
                        <p className="font-semibold text-foreground">Alamat Email</p>
                        <p className="text-muted-foreground font-mono text-body-xs">{responderEmail || "-"}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const emailIdx = steps.findIndex((s) => s.kind === "email");
                          if (emailIdx >= 0) jumpToStep(emailIdx);
                        }}
                        className="text-body-xs font-semibold text-brand-primary"
                      >
                        Ubah
                      </Button>
                    </div>
                  )}

                  {form.questions.map((q, qIdx) => {
                    if (q.type === "SECTION" || q.type === "STATEMENT") return null;
                    const ans = answersRef.current[qIdx] ?? answers[qIdx];
                    const otherTextVal = otherTextsRef.current[qIdx] ?? otherTexts[qIdx];
                    const stepIdx = steps.findIndex(
                      (s) => s.kind === "question" && s.questionIndex === qIdx
                    );

                    let displayAns = "-";
                    if (ans !== undefined && ans !== null && ans !== "") {
                      if (Array.isArray(ans)) {
                        displayAns = ans
                          .map((a) => (a === OTHER_OPTION_MARKER ? otherTextVal || otherLabelFor(qIdx) : a))
                          .join(", ");
                      } else if (ans === OTHER_OPTION_MARKER) {
                        displayAns = otherTextVal || otherLabelFor(qIdx);
                      } else if (typeof ans === "object") {
                        displayAns = Object.entries(ans)
                          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
                          .join(" | ");
                      } else {
                        displayAns = String(ans);
                      }
                    }

                    return (
                      <div key={qIdx} className="p-3.5 flex items-start justify-between gap-3 text-body-sm">
                        <div className="space-y-0.5 max-w-[80%]">
                          <p className="font-semibold text-foreground">
                            {questionNumberMap.get(qIdx) || qIdx + 1}. {q.title}
                          </p>
                          <p className="text-muted-foreground text-body-xs truncate">
                            {displayAns}
                          </p>
                        </div>
                        {stepIdx >= 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => jumpToStep(stepIdx)}
                            className="text-body-xs font-semibold text-brand-primary shrink-0"
                          >
                            Ubah
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Final Submit Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
                  <Button
                    ref={setFocusableRef as any}
                    size="lg"
                    disabled={submitting}
                    onClick={handleSubmit}
                    className="w-full sm:w-auto h-12 px-8 text-body-sm font-bold shadow-sm inline-flex items-center justify-center gap-2 bg-brand-primary text-white cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <RefreshCw className="size-4 animate-spin" />
                        <span>Mengirimkan Tanggapan...</span>
                      </>
                    ) : (
                      <>
                        <Send className="size-4" />
                        <span>Kirimkan Tanggapan</span>
                      </>
                    )}
                  </Button>
                  <span className="hidden sm:inline-flex items-center gap-1 text-body-xs text-muted-foreground">
                    Tekan <strong className="font-semibold text-foreground">Ctrl + Enter</strong> untuk kirim
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Floating Bottom Navigation Dock (Fixed to viewport bottom edge) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 w-full p-4 sm:p-6 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          {currentStepIndex > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevStep}
              className="rounded-lg shadow-md font-medium text-body-xs inline-flex items-center gap-1 bg-background/95 backdrop-blur-md"
            >
              <ArrowLeft className="size-3.5" />
              <span>Kembali</span>
            </Button>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/95 backdrop-blur-md p-1 shadow-md">
          <button
            type="button"
            disabled={currentStepIndex === 0}
            onClick={goToPrevStep}
            title="Pertanyaan Sebelumnya"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronUp className="size-4" />
          </button>
          <div className="h-4 w-px bg-border" />
          <button
            type="button"
            disabled={currentStepIndex === steps.length - 1}
            onClick={goToNextStep}
            title="Pertanyaan Berikutnya"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 cursor-pointer transition-colors"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
      </div>

      {/* Lightbox Zoom Dialog for Question and Section Images */}
      <Dialog
        open={Boolean(zoomImageUri)}
        onOpenChange={(open) => {
          if (!open) setZoomImageUri(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{zoomImageUri?.title || "Pratinjau Gambar"}</DialogTitle>
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
