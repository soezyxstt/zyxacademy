import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Settings, Bell, User, MessageSquareHeart, ChevronRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Reveal } from "@/components/ui/reveal";
import { pageTitle } from "@/lib/site";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: pageTitle("Pengaturan Akun"),
  description: "Pengaturan preferensi akun, notifikasi, dan profil Zyx Academy.",
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  return (
    <ApplicationPage>
      <PageHeader
        title="Pengaturan Akun"
        icon={Settings}
      />

      <Reveal className="mt-6 space-y-6">
        {/* Account Info Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20">
                <User className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  {user?.name || "Mahasiswa"}
                </h2>
                <p className="text-body-xs text-muted-foreground mt-0.5">
                  {user?.email || "Belum terhubung surel"}
                </p>
              </div>
            </div>

            <Link
              href="/profile"
              className="inline-flex items-center gap-1 text-body-xs font-semibold text-brand-primary hover:underline"
            >
              Lihat Profil
              <ChevronRight className="size-3.5" />
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-body-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-status-success" />
              Status Akun: Terverifikasi
            </span>
            <span className="capitalize">
              Peran: {user?.role === "admin" ? "Administrator" : "Mahasiswa"}
            </span>
          </div>
        </div>

        {/* Notification Preferences Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-secondary/10 text-brand-secondary ring-1 ring-brand-secondary/20">
                <Bell className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  Preferensi Notifikasi
                </h2>
                <p className="text-body-sm text-muted-foreground mt-1 max-w-xl">
                  Atur jenis surel pembaruan materi kelas, pengingat kartu flashcard, jadwal tutorial, dan pengumuman yang ingin Anda terima.
                </p>
              </div>
            </div>

            <Link
              href="/settings/notifications"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3.5 py-2 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors shrink-0 shadow-2xs"
            >
              Ubah Preferensi
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>

        {/* Feedback Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-status-info/10 text-status-info ring-1 ring-status-info/20">
                <MessageSquareHeart className="size-5" />
              </div>
              <div>
                <h2 className="font-heading text-body-base font-bold text-foreground">
                  Masukan & Saran
                </h2>
                <p className="text-body-sm text-muted-foreground mt-1 max-w-xl">
                  Bantu kami meningkatkan platform dan kurikulum dengan memberikan masukan langsung kepada tim akademik.
                </p>
              </div>
            </div>

            <Link
              href="/feedback"
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3.5 py-2 text-body-xs font-semibold text-foreground hover:bg-muted transition-colors shrink-0 shadow-2xs"
            >
              Kirim Masukan
              <ChevronRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </Reveal>
    </ApplicationPage>
  );
}
