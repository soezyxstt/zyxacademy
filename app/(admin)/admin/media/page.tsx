import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Images } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { AdminPageHeader } from "@/components/admin/page-header";
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
