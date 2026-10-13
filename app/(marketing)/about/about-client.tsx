"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, Globe } from "lucide-react";
import { FaInstagram, FaLinkedin } from "react-icons/fa6";
import { SectionContainer } from "@/components/layout/section-container";
import { SectionHeading } from "@/components/ui/section-heading";
import { Reveal } from "@/components/ui/reveal";
import { PageOrnaments } from "@/components/ui/page-ornaments";

const founders = [
  {
    id: "adi",
    name: "Adi Haditya Nursyam",
    role: "Co-Founder & Academic Lead",
    image: "/founders/adi.jpeg",
    fullBio:
      "Mahasiswa Teknik Mesin ITB angkatan 2022, asisten akademik untuk mata kuliah sains dan teknik, serta pengarah akademik Zyx.",
    contribution:
      "Memimpin arah akademik dan ikut membentuk produk web Zyx, termasuk struktur materi, alur belajar, dan tooling authoring yang mendukung konten.",
    socials: {
      website: "https://adihnursyam.com",
      linkedin: "https://www.linkedin.com/in/adihnursyam/",
      instagram: "https://instagram.com/adihnursyam",
    },
  },
  {
    id: "dawam",
    name: "Nur Dawam Abdan Syakuro",
    role: "Co-Founder & Hardware Systems Lead",
    image: "/founders/dawam.jpeg",
    fullBio:
      "Mahasiswa Teknik Elektro dengan fokus pada FPGA, mikrokontroler, desain sistem digital, dan embedded systems.",
    socials: {
      linkedin: "https://www.linkedin.com/in/mawadrun/",
      instagram: "https://www.instagram.com/mawadrun/",
    },
  },
  {
    id: "heidi",
    name: "Heidi Schan Andriana",
    role: "Co-Founder & Robotics Specialist",
    image: "/founders/heidi.jpeg",
    fullBio:
      "Mahasiswa Teknik Elektro dengan fokus pada robotika, sistem otonom, UAV, ROV, ROS, dan vision-based control.",
    socials: {
      linkedin: "https://www.linkedin.com/in/heidischan/",
      instagram: "https://www.instagram.com/heidischan/",
    },
  },
  {
    id: "raihan",
    name: "Muhammad Raihan Fasya Mian",
    role: "Co-Founder & Fullstack Tech Lead",
    image: "/founders/raihan.png",
    fullBio:
      "Mahasiswa Teknik Informatika dengan fokus pada blockchain development, smart contracts, dan fullstack web development.",
    socials: {
      linkedin: "https://www.linkedin.com/in/raihanmian/",
      instagram: "https://www.instagram.com/raihan_mianz/",
    },
  },
];

const workingPrinciples = [
  {
    title: "Materi yang selaras",
    description: "Konten mengikuti course dan bab yang sedang dipelajari mahasiswa.",
  },
  {
    title: "Latihan yang terarah",
    description: "Kuis, flashcard, dan pembahasan membantu mahasiswa melihat konsep yang perlu diulang.",
  },
  {
    title: "Bantuan saat dibutuhkan",
    description: "Akses belajar mandiri dapat dilengkapi tutorial sesuai paket yang dipilih.",
  },
];

