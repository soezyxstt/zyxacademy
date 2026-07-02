import type { ReactNode } from "react";
import { AdminTabNav } from "@/components/admin/tab-nav";
import { env } from "@/lib/env";

export default function AcademicLayout({ children }: { children: ReactNode }) {
  const tabs = [
    { href: "/admin/courses", label: "Mata Kuliah" },
    { href: "/admin/tokens", label: "Token Aktivasi" },
    { href: "/admin/notifications", label: "Push Notification" },
    ...(env.FEATURE_PKA === "1" ? [{ href: "/admin/pka-announcements", label: "Tutorial PKA" }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 text-left">
        <h1 className="font-heading text-h4 font-bold text-foreground">Manajemen Akademik</h1>
        <p className="mt-1 text-body-sm text-muted-foreground">
          Kelola data mata kuliah, token pendaftaran siswa, dan komunikasi broadcast.
        </p>
      </div>
      <AdminTabNav tabs={tabs} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
