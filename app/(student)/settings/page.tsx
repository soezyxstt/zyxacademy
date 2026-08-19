import type { Metadata } from "next";
import { ShellPage } from "@/components/shell-page";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Settings"),
  description: "Pengaturan tampilan dan preferensi akun Zyx Academy.",
};

export default function SettingsPage() {
  return (
    <ShellPage title="Settings">
      <div className="rounded-2xl border border-border bg-card p-10 shadow-sm">
        <p className="text-body-base text-muted-foreground">
          Pengaturan preferensi akun dan tema.
        </p>
      </div>
    </ShellPage>
  );
}
