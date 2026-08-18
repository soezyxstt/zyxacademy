import type { Metadata } from "next";
import { ShellPage } from "@/components/shell-page";
import { Button } from "@/components/ui/button";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Feedback"),
  description: "Kirim masukan untuk kualitas layanan atau performa pengajar.",
};

export default function FeedbackPage() {
  return (
    <ShellPage title="Feedback">
      <div className="max-w-xl rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-body-base text-muted-foreground">
          Form feedback dan masukan layanan. Hubungi tim Zyx melalui kanal resmi di footer untuk pertanyaan langsung.
        </p>
        <Button type="button" className="mt-6 rounded-lg" disabled>
          Kirim Masukan
        </Button>
      </div>
    </ShellPage>
  );
}
