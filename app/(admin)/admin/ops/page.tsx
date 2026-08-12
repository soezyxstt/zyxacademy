import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OpsClient } from "./ops-client";
import { Activity } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Ops"),
  description: "Monitoring operasional AI dan infrastruktur.",
};

export default function OpsPage() {
  return (
    <div className="space-y-8">
      <AdminPageHeader
        icon={Activity}
        title="Monitor Ops"
        description="Pantau metrik performa AI dan kesehatan infrastruktur sistem."
      />
      <OpsClient />
    </div>
  );
}
