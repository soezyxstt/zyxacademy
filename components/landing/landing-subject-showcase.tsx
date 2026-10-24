"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTranslations } from "@/lib/i18n/client";

const subjects = [
  {
    id: "calc",
    labelKey: "subjects.calculus",
    titleKey: "subjects.calculusTitle",
    tag: "TPB",
    blurbKey: "subjects.calculusDescription",
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
    labelKey: "subjects.physics",
    titleKey: "subjects.physicsTitle",
    tag: "TPB",
    blurbKey: "subjects.physicsDescription",
    courses: ["Kinematika & dinamika", "Energi & momentum", "Fluida & gelombang", "Termodinamika pengantar"],
    accent: "from-status-info/35 to-brand-primary/20",
    bar: "bg-status-info",
  },
  {
    id: "chem",
    labelKey: "subjects.chemistry",
    titleKey: "subjects.chemistryTitle",
    tag: "TPB",
    blurbKey: "subjects.chemistryDescription",
    courses: ["Atom & stoikiometri", "Ikatan & struktur", "Larutan & kesetimbangan", "Elektrokimia pengantar"],
    accent: "from-tertiary-1/40 to-status-success/20",
    bar: "bg-tertiary-1",
  },
  {
    id: "linalg",
    labelKey: "subjects.algebra",
    titleKey: "subjects.algebraTitle",
    tag: "Jurusan",
    blurbKey: "subjects.algebraDescription",
    courses: ["Sistem linear", "Matriks & determinan", "Ruang vektor", "Nilai eigen pengantar"],
    accent: "from-tertiary-3/40 to-brand-secondary/25",
    bar: "bg-tertiary-3",
  },
] as const;

function SubjectVisual({ accent, bar, label }: { accent: string; bar: string; label: string }) {
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
      <p className="text-body-sm font-medium text-white/85">{label}</p>
    </div>
  );
}

export function LandingSubjectShowcase() {
  const t = useTranslations("marketing");
  const [active, setActive] = useState(0);
  const s = subjects[active];

  return (
    <div>
      <div className="rounded-2xl bg-background p-4 md:p-6" role="region" aria-label={t("subjects.regionLabel")}>
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
                {t(sub.labelKey)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="mt-6 grid gap-6 rounded-2xl border border-border bg-card p-4 shadow-sm transition-opacity duration-200 md:grid-cols-2 md:p-6">
          <div className="flex min-h-0 flex-col">
            <h3 className="font-heading text-body-base font-bold text-card-foreground">{t(s.titleKey)}</h3>
            <p className="mt-2 text-body-base text-muted-foreground">{t(s.blurbKey)}</p>
            <p className="mt-4 font-heading text-body-sm font-semibold text-card-foreground">{t("subjects.topics")}</p>
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
          <SubjectVisual accent={s.accent} bar={s.bar} label={t("subjects.diagramLabel")} />
        </div>
      </div>

      <p className="mt-6 text-center text-body-sm text-muted-foreground">
        <Link href="/courses" className="interactive inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:text-primary/80 hover:underline">
          {t("subjects.catalogLink")}
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </p>
    </div>
  );
}
