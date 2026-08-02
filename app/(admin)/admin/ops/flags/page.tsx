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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 space-y-6">
      <div className="text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">
          Feature Flags
        </h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Pantau status keaktifan fitur flag sistem secara real-time dan tinjau modul yang berjalan.
        </p>
      </div>
      <FlagsClient />
    </div>
  );
}
