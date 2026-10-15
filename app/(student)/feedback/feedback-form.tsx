"use client";

import { useState } from "react";
import { Star, Send, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { submitStudentFeedbackAction, type StudentFeedbackInput } from "./actions";

const CATEGORIES: Array<{ id: StudentFeedbackInput["category"]; label: string }> = [
  { id: "materi", label: "Materi Kuliah" },
  { id: "kuis", label: "Kuis & Ujian" },
  { id: "tutor", label: "Tutor & Sesi" },
  { id: "fitur", label: "Fitur Platform" },
  { id: "lainnya", label: "Lainnya" },
];

export function FeedbackForm({ initialEmail }: { initialEmail?: string }) {
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
      toast.error("Mohon tuliskan pesan masukan minimal 5 karakter.");
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
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Terjadi kendala saat mengirim masukan.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-status-success/10 text-status-success ring-1 ring-status-success/20">
          <CheckCircle2 className="size-7" />
        </div>
        <h2 className="font-heading text-h5 font-bold text-foreground">
          Masukan berhasil terkirim
        </h2>
        <p className="mx-auto mt-2 max-w-md text-body-sm text-muted-foreground">
          Tim akademik akan meninjau masukan Anda.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-6 rounded-lg text-body-sm"
          onClick={() => {
            setMessage("");
            setSubmitted(false);
          }}
        >
          Kirim masukan lainnya
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
      <div>
        <label className="block text-body-sm font-semibold text-foreground mb-2.5">
          Kategori Masukan
        </label>
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
              {cat.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Rating selector */}
      <div>
        <label className="block text-body-sm font-semibold text-foreground mb-2">
          Penilaian Pengalaman
        </label>
        <div className="flex items-center gap-1.5">
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
              className="p-1 text-muted-foreground hover:scale-110 transition-transform cursor-pointer"
              aria-label={`Beri nilai ${star} dari 5 bintang`}
            >
              <Star
                className={cn(
                  "size-6 transition-colors",
                  (hoverRating || rating) >= star
                    ? "fill-yellow-400 text-yellow-500"
                    : "text-muted-foreground/30"
                )}
              />
            </Button>
          ))}
          <span className="ml-2 text-body-xs font-semibold text-muted-foreground">
            {rating === 5 && "Sangat puas"}
            {rating === 4 && "Puas"}
            {rating === 3 && "Cukup"}
            {rating === 2 && "Kurang"}
            {rating === 1 && "Perlu perbaikan"}
          </span>
        </div>
      </div>

      {/* Message textarea */}
      <div>
        <label htmlFor="feedback-message" className="block text-body-sm font-semibold text-foreground mb-2">
          Pesan dan Saran
        </label>
        <Textarea
          id="feedback-message"
          rows={4}
          placeholder="Tulis masukan Anda..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-lg text-body-sm resize-y min-h-[100px]"
          required
        />
        <p className="mt-1 text-body-xs text-muted-foreground">
          Minimal 5 karakter.
        </p>
      </div>

      {/* Email input (optional) */}
      <div>
        <label htmlFor="feedback-email" className="block text-body-sm font-semibold text-foreground mb-2">
          Alamat Surel (Opsional)
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
          Untuk tindak lanjut dari tim.
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
              Mengirim masukan...
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              Kirim Masukan
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
