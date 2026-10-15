import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LinkIcon } from "lucide-react";

import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/auth/admin-guards";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LinksManager } from "@/components/admin/links-manager";

export const metadata: Metadata = {
  title: pageTitle("Tautan"),
  description: "Kelola tautan penting yang tampil di halaman publik /tautan (admin).",
};

export const dynamic = "force-dynamic";

export default async function AdminTautanPage() {
  try {
    await assertAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={LinkIcon}
        title="Tautan"
      />
      <LinksManager />
    </div>
  );
}
