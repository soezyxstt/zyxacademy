import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { FlagsClient } from "./flags-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("Feature Flags"),
  description: "Monitoring status keaktifan fitur flag sistem Zyx Academy.",
};

export default function FeatureFlagsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-col space-y-1">
        <h1 className="font-heading text-h3 font-bold text-foreground tracking-tight">
          Feature Flags
        </h1>
        <p className="text-body-sm text-muted-foreground">
          Pantau status keaktifan fitur flag sistem secara real-time dan tinjau modul yang berjalan.
        </p>
      </div>
      <FlagsClient />
    </div>
  );
}
