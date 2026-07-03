import type { ReactNode } from "react";
import { AdminTabNav } from "@/components/admin/tab-nav";

export default function OpsLayout({ children }: { children: ReactNode }) {
  const tabs = [
    { href: "/admin/ops", label: "Monitor Ops" },
    { href: "/admin/ops/analytics", label: "Analitik AI" },
    { href: "/admin/ops/keys", label: "API Keys" },
    { href: "/admin/ops/short-links", label: "Short Links" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Sistem & Diagnostik</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Pantau kesehatan database, batas kuota KV write, penggunaan model Gemini, dan circuit breakers API keys.
        </p>
      </div>
      <AdminTabNav tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
