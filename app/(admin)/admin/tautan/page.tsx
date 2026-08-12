import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LinkIcon, Lock } from "lucide-react";

import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import { assertAdmin } from "@/lib/uploadthing-admin";
import { AdminPageHeader } from "@/components/admin/page-header";
import { AdminEmptyState } from "@/components/admin/state-panels";
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
    <div className="space-y-8">
      <AdminPageHeader
        icon={LinkIcon}
        title="Tautan"
        description="Simpan, urutkan, dan atur tautan penting yang ditampilkan di halaman publik /tautan."
      />
      {env.FEATURE_LINK_LIBRARY === "1" ? (
        <LinksManager />
      ) : (
        <AdminEmptyState
          icon={Lock}
          title="Fitur belum aktif"
          description="Aktifkan flag FEATURE_LINK_LIBRARY di environment untuk mengelola tautan."
        />
      )}
    </div>
  );
}
