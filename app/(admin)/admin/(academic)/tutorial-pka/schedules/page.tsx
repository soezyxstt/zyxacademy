import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaSchedulesAction } from "../actions";
import { SchedulesTab } from "../_components/schedules-tab";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Jadwal Live Tutorial PKA"),
  description: "Kelola jadwal live Tutorial PKA.",
};

export default async function TutorialPkaSchedulesPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const schedules = await getPkaSchedulesAction();

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Jadwal Live Tutorial PKA</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Atur jadwal sesi live Tutorial PKA. Jadwal akan dikirim otomatis ke email peserta.
        </p>
      </div>

      <div className="mt-6">
        <SchedulesTab schedules={schedules} />
      </div>
    </div>
  );
}
