import type { Metadata } from "next";
import { ShellPage } from "@/components/shell-page";
import { pageTitle } from "@/lib/site";
import Link from "next/link";
import { Bell } from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: pageTitle("Settings"),
  description: "Pengaturan tampilan dan preferensi akun Zyx Academy.",
};

export default function SettingsPage() {
  return (
    <ShellPage
      title="Settings"
      description="Ukuran font, gaya font, skema warna, dan preferensi lain akan dikonfigurasi di sini."
    >
      <div className="rounded-2xl border border-border bg-card p-10 shadow-sm">
        <p className="text-body-md text-muted-foreground">Manage your Zyx account preferences.</p>
        {env.FEATURE_NOTIFICATION_PREFERENCES === "1" ? (
          <Button asChild variant="outline" size="lg" className="mt-5">
            <Link href="/settings/notifications">
              <Bell className="size-4" aria-hidden />
              Notification preferences
            </Link>
          </Button>
        ) : null}
      </div>
    </ShellPage>
  );
}
