"use client";

type MarketingHeroLoopsProps = {
  /** Unique prefix for SVG gradient id (avoid clashes when multiple SVGs exist). */
  id: string;
};

export function MarketingHeroLoops({ id }: MarketingHeroLoopsProps) {
  const gradId = `${id.replace(/[^a-zA-Z0-9_-]/g, "")}-hero-loop-grad`;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.18]"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-brand-primary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--color-tertiary-3)" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <g fill="none" stroke={`url(#${gradId})`} strokeWidth="1.15">
        <ellipse cx="78%" cy="22%" rx="44%" ry="86%" transform="rotate(-12 78 22)" />
        <ellipse cx="12%" cy="76%" rx="48%" ry="88%" transform="rotate(8 12 76)" />
        <ellipse cx="52%" cy="50%" rx="70%" ry="108%" transform="rotate(-4 52 50)" />
        <path d="M -12 112 C 12 88 25 67 43 48 C 63 27 82 12 112 -10" />
        <path d="M -10 18 C 20 31 38 54 52 76 C 66 99 88 106 112 90" />
        <path d="M -10 96 C 17 82 38 84 56 99 C 75 114 93 112 110 96" />
        <path d="M -10 104 C 21 94 43 94 63 104 C 80 112 97 108 110 98" />
      </g>
      <g fill="none" stroke={`url(#${gradId})`} strokeWidth="0.85" opacity="0.65">
        <circle cx="-10" cy="110" r="30" />
        <circle cx="-10" cy="110" r="42" />
        <circle cx="-10" cy="110" r="54" />
        <circle cx="110" cy="108" r="28" />
        <circle cx="110" cy="108" r="40" />
        <circle cx="110" cy="108" r="52" />
      </g>
    </svg>
  );
}
