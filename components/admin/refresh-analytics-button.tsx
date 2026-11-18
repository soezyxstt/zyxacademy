"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminIconAction } from "@/components/admin/icon-action";
import { useTranslations } from "@/lib/i18n/client";
import { toast } from "@/components/ui/toast";
import { RefreshCcw } from "lucide-react";

export function RefreshAnalyticsButton() {
  const t = useTranslations("adminOps");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/analytics/sync", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Gagal menyinkronkan data.");
      }

      const data = await response.json();
      if (data.success) {
        toast.success("Sukses", {
          description: `Berhasil menyinkronkan ${data.count} halaman populer.`,
        });
        router.refresh();
      } else {
        toast.error("Gagal", {
          description: data.message || "Gagal menyinkronkan data dari GA4.",
        });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminIconAction
      label={t("opsUI.refresh")}
      variant="ghost"
      onClick={handleRefresh}
      isLoading={loading}
    >
      <RefreshCcw className="size-4" />
    </AdminIconAction>
  );
}
