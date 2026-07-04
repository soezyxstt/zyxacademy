"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { RefreshCcw } from "lucide-react";

export function RefreshAnalyticsButton() {
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
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={loading}
      className="gap-2"
    >
      <RefreshCcw className={`size-4 ${loading ? "animate-spin" : ""}`} />
      Refresh Data Analytics
    </Button>
  );
}
