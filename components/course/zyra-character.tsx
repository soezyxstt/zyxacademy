import type { ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";

type ZyraCharacterProps = {
  state: ZyraPetState;
  className?: string;
};

function ZyraEyes({ state }: { state: ZyraPetState }) {
  if (state === "success") {
    return (
      <g data-expression="happy">
        <path d="M22 25.5c1.4-1.7 3.4-1.7 4.8 0M37.2 25.5c1.4-1.7 3.4-1.7 4.8 0" />
      </g>
    );
  }

  if (state === "quota_resting") {
    return (
      <g data-expression="resting">
        <path d="M21.5 26h5.5M37 26h5.5" />
      </g>
    );
  }

  if (state === "confused") {
    return (
      <g data-expression="confused">
        <circle cx="24" cy="25.5" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="40" cy="24.5" r="1.4" fill="currentColor" stroke="none" />
        <path d="M20.5 20.5 26 19M37.5 19l5.5 1.5" />
      </g>
    );
  }

  if (state === "error") {
    return (
      <g data-expression="worried">
        <circle cx="24" cy="26" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="40" cy="26" r="1.8" fill="currentColor" stroke="none" />
        <path d="m20.5 21 5.5 1M38 22l5.5-1" />
      </g>
    );
  }

  const lookingUp = state === "thinking" || state === "uploading";
  return (
    <g data-expression={lookingUp ? "focused" : "attentive"}>
      <circle cx="24" cy="25" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="40" cy="25" r="2.4" fill="currentColor" stroke="none" />
      {lookingUp && <circle cx="24.7" cy="24.2" r="0.7" className="fill-card" stroke="none" />}
      {lookingUp && <circle cx="40.7" cy="24.2" r="0.7" className="fill-card" stroke="none" />}
    </g>
  );
}

function ZyraMouth({ state }: { state: ZyraPetState }) {
  if (state === "explaining") return <path data-mouth="speaking" d="M28 32.5c2.2 2.2 5.8 2.2 8 0M30 36h4" />;
  if (state === "checking") return <path data-mouth="checking" d="M28 33h8M34.5 33l2 2" />;
  if (state === "confused" || state === "error") return <path data-mouth="worried" d="M28.5 35c2-2 5-2 7 0" />;
  if (state === "quota_resting") return <path data-mouth="resting" d="M29 33.5h6" />;
  return <path data-mouth="smile" d="M28 32.5c2.2 3 5.8 3 8 0" />;
}

function ZyraStateGlyph({ state }: { state: ZyraPetState }) {
  if (state === "thinking") {
    return <g data-glyph="thinking" fill="currentColor" stroke="none"><circle cx="48" cy="12" r="1" /><circle cx="52" cy="9" r="1.3" /><circle cx="56" cy="6" r="1.6" /></g>;
  }
  if (state === "uploading") {
    return <path data-glyph="uploading" d="M49 15v-7m0 0-3 3m3-3 3 3M45 16.5h8" />;
  }
  if (state === "checking" || state === "confused") {
    return <path data-glyph="question" d="M50 8.5c0-2.8 5-2.8 5 0 0 2-2.5 2-2.5 4M52.5 16h.01" />;
  }
  if (state === "success") {
    return <path data-glyph="success" d="m48 11 2.8 2.8L56 7.5" />;
  }
  if (state === "quota_resting") {
    return <path data-glyph="resting" d="M48 8h6l-6 6h6" />;
  }
  if (state === "error") {
    return <path data-glyph="error" d="M52 7v6m0 3h.01" />;
  }
  if (state === "listening") {
    return <path data-glyph="listening" d="M50 8c3 2 3 6 0 8M54 5c5 4 5 10 0 14" />;
  }
  return null;
}

/** Application-owned Zyra character for expressive pet surfaces. */
export function ZyraCharacter({ state, className }: ZyraCharacterProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      data-zyra-character
      data-state={state}
      className={cn("size-12 shrink-0", className)}
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m18 17-7-5 2 10M46 17l7-5-2 10" className="fill-current opacity-20" />
        <path d="M32 14v-4M32 10l-3-3m3 3 3-3" />
        <rect x="14" y="15" width="36" height="28" rx="11" className="fill-card" />
        <path d="M20 42v6c0 5 4 9 9 9h6c5 0 9-4 9-9v-6" className="fill-current opacity-15" />
        <path d="M20 47 14 51M44 47l6 4M27 57v3M37 57v3" />
        <ZyraEyes state={state} />
        <ZyraMouth state={state} />
        <path d="M18 30h-3M49 30h-3" opacity="0.45" />
        <ZyraStateGlyph state={state} />
      </g>
    </svg>
  );
}
