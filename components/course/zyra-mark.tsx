import { cn } from "@/lib/utils";

/** Distinct application-owned mark for Zyra entry points. */
export function ZyraMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-5 shrink-0", className)}
    >
      <path
        d="M6.25 8.25 12 4.75l5.75 3.5v7.5L12 19.25l-5.75-3.5v-7.5Z"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.75 9.25h6.5l-6.5 5.5h6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 4.75v-2M4.5 6.75 2.9 5.8M19.5 6.75l1.6-.95"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
