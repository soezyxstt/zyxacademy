"use client";

import { useState } from "react";
import { Star, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { submitStudentFeedbackAction, type StudentFeedbackInput } from "./actions";
import { useTranslations } from "@/lib/i18n/client";

const CATEGORIES: Array<{ id: StudentFeedbackInput["category"]; key: string }> = [
  { id: "materi", key: "categoryCourseMaterials" },
  { id: "kuis", key: "categoryQuizzes" },
  { id: "tutor", key: "categoryTutor" },
  { id: "fitur", key: "categoryPlatform" },
  { id: "lainnya", key: "categoryOther" },
];

export function FeedbackForm({ initialEmail }: { initialEmail?: string }) {
  const t = useTranslations("student");
  const [category, setCategory] = useState<StudentFeedbackInput["category"]>("materi");
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(initialEmail || "");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || message.trim().length < 5) {
      toast.error(t("feedback.messageRequired"));
      return;
    }

    setLoading(true);
    try {
      const res = await submitStudentFeedbackAction({
        category,
        rating,
        message,
        email: email.trim() || undefined,
      });

      if (res.success) {
        setSubmitted(true);
        toast.success(t("feedback.submitted"));
      } else {
        toast.error(t("feedback.sendFailed"));
      }
    } catch {
      toast.error(t("feedback.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center">
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
            setMessage("");
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
      className="space-y-4 max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-5"
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
                  ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/25"
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
          id="feedback-message"
          rows={4}
          placeholder={t("feedback.placeholder")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-lg text-body-sm resize-y min-h-[100px]"
          required
        />
        <p className="mt-1 text-body-xs text-muted-foreground">
          {t("feedback.minimumLength")}
        </p>
      </div>

      {/* Email input (optional) */}
      <div>
        <label htmlFor="feedback-email" className="block text-body-sm font-semibold text-foreground mb-2">
          {t("feedback.emailLabel")}
        </label>
        <Input
          id="feedback-email"
          type="email"
          placeholder="nama@mahasiswa.itb.ac.id"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg text-body-sm max-w-md"
        />
        <p className="mt-1 text-body-xs text-muted-foreground">
          {t("feedback.followUpDescription")}
        </p>
      </div>

      {/* Submit button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={loading || message.trim().length < 5}
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
