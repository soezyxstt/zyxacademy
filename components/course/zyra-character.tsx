import type { ZyraPetState } from "@/lib/zyra/murid";
import { cn } from "@/lib/utils";

type ZyraCharacterProps = {
  state: ZyraPetState;
  className?: string;
};

function ZyraEyes({ state }: { state: ZyraPetState }) {
  if (state === "success") {
    return (
      <g data-expression="happy" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M22 28c1.5-2.2 4-2.2 5.5 0M36.5 28c1.5-2.2 4-2.2 5.5 0" />
      </g>
    );
  }

  if (state === "quota_resting") {
    return (
      <g data-expression="resting" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M21.5 28.5h6M36.5 28.5h6" />
      </g>
    );
  }

  if (state === "confused") {
    return (
      <g data-expression="confused" fill="#38bdf8" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="24.5" cy="28" r="2.8" stroke="none" />
        <circle cx="39.5" cy="27" r="1.8" stroke="none" />
        <path d="M21 22.5 27 21M37 21 42 22.5" fill="none" strokeWidth="2" />
      </g>
    );
  }

  if (state === "error") {
    return (
      <g data-expression="worried" stroke="#f87171" strokeWidth="2" strokeLinecap="round" fill="none">
        <circle cx="24" cy="28.5" r="2" fill="#f87171" stroke="none" />
        <circle cx="40" cy="28.5" r="2" fill="#f87171" stroke="none" />
        <path d="m20.5 23 5.5 1.5M38 24.5l5.5-1.5" />
      </g>
    );
  }

  const lookingUp = state === "thinking" || state === "uploading";
  return (
    <g data-expression={lookingUp ? "focused" : "attentive"} fill="#38bdf8">
      {/* Left Eye */}
      <rect x="22" y={lookingUp ? "25" : "26"} width="5.5" height="6.5" rx="2.5" />
      <circle cx="25.5" cy={lookingUp ? "26" : "27.5"} r="1" fill="#ffffff" />
      {/* Right Eye */}
      <rect x="36.5" y={lookingUp ? "25" : "26"} width="5.5" height="6.5" rx="2.5" />
      <circle cx="40" cy={lookingUp ? "26" : "27.5"} r="1" fill="#ffffff" />
    </g>
  );
}

function ZyraMouth({ state }: { state: ZyraPetState }) {
  if (state === "explaining") {
    return <path data-mouth="speaking" d="M29 35.5c1.8 2.8 4.2 2.8 6 0M30.5 38.5h3" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" fill="none" />;
  }
  if (state === "checking") {
    return <path data-mouth="checking" d="M28.5 36h7M34 36l2 2" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" fill="none" />;
  }
  if (state === "confused" || state === "error") {
    return <path data-mouth="worried" d="M28.5 38c2-2.2 5-2.2 7 0" stroke={state === "error" ? "#f87171" : "#38bdf8"} strokeWidth="1.8" strokeLinecap="round" fill="none" />;
  }
  if (state === "quota_resting") {
    return <path data-mouth="resting" d="M29 36h6" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round" fill="none" />;
  }
  return <path data-mouth="smile" d="M29 35.5c1.5 2 4.5 2 6 0" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" />;
}

