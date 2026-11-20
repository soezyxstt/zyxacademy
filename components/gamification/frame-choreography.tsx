"use client";

import { useId, type CSSProperties } from "react";
import type { FrameCollection } from "@/lib/gamification/collection-art";
import "./frame-choreography.css";

const phase = (delay: number, duration = 3): CSSProperties => ({ animationDelay: `${delay}s`, animationDuration: `${duration}s` });

/** All coordinates are in the 100-unit artwork square. The fixed outer clip
 * protects the photo even when a moving part crosses its own original bounds. */
export function FrameChoreography({ art, imageUrl }: { art: FrameCollection; imageUrl: string }) {
  const id = `frame-${useId().replace(/:/g, "")}`;
  const gold = `url(#${id}-gold)`;
  const cool = `url(#${id}-cool)`;
  const fire = `url(#${id}-fire)`;
  const part = (name: string, clip: string, motion: string, origin: string, delay = 0) => <g data-part={name} className={`frame-part ${motion}`} style={{ transformOrigin: origin, ...phase(delay) }}><image href={imageUrl} width="100" height="100" clipPath={`url(#${id}-${clip})`} /></g>;
  const stream = (name: string, d: string, color: string, delay = 0, width = 1.2) => <path data-part={name} className="frame-part frame-flow" d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength="100" style={phase(delay, 2.8)} />;
  const particles = (kind: "ember" | "water" | "confetti" | "leaf", count = 10) => <g data-part={`${kind}-stream`}>{Array.from({ length: count }, (_, i) => {
    const angle = i * Math.PI * 2 / count;
    const x = 50 + Math.cos(angle) * 45;
    const y = 50 + Math.sin(angle) * 45;
    return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 37})`}><g className={`frame-part frame-particle frame-particle--${kind}`} style={phase(-i * .31, 2.4 + i % 3 * .4)}>
      {kind === "water" ? <path d="M0 -2.5C-4 1 -2 3 0 3S4 1 0 -2.5Z" fill={cool} stroke="#dcfffb" strokeWidth=".35" /> : kind === "leaf" ? <path d="M-3 2Q-4 -3 3 -3Q4 2 -3 2ZM-2 1L2 -2" fill="#b3d873" stroke="#efffc7" strokeWidth=".3" /> : kind === "confetti" ? <path d="M-1 -2Q1 -1 1 2L2 1Q0 -1 0 -3Z" fill={i % 2 ? "#fff6e2" : "#ef334e"} /> : <path d="M0 -3Q2 0 .5 2Q-2 3 -1 0Z" fill={gold} />}
    </g></g>;
  })}</g>;
  const orbit = (name: string, reverse = false, delay = 0, mechanical = false) => <g data-part={name} className={`frame-part frame-orbit ${reverse ? "frame-reverse" : ""}`} style={phase(delay, reverse ? 4.8 : 3.6)}>
    <path d="M10 50A40 40 0 0 1 50 10" fill="none" stroke={cool} strokeWidth={mechanical ? 1.8 : 1.2} strokeLinecap="round" />
    <g transform="translate(50 7)">{mechanical ? <><rect x="-3" y="-1.3" width="6" height="2.6" rx=".5" fill="#8cecff" stroke="#e5ffff" strokeWidth=".45" /><path d="M-5 -2V2M5 -2V2M-2 0H2" stroke="#39acc8" strokeWidth="1" /></> : <><ellipse rx="2.3" ry="1.9" fill={gold} /><ellipse rx="4" ry=".8" fill="none" stroke="#fff0b0" strokeWidth=".5" transform="rotate(-25)" /></>}</g>
  </g>;
  const feather = (side: number) => <g transform={side ? "translate(100 100) rotate(180)" : undefined}><g data-part={side ? "right-feather-fan" : "left-feather-fan"} className="frame-part frame-fan" style={{ transformOrigin: "17px 35px", ...phase(side ? -1.4 : 0, 2.8) }}>{[0, 1, 2].map(i => <g key={i} transform={`rotate(${i * 12} 17 35)`}><path d="M17 35C5 28 4 17 7 7C9 20 17 19 20 26Q22 31 17 35Z" fill={gold} stroke="#b46623" strokeWidth=".35" /><path d="M17 34Q9 23 8 12" fill="none" stroke="#fff5c9" strokeWidth=".55" /></g>)}</g></g>;
  const flame = (rotation: number, i: number) => <g key={i} transform={`rotate(${rotation} 50 50)`}><g data-part={`flame-ribbon-${i}`} className="frame-part frame-flame" style={{ transformOrigin: "15px 60px", ...phase(-i * .43, 2.1 + i % 2 * .4) }}><path d="M13 65C2 52 17 48 9 34C20 40 10 48 18 49C25 39 13 29 20 23C19 36 30 41 23 52Q18 61 13 65Z" fill={fire} /><path d="M14 60C8 50 19 49 15 40C23 48 20 53 14 60Z" fill="#fff2a7" /></g></g>;

  let ornaments;
  switch (art.id) {
    case "frame-classic": ornaments = <>{orbit("satellite-alpha", false, -.5, true)}{orbit("satellite-beta", true, -2, true)}{orbit("cyan-comet", false, -2.2)}{stream("mechanical-segments", "M6 50A44 44 0 0 1 50 6M94 50A44 44 0 0 1 50 94", "#a9edff", -.5, 1.8)}</>; break;
    case "frame-detailed": ornaments = <>{part("left-wing-art", "northwest", "frame-wing-left", "27px 27px")}{part("right-wing-art", "southeast", "frame-wing-right", "78px 72px", -1.2)}{feather(0)}{feather(1)}{stream("gold-flame-trail", "M12 65C0 40 15 15 37 7M87 35C100 60 85 90 60 94", gold)}{particles("ember", 12)}</>; break;
    case "frame-laurel": ornaments = <>{[0, 120, 240].map((angle, i) => <g key={angle} transform={`rotate(${angle} 50 50)`}><g data-part={`curling-wave-${i}`} className="frame-part frame-wave" style={phase(-i * .9, 3.2)}><path d="M7 52C0 37 10 22 19 23C29 24 23 35 18 31C24 31 22 25 18 28C9 34 16 44 7 52Z" fill={cool} stroke="#d6fff5" strokeWidth=".7" /><path d="M6 45Q8 30 18 27" fill="none" stroke="#fff" strokeWidth="1" /></g></g>)}{stream("foam-current", "M8 60C0 25 28 4 48 7M92 40C100 75 72 96 52 93", "#d7fff8", -1)}{particles("water")}</>; break;
    case "frame-circuit": ornaments = <>{part("komodo-head", "northeast", "frame-head", "73px 24px")}{part("komodo-jaw", "jaw", "frame-jaw", "80px 18px", -.7)}{[0, 80, 170, 255].map(flame)}{stream("lava-rush", "M10 70Q0 20 40 8M90 30Q100 80 60 92", "#ffdc70", -.6, 1.6)}{particles("ember", 16)}</>; break;
    case "frame-celestial": ornaments = <>{[0, 90, 180, 270].map((angle, i) => <g key={angle} transform={`rotate(${angle} 50 50)`}><g data-part={`ceremonial-pendant-${i}`} className="frame-part frame-pendant" style={{ transformOrigin: "50px 3px", ...phase(-i * .65, 3.4) }}><path d="M50 3V7M50 7C37 0 34 13 43 14C49 15 50 9 45 9C39 11 47 19 50 20C53 19 61 11 55 9C50 9 51 15 57 14C66 13 63 0 50 7Z" fill="none" stroke={gold} strokeWidth="1.3" /><ellipse cx="50" cy="18" rx="1.2" ry="2" fill="#ffe7a0" /></g></g>)}{stream("carved-light-arc", "M8 65C0 18 34 1 50 7C66 1 100 18 92 65M17 81Q50 108 83 81", gold, -1, 1.5)}</>; break;
    case "frame-merah-putih": ornaments = <>{[0, 180].map((angle, i) => <g key={angle} transform={`rotate(${angle} 50 50)`}><g data-part={`flag-ribbon-${i}`} className="frame-part frame-ribbon" style={phase(-i * 1.1, 2.6)}><path d="M5 50C20 36 0 25 18 12C26 7 36 9 40 5L43 11C31 17 27 10 20 17C7 29 27 41 9 55Z" fill="#e52c44" stroke="#ff8790" strokeWidth=".4" /><path d="M9 55C27 41 7 29 20 17C27 10 31 17 43 11L44 15C32 22 27 15 23 21C14 31 32 44 13 60Z" fill="#fff7e6" stroke="#e8bf95" strokeWidth=".3" /></g></g>)}{particles("confetti", 16)}</>; break;
    case "frame-borobudur": ornaments = <><g data-part="ceremonial-relief-rays" className="frame-part frame-orbit" style={phase(-.7, 5)}>{Array.from({ length: 16 }, (_, i) => <path key={i} transform={`rotate(${i * 22.5} 50 50)`} d="M50 3Q48 7 50 11Q52 7 50 3Z" fill={gold} />)}</g>{[0, 180].map((a, i) => <g key={a} transform={`rotate(${a} 50 50)`}>{stream(`stupa-halo-${i}`, "M12 47A38 38 0 0 1 88 47", gold, -i * 1.4, 1.6)}<path data-part={`tier-radiance-${i}`} className="frame-part frame-tier" d="M31 10Q50 0 69 10M36 7Q50 1 64 7" fill="none" stroke="#ffe9a4" strokeWidth="1" style={phase(-i * 1.4)} /></g>)}</>; break;
    case "frame-khatulistiwa": ornaments = <>{orbit("astrolabe-arm-east", false, -.7)}{orbit("astrolabe-arm-west", true, -1.4)}<g data-part="compass-hands" className="frame-part frame-orbit" style={phase(-1, 5)}><path d="M5 50H12M88 50H95M50 5V12M50 88V95" stroke={gold} strokeWidth="2" /><path d="M7 45Q1 50 7 55M93 45Q99 50 93 55" stroke="#d0f6ef" strokeWidth=".6" fill="none" /></g>{stream("equatorial-comet", "M8 50A42 42 0 1 1 92 50A42 42 0 1 1 8 50", cool, -1.3)}</>; break;
    case "frame-anggrek": ornaments = <>{part("orchid-crown", "northwest", "frame-flower", "25px 21px")}{part("orchid-right", "east", "frame-flower", "88px 58px", -1.4)}{part("orchid-left", "west", "frame-flower", "10px 39px", -.6)}{[0, 180].map((a, i) => <g key={a} transform={`rotate(${a} 50 50)`}><g data-part={`opening-petals-${i}`} className="frame-part frame-bloom" style={{ transformOrigin: "32px 8px", ...phase(-i * 1.5, 3.8) }}><path d="M32 10C18 11 18 0 24 2Q30 2 32 10C30 -2 42 -2 39 4Q37 8 32 10C45 3 47 13 40 14Q35 15 32 10Z" fill="#fff4e3" stroke="#e0acb5" strokeWidth=".5" /><path d="M29 10Q32 4 35 10Q33 15 29 10Z" fill="#ed9eaf" /></g></g>)}{particles("leaf", 6)}{particles("water", 6)}</>; break;
    case "frame-naga": ornaments = <>{part("dragon-head", "northeast", "frame-dragon-head", "76px 23px")}{part("dragon-tail", "southwest", "frame-tail", "26px 77px", -1.1)}<g data-part="serpentine-energy-body" className="frame-part frame-coil"><path d="M12 75C-1 61 18 51 9 38S19 11 35 10C52 19 60 -1 77 12" fill="none" stroke={cool} strokeWidth="2.1" /><path d="M12 75C-1 61 18 51 9 38S19 11 35 10C52 19 60 -1 77 12" fill="none" stroke="#d4fff1" strokeWidth=".45" strokeDasharray="1 2" /><path d="M10 68Q4 61 5 57M11 47Q3 40 6 36M19 18Q19 9 24 6M40 11Q47 4 50 7" fill="none" stroke="#e7bb70" strokeWidth="1" /></g>{stream("dragon-scale-current", "M83 22C102 38 84 53 93 66S79 93 62 91C43 83 32 102 18 88", cool, -.8, 1.7)}{particles("ember", 10)}</>; break;
  }
  return <svg className="frame-choreography" data-testid="frame-choreography" data-theme={art.id} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={`${id}-perimeter`}><path d="M0 0H100V100H0ZM50 10A40 40 0 1 0 50 90A40 40 0 1 0 50 10Z" clipRule="evenodd" /></clipPath>
      <clipPath id={`${id}-northwest`}><path d="M0 0H52V17Q24 15 17 49H0Z" /></clipPath>
      <clipPath id={`${id}-northeast`}><path d="M57 0H100V37L89 39Q88 24 69 25Z" /></clipPath>
      <clipPath id={`${id}-jaw`}><path d="M74 13L100 13V26L85 27Z" /></clipPath>
      <clipPath id={`${id}-southeast`}><path d="M100 49V100H46V86Q82 88 85 51Z" /></clipPath>
      <clipPath id={`${id}-southwest`}><path d="M0 62L19 64Q22 80 43 86V100H0Z" /></clipPath>
      <clipPath id={`${id}-east`}><path d="M87 40H100V80H80Z" /></clipPath>
      <clipPath id={`${id}-west`}><path d="M0 20H17V54H0Z" /></clipPath>
      <linearGradient id={`${id}-gold`} x2=".3" y2="1"><stop stopColor="#fff8d5" /><stop offset=".45" stopColor="#ffd471" /><stop offset="1" stopColor="#b96520" /></linearGradient>
      <linearGradient id={`${id}-cool`} x2="1" y2="1"><stop stopColor="#f2fffb" /><stop offset=".4" stopColor="#7af8ec" /><stop offset="1" stopColor="#149ab7" /></linearGradient>
      <linearGradient id={`${id}-fire`} x2=".4" y2="1"><stop stopColor="#ffec96" /><stop offset=".35" stopColor="#ffb62b" /><stop offset="1" stopColor="#ec4923" /></linearGradient>
    </defs>
    <g clipPath={`url(#${id}-perimeter)`}>{ornaments}</g>
  </svg>;
}
