import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { OpsClient } from "./ops-client";
import { Activity } from "lucide-react";
import { ZyraOpsPanel } from "@/components/admin/zyra-ops-panel";
import { ZyraProposalPanel } from "@/components/zyra/zyra-proposal-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Ops"),
  description: "Monitoring operasional dan infrastruktur.",
};

export default function OpsPage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={Activity}
        title="Monitor Ops"
        description="Pantau metrik performa dan kesehatan infrastruktur sistem."
      />
      <OpsClient />
      <ZyraOpsPanel />
      <ZyraProposalPanel role="admin" />
    </div>
  );
}
