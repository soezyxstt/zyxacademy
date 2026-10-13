import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarClock, MessageCircle } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Button } from "@/components/ui/button";

const supportOptions = [
  {
    icon: BookOpen,
    title: "Belajar mandiri",
    body: "Free membuka bab pertama di setiap mata kuliah, termasuk Artikel, Diktat, Kuis, dan Flashcard. Diktat hanya dapat dibaca, Zyra satu pertanyaan per hari.",
  },
  {
    icon: CalendarClock,
    title: "Tutorial terjadwal",
    body: "Essential menambahkan 15 kali tutorial tatap muka untuk satu semester.",
  },
  {
    icon: MessageCircle,
    title: "Intensitas penuh",
    body: "Premium menambahkan konsultasi tugas kuliah on-demand dan total 30 kali tutorial tatap muka.",
  },
] as const;

export function LandingTutorSupport() {
  return (
    <SectionContainer
      className="border-y border-border/80 bg-muted/45"
      aria-labelledby="landing-tutor-support-heading"
    >
      <div className="mx-auto max-w-2xl text-center">
        <SectionHeading as="h2" id="landing-tutor-support-heading" className="text-foreground">
          Saat belajar mandiri belum cukup, pilih dukungan yang tepat.
        </SectionHeading>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
        {supportOptions.map((option) => {
          const Icon = option.icon;
          return (
            <article key={option.title} className="bg-background p-5 md:p-6">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 font-heading text-body-base font-semibold text-foreground">
                {option.title}
              </h3>
              <p className="mt-2 text-body-sm leading-relaxed text-muted-foreground">{option.body}</p>
            </article>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Button asChild variant="marketingSecondary" size="marketing" className="bg-background">
          <Link href="/plans">
            Bandingkan semua paket
            <ArrowUpRight className="size-4" data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </SectionContainer>
  );
}
