"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminIconAction } from "@/components/admin/icon-action";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { RefreshCcw } from "lucide-react";

export function RefreshAnalyticsButton({
  variant = "ghost",
  className,
}: {
  variant?: "ghost" | "outline";
  className?: string;
} = {}) {
  const t = useTranslations("adminOps");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/analytics/sync", {
        method: "POST",
      });

      if (!response.ok) throw new Error("sync_failed");
      const data = await response.json();
      if (!data.success) throw new Error("sync_failed");
      toast.success(t("analyticsSync.success", { count: data.count }));
      router.refresh();
    } catch {
      toast.error(t("analyticsSync.failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminIconAction
      label={t("opsUI.refresh")}
      variant={variant}
      onClick={handleRefresh}
      isLoading={loading}
      className={className}
    >
      <RefreshCcw className="size-4" />
    </AdminIconAction>
  );
}
