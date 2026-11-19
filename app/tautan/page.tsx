import type { Metadata } from "next";
import { ArrowUpRight, Link as LinkIcon } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { importantLinks } from "@/db/schema";
import { createMetadata } from "@/lib/site";
import { getAppLocale, getTranslations } from "@/lib/i18n/server";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Logo } from "@/components/logo";
import { DEFAULT_ICON, linkColor } from "@/lib/links";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketing");
  const locale = await getAppLocale();
  return createMetadata({ title: t("tautan.title"), description: t("tautan.description"), path: "/tautan", locale });
}


export const dynamic = "force-dynamic";

type PublicLink = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  color: string | null;
};

function LinkRow({ link }: { link: PublicLink }) {
  const color = linkColor(link.color);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-(--compact-gap) py-(--row-padding) transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-lg text-xl",
          color.tile
        )}
      >
        {link.icon || DEFAULT_ICON}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-body-base font-semibold text-foreground">
          {link.title}
        </span>
        {link.description && (
          <span className="mt-0.5 line-clamp-2 block text-body-sm leading-normal text-muted-foreground">
            {link.description}
          </span>
        )}
      </span>
      <ArrowUpRight
        className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-brand-primary"
        aria-hidden
      />
    </a>
  );
}

export default async function TautanPage() {
  const t = await getTranslations("marketing");
  const links = await db
    .select({
      id: importantLinks.id,
      title: importantLinks.title,
      url: importantLinks.url,
      description: importantLinks.description,
      icon: importantLinks.icon,
      category: importantLinks.category,
      color: importantLinks.color,
    })
    .from(importantLinks)
    .where(
      and(
        eq(importantLinks.isActive, true),
        isNull(importantLinks.deletedAt)
      )
    )
    .orderBy(asc(importantLinks.sortOrder), asc(importantLinks.createdAt));

  const groups: { label: string; links: PublicLink[] }[] = [];
  const groupMap = new Map<string, PublicLink[]>();
  for (const link of links) {
    const label = link.category || "Umum";
    const bucket = groupMap.get(label);
    if (bucket) {
      bucket.push(link);
    } else {
      groupMap.set(label, [link]);
    }
  }
  for (const [label, items] of groupMap) {
    groups.push({ label, links: items });
  }

  const showSectionLabels = groups.length > 1;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <PageOrnaments variant="testimonial" />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-(--page-gutter) py-12 sm:py-16">
        <header className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center">
            <Logo variant="symbol" className="[--logo-height:2.25rem]" />
          </div>
          <h1 className="mt-4 font-heading text-h5 font-bold tracking-tight text-foreground">
            {t("tautan.title")}
          </h1>
          <p className="mt-1.5 max-w-sm text-body-sm leading-normal text-muted-foreground">
            {t("tautan.description")}
          </p>
        </header>

        {links.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <LinkIcon className="size-7" aria-hidden />
            </div>
            <h2 className="font-heading text-body-base font-semibold text-foreground">
              {t("tautan.emptyTitle")}
            </h2>
            <p className="max-w-xs text-body-sm leading-normal text-muted-foreground">
              {t("tautan.emptyDescription")}
            </p>
          </div>
        ) : showSectionLabels ? (
          <div className="mt-(--reading-section-gap) flex flex-col gap-(--reading-section-gap)">
            {groups.map((group) => (
              <section key={group.label} className="flex flex-col gap-(--compact-gap)">
                <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                  {group.label}
                </h2>
                <div className="divide-y divide-border border-y border-border">
                  {group.links.map((link) => (
                    <LinkRow key={link.id} link={link} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-8 divide-y divide-border border-y border-border">
            {links.map((link) => (
              <LinkRow key={link.id} link={link} />
            ))}
          </div>
        )}

        <footer className="mt-12 pb-2 pt-4 text-center text-body-xs text-muted-foreground">
          Zyx Academy
        </footer>
      </div>
    </div>
  );
}
