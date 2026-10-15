import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Settings, Bell, User, MessageSquareHeart, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ApplicationPage } from "@/components/application-page";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { createMetadata } from "@/lib/site";
import { auth } from "@/lib/auth";

export const metadata: Metadata = createMetadata({
  title: "Pengaturan Akun",
  description: "Pengaturan preferensi akun, notifikasi, dan profil Zyx Academy.",
  path: "/settings",
});


export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user;

  return (
    <ApplicationPage>
      <PageHeader
        title="Pengaturan Akun"
        icon={Settings}
      />

      <Reveal className="mt-4 max-w-3xl divide-y divide-border rounded-xl border border-border bg-card px-4">
        <section className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <User className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="font-heading text-body-sm font-bold">{user?.name || "Mahasiswa"}</h2>
              <p className="break-all text-body-xs text-muted-foreground">{user?.email || "Surel belum terhubung"}</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/profile">Lihat profil<ChevronRight className="size-3.5" /></Link></Button>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 py-4">
          <h2 className="flex items-center gap-3 font-heading text-body-sm font-bold"><Bell className="size-5 text-primary" />Notifikasi surel</h2>
          <Button asChild variant="outline" size="sm"><Link href="/settings/notifications">Atur notifikasi<ChevronRight className="size-3.5" /></Link></Button>
        </section>
        <section className="flex flex-wrap items-center justify-between gap-3 py-4">
          <h2 className="flex items-center gap-3 font-heading text-body-sm font-bold"><MessageSquareHeart className="size-5 text-primary" />Masukan dan saran</h2>
          <Button asChild variant="outline" size="sm"><Link href="/feedback">Kirim masukan<ChevronRight className="size-3.5" /></Link></Button>
        </section>
      </Reveal>
    </ApplicationPage>
  );
}
