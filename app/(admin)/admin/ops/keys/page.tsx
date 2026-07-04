import type { Metadata } from "next";
import { pageTitle } from "@/lib/site";
import { KeysClient } from "./keys-client";

export const metadata: Metadata = {
  title: pageTitle("Key Diagnostics"),
  description: "Status dan kuota harian tiap API key.",
};

export default function KeysPage() {
  return (
    <div className="space-y-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">API Keys</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola kuota, rotasi otomatis, dan circuit breaker API keys LLM.
        </p>
      </div>
      <KeysClient />
    </div>
  );
}
