import { type AnimatedOrnamentVariant } from "@/components/animated-ornament-canvas";
import { cn } from "@/lib/utils";

type MarketingPageHeroProps = {
  /** Used for `aria-labelledby` and stable SVG gradient id. */
  sectionId: string;
  eyebrow?: string;
  title: string;
  description: string;
  className?: string;
  ornamentSymbols?: string[];
  ornamentVariant?: AnimatedOrnamentVariant;
};

export function MarketingPageHero({
  sectionId,
  title,
  description,
  className,
}: MarketingPageHeroProps) {
  const headingId = `${sectionId}-heading`;

  return (
    <header className={cn("relative overflow-hidden border-b border-border bg-background py-16 md:py-24 text-center", className)} aria-labelledby={headingId}>
      {/* Soft radial glow */}
      <div className="absolute inset-0 z-0 bg-radial-gradient from-primary/5 via-transparent to-transparent opacity-65 pointer-events-none" />
      
      {/* Organic topological curves background */}
      <svg className="absolute inset-0 z-0 h-full w-full opacity-[0.06] pointer-events-none" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M-100 220 C 100 170, 200 370, 400 320 C 600 270, 800 470, 1000 420 C 1200 370, 1300 270, 1600 320" stroke="var(--primary)" strokeWidth="2.5" />
        <path d="M-100 300 C 120 240, 250 440, 450 370 C 650 300, 820 540, 1020 460 C 1220 380, 1350 310, 1650 370" stroke="var(--zx-accent)" strokeWidth="1.8" />
        <path d="M-100 360 C 140 300, 280 500, 480 410 C 680 320, 840 600, 1040 500 C 1240 400, 1380 340, 1700 400" stroke="var(--primary)" strokeWidth="1.2" strokeDasharray="6 6" />
      </svg>

      <div className="marketing-container relative z-10 space-y-4">
        <h1 id={headingId} className="font-heading text-h2 md:text-h1 font-extrabold tracking-tight text-foreground max-w-4xl mx-auto">
          {title}
        </h1>
        {description && (
          <p className="mx-auto max-w-2xl text-body-base text-muted-foreground leading-relaxed font-normal">
            {description}
          </p>
        )}
      </div>
    </header>
  );
}
