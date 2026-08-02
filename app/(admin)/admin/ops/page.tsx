import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { OpsClient } from "./ops-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Ops"),
  description: "Monitoring operasional AI dan infrastruktur.",
};

export default function OpsPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Monitor Ops</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Pantau metrik performa AI dan kesehatan infrastruktur sistem.
        </p>
      </div>
      <OpsClient />
    </div>
  );
}
