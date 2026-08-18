import type { Metadata } from "next";
import { ArrowUpRight, Link as LinkIcon } from "lucide-react";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { importantLinks } from "@/db/schema";
import { pageTitle } from "@/lib/site";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Logo } from "@/components/logo";
import { DEFAULT_ICON, linkColor } from "@/lib/links";
import { cn } from "@/lib/utils";
import { env } from "@/lib/env";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: pageTitle("Tautan"),
  description: "Kumpulan tautan penting dari Zyx Academy dalam satu tempat.",
};

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

function LinkCard({ link }: { link: PublicLink }) {
  const color = linkColor(link.color);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-xs transition-colors duration-150 hover:border-brand-primary hover:bg-brand-primary/5"
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
        <span className="block truncate text-body-base font-semibold text-foreground">
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
  if (env.FEATURE_LINK_LIBRARY !== "1") notFound();

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

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-12 sm:py-16">
        <header className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
            <Logo disableAnimation className="[--logo-height:2.25rem]" />
          </div>
          <h1 className="mt-4 font-heading text-h5 font-bold tracking-tight text-foreground">
            Tautan Zyx Academy
          </h1>
          <p className="mt-1.5 max-w-sm text-body-sm leading-normal text-muted-foreground">
            Kumpulan tautan penting dari Zyx Academy dalam satu tempat.
          </p>
        </header>

        {links.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
              <LinkIcon className="size-7" aria-hidden />
            </div>
            <h2 className="font-heading text-body-base font-semibold text-foreground">
              Belum ada tautan
            </h2>
            <p className="max-w-xs text-body-sm leading-normal text-muted-foreground">
              Tautan penting akan muncul di halaman ini.
            </p>
          </div>
        ) : showSectionLabels ? (
          <div className="mt-10 flex flex-col gap-8">
            {groups.map((group) => (
              <section key={group.label} className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 font-heading text-body-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </h2>
                <div className="flex flex-col gap-3">
                  {group.links.map((link) => (
                    <LinkCard key={link.id} link={link} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-10 flex flex-col gap-3">
            {links.map((link) => (
              <LinkCard key={link.id} link={link} />
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
