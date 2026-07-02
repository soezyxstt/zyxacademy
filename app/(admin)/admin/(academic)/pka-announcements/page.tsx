import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Megaphone, History } from "lucide-react";
import { env } from "@/lib/env";
import { pageTitle } from "@/lib/site";
import { getPkaAnnouncementHistoryAction } from "./actions";
import { PkaAnnouncementForm } from "./_components/announcement-form";
import { PkaAnnouncementHistoryTable } from "./_components/announcement-history-table";

export const metadata: Metadata = {
  title: pageTitle("Pengumuman Tutorial PKA"),
  description: "Kirim pengumuman sesi review Google Meet ke peserta Tutorial PKA.",
};

export default async function PkaAnnouncementsPage() {
  if (env.FEATURE_PKA !== "1") notFound();

  const history = await getPkaAnnouncementHistoryAction();

  return (
    <div className="space-y-6">
      <div className="grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="size-4 text-brand-primary" aria-hidden />
            <h2 className="font-heading text-h6 font-semibold text-foreground">Kirim Pengumuman Sesi Review</h2>
          </div>
          <PkaAnnouncementForm />
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-4 font-heading text-body-sm font-semibold text-foreground">Panduan</h3>
            <ul className="space-y-3 text-body-sm text-muted-foreground">
              <li>Buat link Google Meet secara manual, lalu tempel di sini.</li>
              <li>Pengumuman langsung dikirim sebagai email (Resend) dan notifikasi dalam aplikasi ke seluruh peserta Tutorial PKA.</li>
              <li>Jadwal sesi hanya ditampilkan sebagai informasi; tidak ada integrasi kalender otomatis.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="mb-3 flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="font-heading text-h6 font-semibold text-foreground">Riwayat Pengumuman</h2>
        </div>
        <PkaAnnouncementHistoryTable history={history} />
      </div>
    </div>
  );
}