export function AboutClient() {
  return (
    <div className="relative flex flex-col overflow-hidden">
      <PageOrnaments variant="about" />

      <Reveal>
        <header className="relative z-10 border-b border-border bg-background/50 py-16 text-center backdrop-blur-xs md:py-24">
          <div className="marketing-container space-y-4">
            <h1 className="mx-auto max-w-4xl font-heading text-h2 font-extrabold tracking-tight text-foreground md:text-h1">
              Tentang Zyx
            </h1>
            <p className="mx-auto max-w-2xl text-body-base leading-relaxed text-muted-foreground">
              Kami membangun ruang belajar yang membantu mahasiswa ITB memahami materi, berlatih dengan arah, dan mencari bantuan saat dibutuhkan.
            </p>
          </div>
        </header>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-background/30 py-16 backdrop-blur-xs md:py-24">
          <div className="mx-auto max-w-3xl space-y-6">
            <SectionHeading as="h2" tier="primary" className="text-foreground">
              Belajar lebih terarah, tanpa kehilangan kedalaman.
            </SectionHeading>
            <div className="space-y-4 text-body-base leading-relaxed text-muted-foreground">
              <p>
                Zyx lahir dari pengalaman menghadapi materi TPB yang padat dan kebutuhan akan pendampingan yang lebih terstruktur. Kami ingin mahasiswa dapat melihat hubungan antar konsep, bukan hanya mengumpulkan catatan untuk ujian berikutnya.
              </p>
              <p>
                Karena itu, produk Zyx menghubungkan materi, latihan, pembahasan, dan pilihan tutorial dalam satu alur. Sasaran utamanya adalah mahasiswa ITB tahun pertama dan kedua yang membutuhkan fondasi belajar yang lebih jelas.
              </p>
            </div>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-muted/20 py-16 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start lg:gap-16">
            <div className="space-y-4">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
                Prinsip yang terlihat di produk.
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                Praktik ini menjadi batas yang bisa diperiksa dari alur belajar Zyx, bukan janji hasil akademik.
              </p>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {workingPrinciples.map((principle) => (
                <div key={principle.title} className="grid gap-2 py-5 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] sm:gap-6">
                  <h3 className="font-heading text-body-base font-semibold text-foreground">{principle.title}</h3>
                  <p className="text-body-sm leading-relaxed text-muted-foreground">{principle.description}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 border-b border-border bg-background/50 py-16 backdrop-blur-xs md:py-24">
          <div className="mx-auto max-w-5xl space-y-8">
            <div className="max-w-3xl space-y-3">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
                Arah akademik dan pengembangan berjalan bersama.
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                Peran pendiri dibedakan berdasarkan tanggung jawabnya. Kontribusi Adi berfokus pada hubungan antara kebutuhan belajar, struktur konten, dan pengalaman web yang dipakai mahasiswa.
              </p>
            </div>

            <article className="grid gap-6 rounded-2xl border border-border bg-card p-6 shadow-xs md:grid-cols-[auto_minmax(0,1fr)] md:p-8">
              <div className="relative size-24 overflow-hidden rounded-xl border border-border/60">
                <Image
                  src="/founders/adi.jpeg"
                  alt="Foto Adi Haditya Nursyam"
                  fill
                  sizes="96px"
                  className="object-cover"
                  priority
                />
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-body-xs font-semibold uppercase tracking-widest text-primary">Co-Founder &amp; Academic Lead</p>
                  <h3 className="mt-1 font-heading text-h5 font-bold text-foreground">Adi Haditya Nursyam</h3>
                </div>
                <p className="text-body-base leading-relaxed text-muted-foreground">{founders[0].contribution}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <ExternalProfileLink href="https://adihnursyam.com" icon={<Globe className="size-3.5" />}>
                    Portofolio pendiri
                  </ExternalProfileLink>
                  <ExternalProfileLink href="https://github.com/soezyxstt/zyx-authoring-mcp" icon={<ExternalLink className="size-3.5" />}>
                    Tooling authoring publik
                  </ExternalProfileLink>
                </div>
              </div>
            </article>
          </div>
        </SectionContainer>
      </Reveal>

      <Reveal>
        <SectionContainer className="relative z-10 bg-background/50 py-16 backdrop-blur-xs md:py-24">
          <div className="mx-auto max-w-5xl space-y-10">
            <div className="max-w-3xl space-y-3">
              <SectionHeading as="h2" tier="primary" className="text-foreground">
                Orang di balik arah akademik dan teknologi.
              </SectionHeading>
              <p className="text-body-base leading-relaxed text-muted-foreground">
                Setiap anggota membawa tanggung jawab yang berbeda, dari akademik dan konten sampai sistem teknologi dan robotika.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {founders.map((founder) => (
                <article
                  key={founder.id}
                  className="group flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-xs transition-shadow duration-300 hover:border-primary/20 hover:shadow-md sm:flex-row sm:items-start"
                >
                  <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl border border-border/60 sm:w-32">
                    <Image
                      src={founder.image}
                      alt={`Foto ${founder.name}`}
                      fill
                      sizes="(max-width: 640px) 112px, 128px"
                      className="object-cover transition-transform duration-500 group-hover:scale-105"
                      priority={founder.id === "adi"}
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="border-l-2 border-[var(--zx-accent)] pl-3">
                      <p className="text-body-2xs font-bold uppercase tracking-widest text-primary">{founder.role}</p>
                      <h3 className="mt-1 font-heading text-body-base font-bold leading-tight text-foreground">{founder.name}</h3>
                    </div>
                    <p className="text-body-sm leading-relaxed text-muted-foreground">{founder.fullBio}</p>
                    {founder.id === "adi" && founder.contribution ? (
                      <p className="border-t border-border pt-4 text-body-sm leading-relaxed text-foreground">
                        <span className="font-semibold">Kontribusi produk:</span> {founder.contribution}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4">
                      {founder.socials.website ? (
                        <ExternalProfileLink href={founder.socials.website} icon={<Globe className="size-3.5" />}>
                          Portofolio pendiri
                        </ExternalProfileLink>
                      ) : null}
                      {founder.socials.linkedin ? (
                        <ExternalProfileLink href={founder.socials.linkedin} icon={<FaLinkedin className="size-3.5" />}>
                          LinkedIn
                        </ExternalProfileLink>
                      ) : null}
                      {founder.socials.instagram ? (
                        <ExternalProfileLink href={founder.socials.instagram} icon={<FaInstagram className="size-3.5" />}>
                          Instagram
                        </ExternalProfileLink>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </SectionContainer>
      </Reveal>
    </div>
  );
}

function ExternalProfileLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-muted-foreground underline underline-offset-2 transition-colors hover:text-primary"
    >
      {icon}
      {children}
    </Link>
  );
}
