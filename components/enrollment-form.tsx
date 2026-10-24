"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { enrollWithToken } from "@/app/(student)/dashboard/actions";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

export function EnrollmentForm({ className, onSuccess }: { className?: string; onSuccess?: () => void }) {
  const t = useTranslations("schedule");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = token.trim();
    if (!cleanToken) {
      toast.error(t("enrollment.enterToken"));
      return;
    }

    setLoading(true);
    try {
      const res = await enrollWithToken(cleanToken);
      if (res.success) {
        toast.success(t("enrollment.success"));
        setToken("");
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(t(`enrollment.errors.${res.errorCode ?? "internal"}`));
      }
    } catch (err) {
      console.error(err);
      toast.error(t("enrollment.errors.connection"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleEnroll} className={cn("@container w-full", className)}>
      <div className="flex flex-col gap-2.5 @[420px]:flex-row">
        <div className="flex flex-1 items-center h-10 rounded-lg border border-border bg-background px-3.5 gap-2 focus-within:border-brand-primary focus-within:ring-1 focus-within:ring-brand-primary transition-shadow">
          <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="text"
            placeholder={t("enrollment.tokenPlaceholder")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
            className="flex-1 bg-transparent text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
          />
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-10 shrink-0 rounded-lg px-5 bg-brand-primary text-white hover:bg-brand-primary/95 transition-all text-body-sm font-medium w-full @[420px]:w-auto cursor-pointer"
        >
          {loading ? t("enrollment.submitting") : t("enrollment.activate")}
        </Button>
      </div>
    </form>
  );
}
