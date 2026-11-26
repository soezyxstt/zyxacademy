"use client";

import { useRef, useState } from "react";
import { Star, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { submitStudentFeedbackAction, type StudentFeedbackInput } from "./actions";
import { useTranslations } from "@/lib/i18n/client";

import { useStudentExperience } from "@/components/student-experience-provider";

const CATEGORIES: Array<{ id: StudentFeedbackInput["category"]; key: string }> = [
  { id: "materi", key: "categoryCourseMaterials" },
  { id: "kuis", key: "categoryQuizzes" },
  { id: "tutor", key: "categoryTutor" },
  { id: "fitur", key: "categoryPlatform" },
  { id: "lainnya", key: "categoryOther" },
];

export function FeedbackForm({ initialEmail }: { initialEmail?: string }) {
  const t = useTranslations("student");
  const experience = useStudentExperience();
  const [category, setCategory] = useState<StudentFeedbackInput["category"]>("materi");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [email, setEmail] = useState(initialEmail || "");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [messageError, setMessageError] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const submitting = useRef(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting.current) return;

    // Read the form itself so browser-restored or autofilled drafts can submit
    // even when the browser has not emitted a React change event.
    const formData = new FormData(e.currentTarget);
    const submittedMessage = String(formData.get("message") ?? "").trim();
    const submittedEmail = String(formData.get("email") ?? "").trim();
    setEmail(String(formData.get("email") ?? ""));
    setSubmissionError(null);
    if (submittedMessage.length < 5) {
      setMessageError(true);
      messageInput.current?.focus();
      return;
    }
    setMessageError(false);

    if (experience.mode === "demo") {
      setSubmissionError(t("feedback.signInRequired"));
      return;
    }
    submitting.current = true;
    setLoading(true);
    try {
      const res = await submitStudentFeedbackAction({
        category,
        rating,
        message: submittedMessage,
        email: submittedEmail || undefined,
      });

      if (res.success) {
        setSubmitted(true);
        toast.success(t("feedback.submitted"));
      } else {
        setSubmissionError(t("feedback.sendFailed"));
      }
    } catch {
      setSubmissionError(t("feedback.sendFailed"));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center text-status-success">
          <CheckCircle2 className="size-7" />
        </div>
        <h2 className="font-heading text-h5 font-bold text-foreground">
          {t("feedback.submitted")}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground">
          {t("feedback.reviewedByTeam")}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-4 rounded-lg text-body-sm"
          onClick={() => {
            setMessageError(false);
            setSubmissionError(null);
            setSubmitted(false);
          }}
        >
          {t("feedback.sendAnother")}
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 max-w-2xl"
    >
      {/* Category selector */}
      <fieldset>
        <legend className="block text-body-sm font-semibold text-foreground mb-2.5">
          {t("feedback.categoryLabel")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={category === cat.id}
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
                category === cat.id
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {t(`feedback.${cat.key}`)}
            </Button>
          ))}
        </div>
      </fieldset>

      {/* Rating selector */}
      <fieldset>
        <legend className="block text-body-sm font-semibold text-foreground mb-2">
          {t("feedback.ratingLabel")}
        </legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <Button
              variant="ghost"
              size="icon"
              aria-pressed={rating === star}
              key={star}
              type="button"
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(star)}
              className="p-1 text-muted-foreground cursor-pointer"
              aria-label={t("feedback.starAria", { rating: star })}
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  (hoverRating || rating) >= star
                    ? "fill-status-warning text-status-warning"
                    : "text-muted-foreground"
                )}
              />
            </Button>
          ))}
          <span className="ml-2 text-body-xs font-semibold text-muted-foreground">
            {rating === 5 && t("feedback.verySatisfied")}
            {rating === 4 && t("feedback.satisfied")}
            {rating === 3 && t("feedback.neutral")}
            {rating === 2 && t("feedback.dissatisfied")}
            {rating === 1 && t("feedback.needsImprovement")}
          </span>
        </div>
      </fieldset>

      {/* Message textarea */}
      <div>
        <label htmlFor="feedback-message" className="block text-body-sm font-semibold text-foreground mb-2">
          {t("feedback.messageLabel")}
        </label>
        <Textarea
          ref={messageInput}
          id="feedback-message"
          name="message"
          rows={4}
          placeholder={t("feedback.placeholder")}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value.trim().length >= 5) setMessageError(false);
          }}
          onInvalid={(e) => {
            e.preventDefault();
            setMessageError(true);
            e.currentTarget.focus();
          }}
          minLength={5}
          aria-invalid={messageError || undefined}
          aria-describedby="feedback-message-help"
          className="rounded-lg text-body-sm resize-y min-h-[100px]"
          required
        />
        <p
          id="feedback-message-help"
          role={messageError ? "alert" : undefined}
          className={cn("mt-1 text-body-xs", messageError ? "text-destructive" : "text-muted-foreground")}
        >
          {t(messageError ? "feedback.messageRequired" : "feedback.minimumLength")}
        </p>
      </div>

      {/* Email input (optional) */}
      <div>
        <label htmlFor="feedback-email" className="block text-body-sm font-semibold text-foreground mb-2">
          {t("feedback.emailLabel")}
        </label>
        <Input
          id="feedback-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="nama@mahasiswa.itb.ac.id"
          defaultValue={email}
          className="rounded-lg text-body-sm max-w-md"
        />
        <p className="mt-1 text-body-xs text-muted-foreground">
          {t("feedback.followUpDescription")}
        </p>
      </div>

      {/* Submit button */}
      <div className="pt-2">
        {submissionError && <p role="alert" className="mb-2 text-body-sm text-destructive">{submissionError}</p>}
        <Button
          type="submit"
          disabled={loading}
          aria-busy={loading}
          className="rounded-lg px-6 text-body-sm font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("feedback.sending")}
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              {t("feedback.submit")}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
