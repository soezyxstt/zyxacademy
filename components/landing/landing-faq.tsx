import { ChevronDown } from "lucide-react";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";

const faqItems = [
  {
    question: "Apa yang termasuk akses Free?",
    answer:
      "Paket Free berisi Bank Materi dan Soal. Fitur tambahan seperti solusi soal, diktat, kuis dengan pembahasan, dan tutorial tercantum di paket masing-masing.",
  },
  {
    question: "Apa perbedaan paket berbayar?",
    answer:
      "Minimal berfokus pada akses belajar mandiri. Essential menambahkan pembahasan video dan 15 kali tutorial tatap muka untuk satu semester. Premium menambahkan konsultasi tugas kuliah on-demand dan total 30 kali tutorial tatap muka.",
  },
  {
    question: "Harga yang ditampilkan dihitung bagaimana?",
    answer:
      "Harga utama ditampilkan per orang per semester. Total mengikuti jumlah orang dan mata kuliah yang dipilih.",
  },
  {
    question: "Bagaimana tutorial berlangsung?",
    answer:
      "Essential dan Premium mencantumkan tutorial tatap muka. Detail jadwal, kebutuhan kelompok, dan aktivasi dibahas dengan admin.",
  },
  {
    question: "Bagaimana cara mengaktifkan paket?",
    answer:
      "Pembayaran dilakukan di luar website melalui admin. Hubungi admin untuk membahas konfigurasi kelompok, konfirmasi harga yang berlaku, lalu akses diaktifkan sesuai paket.",
  },
] as const;

export function LandingFaq() {
  return (
    <SectionContainer className="bg-background" aria-labelledby="landing-faq-heading">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-body-xs font-semibold uppercase tracking-[0.2em] text-[var(--zx-accent)]">
          Sebelum memilih
        </p>
        <SectionHeading as="h2" id="landing-faq-heading" className="mt-3 text-foreground">
          Pertanyaan tentang akses dan paket.
        </SectionHeading>
      </div>

      <div className="mx-auto mt-10 max-w-3xl">
        {faqItems.map((item) => (
          <details key={item.question} className="group border-b border-border first:border-t">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-heading text-body-base font-semibold text-foreground outline-none marker:hidden focus-visible:ring-2 focus-visible:ring-[var(--zx-accent)] [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <p className="max-w-2xl pb-5 pr-8 text-body-base leading-relaxed text-muted-foreground">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </SectionContainer>
  );
}
