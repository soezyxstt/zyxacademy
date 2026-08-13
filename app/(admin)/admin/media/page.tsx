import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Images } from "lucide-react";

import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { MediaManager } from "@/components/admin/media-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Media"),
  description: "Kelola file media untuk kebutuhan konten Zyx Academy.",
};

export default async function AdminMediaPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  if (env.FEATURE_MEDIA_LIBRARY !== "1") {
    return (
      <div className="space-y-8">
        <AdminPageHeader
          icon={Images}
          title="Media"
          description="Kelola file media untuk kebutuhan konten Zyx Academy."
        />
        <div className="border-border rounded-xl border bg-card p-4 shadow-sm">
          <AdminEmptyState
            icon={Images}
            title="Media belum tersedia"
            description="Fitur Media Library belum diaktifkan pada lingkungan ini."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Images}
        title="Media"
        description="Kelola pustaka media, atau jelajahi seluruh storage R2 secara read-only dan salin item ke media."
      />
      <MediaManager />
    </div>
  );
}
