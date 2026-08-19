import Image from "next/image";
import { cn } from "@/lib/utils";

export type TestimonialSplitCardProps = {
  quote: string;
  name: string;
  role: string;
  company?: string;
  avatarSrc: string;
  /** `onDark` = ring for cards on `bg-black-2` (matches landing testimonials). */
  variant?: "default" | "onDark";
  className?: string;
};

export function TestimonialSplitCard({
  quote,
  name,
  role,
  company,
  avatarSrc,
  variant = "default",
  className,
}: TestimonialSplitCardProps) {
  return (
    <article
      className={cn(
        "grid min-h-[300px] overflow-hidden rounded-2xl bg-white/5 ring-1 backdrop-blur-sm md:min-h-[360px] md:grid-cols-[1.2fr_1.8fr]",
        variant === "onDark" ? "ring-white/10" : "ring-border",
        className
      )}
    >
      <div className="relative min-h-[240px] overflow-hidden bg-black-2 md:min-h-full">
        <Image
          src={avatarSrc}
          alt={`Foto ${name}`}
          fill
          sizes="(max-width: 1024px) 100vw, 540px"
          className="object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/35 via-black/10 to-transparent" />
      </div>
      <div className="flex flex-1 flex-col justify-center bg-white/6 px-5 py-6 text-white md:px-9 md:py-9">
        {company ? (
          <p className="font-heading text-h6 font-bold uppercase tracking-wide text-white/90">{company}</p>
        ) : null}
        <blockquote className="mt-3 font-heading text-body-base font-medium italic leading-snug text-white">
          &ldquo;{quote}&rdquo;
        </blockquote>
        <p className="mt-5 font-heading text-h6 font-bold text-white">{name}</p>
        <p className="text-body-sm text-white/70">{role}</p>
      </div>
    </article>
  );
}