function ZyraStateGlyph({ state }: { state: ZyraPetState }) {
  if (state === "thinking") {
    return (
      <g data-glyph="thinking" fill="#38bdf8" stroke="none">
        <circle cx="49" cy="11" r="1.2" />
        <circle cx="53" cy="8" r="1.6" />
        <circle cx="58" cy="5" r="2.2" />
      </g>
    );
  }
  if (state === "uploading") {
    return <path data-glyph="uploading" d="M51 15v-8m0 0-3.5 3.5M51 7l3.5 3.5M46.5 17h9" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  if (state === "checking" || state === "confused") {
    return <path data-glyph="question" d="M51 8c0-3 5-3 5 0 0 2-2.5 2-2.5 4.5M53.5 16h.01" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" />;
  }
  if (state === "success") {
    return <path data-glyph="success" d="m48 11 3 3 7-7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  if (state === "quota_resting") {
    return <path data-glyph="resting" d="M48 7h6l-6 6h6" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
  }
  if (state === "error") {
    return <path data-glyph="error" d="M53 6v7m0 3.5h.01" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" fill="none" />;
  }
  if (state === "listening") {
    return <path data-glyph="listening" d="M51 8c3 2 3 6 0 8M55 5c5 4 5 10 0 14" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" fill="none" />;
  }
  return null;
}

/** Application-owned expressive Zyra companion for interactive pet surfaces. */
export function ZyraCharacter({ state, className }: ZyraCharacterProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      data-zyra-character="true"
      data-creature="zyra-fox"
      data-state={state}
      className={cn("size-20 shrink-0 select-none overflow-visible", className)}
    >
      <defs>
        {/* Soft volumetric body gradient */}
        <linearGradient id="zyra-body-grad" x1="16" y1="6" x2="48" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="45%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        {/* Inner ear warm accent gradient */}
        <linearGradient id="zyra-ear-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#1e40af" />
        </linearGradient>

        {/* Visor digital dark screen gradient */}
        <linearGradient id="zyra-visor-grad" x1="18" y1="20" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0b1120" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        {/* Subtle rim highlight */}
        <linearGradient id="zyra-highlight-grad" x1="32" y1="8" x2="32" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Fluffy Tail */}
      <path
        data-tail="true"
        d="M44 45c6 1 15-2 15-9 0-6-7-8-11-4 4.5.5 6 4 4 7-1.5 2.2-4.5 2.5-8 1.5"
        fill="url(#zyra-body-grad)"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Tail Fluffy Tip Accent */}
      <path
        d="M54 34c2 2 3.5 4.5 2.5 6.5-1.5 1-3.5 1.5-6 1 1-1.5 2-3.5 3.5-7.5Z"
        fill="#93c5fd"
        opacity="0.8"
      />

      {/* Left Ear */}
      <path
        d="m18 20-5-13 12 7Z"
        fill="url(#zyra-body-grad)"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m17.5 18-3.2-8.5 7.7 4.5Z"
        fill="url(#zyra-ear-grad)"
      />

      {/* Right Ear */}
      <path
        d="m46 20 5-13-12 7Z"
        fill="url(#zyra-body-grad)"
        stroke="#2563eb"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m46.5 18 3.2-8.5-7.7 4.5Z"
        fill="url(#zyra-ear-grad)"
      />

      {/* Main Mascot Body */}
      <path
        d="M17 21C13 25 12 32 13 38c1.2 7 6 15 19 15s17.8-8 19-15c1-6 0-13-4-17-4-3-10-4-15-4s-11 1-15 4Z"
        fill="url(#zyra-body-grad)"
        stroke="#2563eb"
        strokeWidth="1.5"
      />

      {/* Top Head Volumetric Highlight */}
      <path
        d="M20 18c3.5-2.5 8-3.2 12-3.2s8.5.7 12 3.2"
        stroke="url(#zyra-highlight-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Paws (Little feet standing) */}
      <g data-paws="true">
        {/* Left Paw */}
        <rect x="22" y="50" width="7" height="6" rx="3" fill="#1d4ed8" stroke="#2563eb" strokeWidth="1.2" />
        {/* Right Paw */}
        <rect x="35" y="50" width="7" height="6" rx="3" fill="#1d4ed8" stroke="#2563eb" strokeWidth="1.2" />
      </g>

      {/* Visor Screen Faceplate */}
      <rect
        x="17.5"
        y="21"
        width="29"
        height="22"
        rx="9"
        fill="url(#zyra-visor-grad)"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeOpacity="0.4"
      />

      {/* Visor Glossy Specular Reflection */}
      <path
        d="M20 23.5c6-2 15-2 21 1-4 1.5-12 1.5-21-1Z"
        fill="#ffffff"
        opacity="0.15"
      />

      {/* Cheeks Blush LED */}
      <circle cx="20.5" cy="36.5" r="1.6" fill="#38bdf8" opacity="0.3" />
      <circle cx="43.5" cy="36.5" r="1.6" fill="#38bdf8" opacity="0.3" />

      {/* LED Eyes */}
      <ZyraEyes state={state} />

      {/* LED Mouth */}
      <ZyraMouth state={state} />

      {/* Holographic Floating State Glyph */}
      <ZyraStateGlyph state={state} />
    </svg>
  );
}
