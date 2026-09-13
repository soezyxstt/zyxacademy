"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const subjects = [
  {
    id: "calc",
    label: "Kalkulus",
    title: "Kalkulus & metode numerik",
    tag: "TPB",
    blurb: "Limit, turunan, integral, dan aplikasi ke model sederhana.",
    courses: [
      "Limit & kontinuitas",
      "Turunan & aplikasi",
      "Integral tentu",
      "Deret & pendekatan numerik",
    ],
    accent: "from-brand-primary/40 to-tertiary-3/30",
    bar: "bg-brand-primary",
  },
  {
    id: "phys",
    label: "Fisika",
    title: "Fisika dasar",
    tag: "TPB",
    blurb: "Mekanika, gelombang, termodinamika pengantar - dengan latihan terarah.",
    courses: ["Kinematika & dinamika", "Energi & momentum", "Fluida & gelombang", "Termodinamika pengantar"],
    accent: "from-status-info/35 to-brand-primary/20",
    bar: "bg-status-info",
  },
  {
    id: "chem",
    label: "Kimia",
    title: "Kimia dasar",
    tag: "TPB",
    blurb: "Stokiometri, kesetimbangan, dan dasar laboratorium.",
    courses: ["Atom & stoikiometri", "Ikatan & struktur", "Larutan & kesetimbangan", "Elektrokimia pengantar"],
    accent: "from-tertiary-1/40 to-status-success/20",
    bar: "bg-tertiary-1",
  },
  {
    id: "linalg",
    label: "Aljabar",
    title: "Aljabar linear",
    tag: "Jurusan",
    blurb: "Vektor, matriks, dan ruang vektor untuk persiapan kuliah lanjut.",
    courses: ["Sistem linear", "Matriks & determinan", "Ruang vektor", "Nilai eigen pengantar"],
    accent: "from-tertiary-3/40 to-brand-secondary/25",
    bar: "bg-tertiary-3",
  },
] as const;

function SubjectVisual({ accent, bar }: { accent: string; bar: string }) {
  return (
      <div className={cn("relative flex min-h-[220px] flex-col justify-between rounded-2xl p-6 md:min-h-[260px]", "bg-linear-to-br", accent)}>
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-12 rounded", bar)} />
        </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-black-2/25 p-3 ring-1 ring-white/20 backdrop-blur-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded-md bg-white/15" />
        ))}
      </div>
      <p className="text-body-sm font-medium text-white/85">Diagram konsep & latihan interaktif</p>
    </div>
  );
}

export function LandingSubjectShowcase() {
  const [active, setActive] = useState(0);
  const s = subjects[active];

  return (
    <div>
      <div className="rounded-2xl bg-background p-4 md:p-6" role="region" aria-label="Bidang studi">
        <div className="w-full overflow-x-auto scrollbar-hide">
          <ToggleGroup
            type="single"
            defaultValue={subjects[0].id}
            onValueChange={(value) => {
              if (!value) return;
              const idx = subjects.findIndex((item) => item.id === value);
              if (idx >= 0) setActive(idx);
            }}
            className="flex gap-2"
          >
            {subjects.map((sub) => (
              <ToggleGroupItem key={sub.id} value={sub.id} className="whitespace-nowrap">
                {sub.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="mt-6 grid gap-6 rounded-2xl border border-border bg-card p-4 shadow-sm transition-opacity duration-200 md:grid-cols-2 md:p-6">
          <div className="flex min-h-0 flex-col">
            <p className="text-body-sm font-medium uppercase tracking-wide text-muted-foreground">{s.tag}</p>
            <h3 className="mt-1 font-heading text-body-base font-bold text-card-foreground">{s.title}</h3>
            <p className="mt-2 text-body-base text-muted-foreground">{s.blurb}</p>
            <p className="mt-4 font-heading text-body-sm font-semibold text-card-foreground">Topik</p>
            <ul className="mt-2 flex flex-1 flex-col gap-2 overflow-y-auto">
              {s.courses.map((c) => (
                <li
                  key={c}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-body-sm font-medium text-foreground"
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
          <SubjectVisual accent={s.accent} bar={s.bar} />
        </div>
      </div>

      <p className="mt-6 text-center text-body-sm text-muted-foreground">
        <Link href="/courses" className="interactive inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline">
          Lihat katalog lengkap
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
