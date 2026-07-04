import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageTitle } from "@/lib/site";
import { env } from "@/lib/env";
import { getPkaRegistrationsAction } from "../actions";
import { RegistrationsTab } from "../_components/registrations-tab";

export const metadata: Metadata = {
  title: pageTitle("Pendaftar Tutorial PKA"),
  description: "Kelola pendaftar Tutorial PKA.",
};

export default async function TutorialPkaRegistrationsPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const registrations = await getPkaRegistrationsAction();

  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Pendaftar Tutorial PKA</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola pendaftar sesi review live Tutorial PKA.
        </p>
      </div>

      <div className="mt-6">
        <RegistrationsTab registrations={registrations} />
      </div>
    </div>
  );
}
