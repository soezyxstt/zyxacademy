import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FlagsClient } from "./flags-client";
import { Flag } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Feature Flags"),
  description: "Monitoring status keaktifan fitur flag sistem Zyx Academy.",
};

export default function FeatureFlagsPage() {
  return (
    <div className="w-full space-y-8">
      <AdminPageHeader
        icon={Flag}
        title="Feature Flags"
        description="Pantau status keaktifan fitur flag sistem secara real-time dan tinjau modul yang berjalan."
      />
      <FlagsClient />
    </div>
  );
}
