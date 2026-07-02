import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import { PKA_SUBJECTS } from "@/lib/pka-config";
import { getDiagnosticSummary } from "@/lib/pka-simulation";
import { requirePkaSession } from "@/lib/pka-enrollment";
import { DiagnosticReport } from "@/components/pka/diagnostic-report";
import { Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: pageTitle("Laporan diagnostik PKA"),
  description: "Ringkasan hasil simulasi PKA kamu per mapel.",
};

export default async function PkaReportPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const userId = await requirePkaSession("/pka/report");
  const results = await getDiagnosticSummary(userId, PKA_SUBJECTS);

  return (
    <div className="space-y-6">
      <Reveal>
        <Link href="/pka" className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground">
          <ArrowLeft className="size-4" />
          Kembali ke Tutorial PKA
        </Link>
      </Reveal>

      <Reveal>
        <div className="space-y-2">
          <h1 className="font-heading text-h4 font-bold text-foreground">Laporan diagnostik</h1>
          <p className="text-body-base text-muted-foreground">Ringkasan hasil simulasi PKA kamu di ketiga mapel.</p>
        </div>
      </Reveal>

      <Reveal>
        <DiagnosticReport results={results} />
      </Reveal>
    </div>
  );
}
