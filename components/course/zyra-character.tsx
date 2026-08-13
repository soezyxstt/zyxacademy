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
        <path d="M22 27c1.5-1.8 3.7-1.8 5.2 0M36.8 27c1.5-1.8 3.7-1.8 5.2 0" />
      </g>
    );
  }

  if (state === "quota_resting") {
    return (
      <g data-expression="resting">
        <path d="M21.5 27h5.5M37 27h5.5" />
      </g>
    );
  }

  if (state === "confused") {
    return (
      <g data-expression="confused">
        <circle cx="24" cy="27" r="2.2" fill="currentColor" stroke="none" />
        <circle cx="40" cy="26" r="1.4" fill="currentColor" stroke="none" />
        <path d="M20.5 22 26 20.5M37.5 20.5 43 22" />
      </g>
    );
  }

  if (state === "error") {
    return (
      <g data-expression="worried">
        <circle cx="24" cy="27" r="1.8" fill="currentColor" stroke="none" />
        <circle cx="40" cy="27" r="1.8" fill="currentColor" stroke="none" />
        <path d="m20.5 22 5.5 1M38 23l5.5-1" />
      </g>
    );
  }

  const lookingUp = state === "thinking" || state === "uploading";
  return (
    <g data-expression={lookingUp ? "focused" : "attentive"}>
      <circle cx="24" cy="27" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="40" cy="27" r="2.4" fill="currentColor" stroke="none" />
      {lookingUp && <circle cx="24.7" cy="26.2" r="0.7" className="fill-card" stroke="none" />}
      {lookingUp && <circle cx="40.7" cy="26.2" r="0.7" className="fill-card" stroke="none" />}
    </g>
  );
}

function ZyraMouth({ state }: { state: ZyraPetState }) {
  if (state === "explaining") return <path data-mouth="speaking" d="M29 34c1.8 2.4 4.2 2.4 6 0M30.5 37h3" />;
  if (state === "checking") return <path data-mouth="checking" d="M28.5 34.5h7M34 34.5l2 2" />;
  if (state === "confused" || state === "error") return <path data-mouth="worried" d="M28.5 37c2-2 5-2 7 0" />;
  if (state === "quota_resting") return <path data-mouth="resting" d="M29 35h6" />;
  return <path data-mouth="smile" d="M28.5 34c2 3 5 3 7 0" />;
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

/** Application-owned fox-like Zyra companion for expressive pet surfaces. */
export function ZyraCharacter({ state, className }: ZyraCharacterProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      data-zyra-character
      data-creature="zyra-fox"
      data-state={state}
      className={cn("size-14 shrink-0", className)}
    >
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path
          data-tail
          d="M44 47c8 3 15-1 14-8-.7-4.7-6-6.5-9.3-3.2 4.1.1 5.4 3.3 3.5 5.7-1.5 1.9-4.2 2.1-6.5 1.3"
          className="fill-current opacity-20"
        />
        <path d="M21 39c-3 4-3 11-.5 15 2.2 3.5 6.1 5 11.5 5s9.3-1.5 11.5-5c2.5-4 2.5-11-.5-15" className="fill-current opacity-15" />
        <path d="m17 20-3-11 10 6.5A21 21 0 0 1 32 14a21 21 0 0 1 8 1.5L50 9l-3 11c2 2.8 3 6 3 9.5C50 39 42 45 32 45s-18-6-18-15.5c0-3.5 1-6.7 3-9.5Z" className="fill-card" />
        <path d="m17 17-1.1-5 5.1 3.3M47 17l1.1-5-5.1 3.3" className="fill-brand-secondary opacity-70" />
        <path d="M28.5 31.5 32 33l3.5-1.5L32 35l-3.5-3.5Z" className="fill-current opacity-35" />
        <circle cx="19.5" cy="33" r="1.5" className="fill-brand-secondary opacity-35" stroke="none" />
        <circle cx="44.5" cy="33" r="1.5" className="fill-brand-secondary opacity-35" stroke="none" />
        <path data-paws d="M24 56v4m16-4v4M20.5 60h7M36.5 60h7" />
        <path d="m28.5 48 3.5-2 3.5 2-3.5 5-3.5-5Z" className="fill-brand-primary opacity-25" />
        <ZyraEyes state={state} />
        <ZyraMouth state={state} />
        <path d="M18 34h-4M46 34h4" opacity="0.45" />
        <ZyraStateGlyph state={state} />
      </g>
    </svg>
  );
}
