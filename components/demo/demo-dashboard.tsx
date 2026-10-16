import Link from "next/link";
import { ArrowRight, BookOpen, CheckSquare, FileText, Layers3, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DemoAuthCta } from "./demo-shell";

const checklist = [
  {
    href: "/demo/article",
    label: "Baca Artikel",
    detail: "Lihat materi lengkap bab ini.",
    icon: BookOpen,
  },
  {
    href: "/demo/diktat",
    label: "Buka Diktat",
    detail: "Coba dua bagian awal untuk review.",
    icon: FileText,
  },
  {
    href: "/demo/flashcards",
    label: "Balik Flashcard",
    detail: "Uji ingatan dengan lima kartu.",
    icon: Layers3,
  },
  {
    href: "/demo/quiz",
    label: "Coba Kuis",
    detail: "Jawab tiga soal tanpa menyimpan hasil.",
    icon: CheckSquare,
  },
  {
    href: "/demo/zyra",
    label: "Kenali Zyra",
    detail: "Lihat contoh alur tanya jawab.",
    icon: MessageCircle,
  },
] as const;

export function DemoDashboard({ nextPath }: { nextPath: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <Card variant="solid" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-h5 font-bold text-foreground">Jelajahi alur belajar</h2>
          </div>
          <Button asChild size="sm" className="gap-1.5 rounded-lg">
            <Link href="/demo/article">
              Mulai dari Artikel
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <ol className="mt-6 space-y-2">
          {checklist.map(({ href, label, detail, icon: Icon }, index) => (
            <li key={href}>
              <Link
                href={href}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-3 transition-colors hover:border-brand-primary/35 hover:bg-brand-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)]"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-body-sm font-semibold text-brand-primary">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-body-sm font-semibold text-foreground">{label}</span>
                    <span className="block text-body-xs text-muted-foreground">{detail}</span>
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </Card>

      <Card variant="subtle" className="flex flex-col justify-between p-5 sm:p-6">
        <div>
          <h2 className="font-heading text-h5 font-bold text-foreground">Simpan progres belajarmu</h2>
          <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">
            Masuk dengan Google untuk mengakses bab pertama di setiap mata kuliah dan memakai Zyra 5 pertanyaan per hari.
          </p>
        </div>
        <div className="mt-6">
          <DemoAuthCta nextPath={nextPath} label="Masuk dengan Google" />
        </div>
      </Card>
    </div>
  );
}
