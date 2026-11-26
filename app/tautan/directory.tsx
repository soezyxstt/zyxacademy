import { ArrowUpRight, Link as LinkIcon } from "lucide-react";
import { groupPublicLinks, type PublicLink } from "@/packages/public-links/directory";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { Logo } from "@/components/logo";
import { DEFAULT_ICON, linkColor } from "@/lib/links";
import { cn } from "@/lib/utils";

function LinkRow({ link }: { link: PublicLink }) {
  const color = linkColor(link.color);
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-11 items-start gap-(--compact-gap) py-(--row-padding) transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        className={cn(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg text-xl ring-1 ring-inset ring-current/15",
          color.tile
        )}
      >
        {link.icon || DEFAULT_ICON}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block wrap-anywhere text-body-sm font-semibold text-foreground">
          {link.title}
        </span>
        {link.description && (
          <span className="mt-0.5 block wrap-anywhere text-body-xs leading-normal text-muted-foreground">
            {link.description}
          </span>
        )}
      </span>
      <ArrowUpRight
        className="mt-1 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        aria-hidden
      />
    </a>
  );
}

export function PublicLinksDirectory({ copy, links }: {
  copy: { title: string; description: string; emptyTitle: string; emptyDescription: string };
  links: PublicLink[];
}) {
  const groups = groupPublicLinks(links);
  const showSectionLabels = groups.length > 1;

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-background">
      <PageOrnaments variant="testimonial" />

      <div className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col px-(--page-gutter) py-(--reading-section-gap)">
        <header className="flex flex-col items-center text-center">
          <Logo variant="symbol" className="[--logo-height:2rem]" />
          <h1 className="mt-(--compact-gap) font-heading text-h5 font-bold text-foreground">
            {copy.title}
          </h1>
          <p className="mt-1.5 max-w-sm text-body-sm leading-normal text-muted-foreground">
            {copy.description}
          </p>
        </header>

        {links.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-(--reading-section-gap) text-center">
            <LinkIcon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="font-heading text-body-base font-semibold text-foreground">
              {copy.emptyTitle}
            </h2>
            <p className="max-w-xs text-body-sm leading-normal text-muted-foreground">
              {copy.emptyDescription}
            </p>
          </div>
        ) : showSectionLabels ? (
          <div className="mt-(--reading-section-gap) flex flex-col gap-(--reading-section-gap)">
            {groups.map((group) => (
              <section key={group.label} className="flex flex-col gap-(--compact-gap)">
                <h2 className="flex items-center gap-2 font-heading text-body-base font-bold text-foreground">
                  {group.label}
                </h2>
                <div className="divide-y divide-border/60 border-y border-border/60">
                  {group.links.map((link) => (
                    <LinkRow key={link.id} link={link} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-(--reading-section-gap) divide-y divide-border/60 border-y border-border/60">
            {links.map((link) => (
              <LinkRow key={link.id} link={link} />
            ))}
          </div>
        )}

        <footer className="mt-(--section-gap) py-(--compact-gap) text-center text-body-xs text-muted-foreground">
          Zyx Academy
        </footer>
      </div>
    </main>
  );
}
