"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

type NodeStatus = "done" | "active" | "open" | "locked";

type PathNode = {
 name: string;
 status: NodeStatus;
 /** Mastery 0-100; omitted for locked nodes. */
 score?: number;
 lockedNote?: string;
};

type Profile = {
 id: string;
 labelKey: string;
 nodes: PathNode[];
};

const profiles: Profile[] = [
 {
 id: "a",
 labelKey: "home.path.profileA",
 nodes: [
 { name: "Limit", status: "done", score: 95 },
 { name: "Turunan", status: "done", score: 88 },
 { name: "Aturan Rantai", status: "active", score: 54 },
 { name: "Integral", status: "open", score: 31 },
 { name: "Integral Parsial", status: "locked", lockedNote: "Integral" },
 { name: "Volume Benda Putar", status: "locked", lockedNote: "Integral Parsial" },
 ],
 },
 {
 id: "b",
 labelKey: "home.path.profileB",
 nodes: [
 { name: "Limit", status: "done", score: 90 },
 { name: "Turunan", status: "done", score: 85 },
 { name: "Aturan Rantai", status: "done", score: 88 },
 { name: "Integral", status: "done", score: 76 },
 { name: "Integral Parsial", status: "active", score: 58 },
 { name: "Volume Benda Putar", status: "locked", lockedNote: "Integral Parsial" },
 ],
 },
];

function NodeCircle({ status }: { status: NodeStatus }) {
 return (
 <span
 className={cn(
 "flex size-11 items-center justify-center rounded-full border-2 bg-background transition-colors",
 status === "done" && "border-status-success bg-status-success/10 text-status-success",
 status === "active" &&
 "border-primary bg-primary/10 text-primary ring-4 ring-primary/15 motion-safe:animate-pulse",
 status === "open" && "border-border-strong text-muted-foreground",
 status === "locked" && "border-border bg-muted/30 text-muted-foreground/70",
 )}
 aria-hidden
 >
 {status === "done" ? (
 <Check className="size-4.5" />
 ) : status === "locked" ? (
 <Lock className="size-4" />
 ) : status === "active" ? (
 <span className="size-3 rounded-full bg-primary" />
 ) : (
 <span className="size-2.5 rounded-full bg-border-strong" />
 )}
 </span>
 );
}

function MasteryMiniBar({ node, delay, lockedNote }: { node: PathNode; delay: number; lockedNote: string }) {
 if (node.score === undefined) {
 return <span className="text-body-xs text-muted-foreground">{lockedNote}</span>;
 }
 return (
 <span className="flex w-full items-center gap-1.5">
 <span className="h-1.5 flex-1 overflow-hidden rounded-md bg-muted">
 <span
 className={cn(
 "landing-bar block h-full rounded-md",
 node.score >= 70
 ? "bg-status-success"
 : node.score >= 40
 ? "bg-status-warning"
 : "bg-status-error",
 )}
 style={{ width: `${node.score}%`, animationDelay: `${delay}ms` }}
 />
 </span>
 <span className="font-mono text-[10px] font-semibold text-muted-foreground">{node.score}</span>
 </span>
 );
}

/**
 * Personalized study-path visualization with a Mahasiswa A/B switcher proving
 * two students get different journeys. Connectors and bars animate in via the
 * shared [data-visible] CSS hooks (the section wraps this in LandingVisible).
 */
export function MasteryPathDemo() {
 const t = useTranslations("marketing");
 const [profileId, setProfileId] = useState("a");
 const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0];

 return (
 <div>
 <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label={t("home.path.profileLabel")}>
 {profiles.map((entry) => (
 <button
 key={entry.id}
 type="button"
 onClick={() => setProfileId(entry.id)}
 aria-pressed={profileId === entry.id}
 className={cn(
 "rounded-md border px-3.5 py-1.5 text-body-sm font-semibold transition-colors",
 profileId === entry.id
 ? "border-primary bg-primary text-primary-foreground"
 : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
 )}
 >
 {t(entry.labelKey)}
 </button>
 ))}
 </div>

 <div className="mt-8">
 {/* Key by profile so switching replays the entrance animations. */}
 <div key={profile.id} className="mx-auto grid max-w-5xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:flex lg:items-start lg:gap-0">
 {profile.nodes.map((node, index) => (
 <div key={node.name} className="flex min-w-0 flex-1 items-start justify-center">
 {index > 0 ? (
 <span
 className={cn(
 "landing-bar mt-[21px] hidden h-0.5 flex-1 lg:block",
 profile.nodes[index - 1].status === "done" ? "bg-status-success/50" : "bg-border",
 )}
 style={{ animationDelay: `${index * 140}ms` }}
 aria-hidden
 />
 ) : null}
 <div
 className="landing-pop flex w-full max-w-[160px] flex-col items-center gap-2 text-center lg:w-[120px] lg:shrink-0"
 style={{ animationDelay: `${index * 140 + 80}ms` }}
 >
 <NodeCircle status={node.status} />
 <p
 className={cn(
 "font-heading text-body-sm font-semibold leading-tight",
 node.status === "locked" ? "text-muted-foreground/80" : "text-foreground",
 )}
 >
 {node.name}
 </p>
 <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
 {t(`home.path.status.${node.status}`)}
 </p>
 <MasteryMiniBar node={node} delay={index * 140 + 200} lockedNote={t("home.path.lockedNote", { topic: node.lockedNote ?? node.name })} />
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
