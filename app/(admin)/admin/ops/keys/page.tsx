import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KeysClient } from "./keys-client";
import { KeyRound } from "lucide-react";

export const metadata: Metadata = {
  title: pageTitle("Key Diagnostics"),
  description: "Status dan kuota harian tiap API key.",
};

export default function KeysPage() {
  return (
    <div className="space-y-5">
      <AdminPageHeader
        icon={KeyRound}
        title="API Keys"
        description="Kelola kuota, rotasi otomatis, dan circuit breaker API keys LLM."
      />
      <KeysClient />
    </div>
  );
}
