"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

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
 label: string;
 description: string;
 nodes: PathNode[];
};

const profiles: Profile[] = [
 {
 id: "a",
 label: "Mahasiswa A",
 description: "A kuat di dasar tapi sedang membangun aturan rantai ; konsep Integral sudah terbuka untuk mulai dipelajari.",
 nodes: [
 { name: "Limit", status: "done", score: 95 },
 { name: "Turunan", status: "done", score: 88 },
 { name: "Aturan Rantai", status: "active", score: 54 },
 { name: "Integral", status: "open", score: 31 },
 { name: "Integral Parsial", status: "locked", lockedNote: "kuasai Integral dulu" },
 { name: "Volume Benda Putar", status: "locked", lockedNote: "kuasai Integral Parsial dulu" },
 ],
 },
 {
 id: "b",
 label: "Mahasiswa B",
 description: "B sudah jauh di depan ; jalurnya langsung menargetkan integral parsial, tanpa mengulang yang sudah dikuasai.",
 nodes: [
 { name: "Limit", status: "done", score: 90 },
 { name: "Turunan", status: "done", score: 85 },
 { name: "Aturan Rantai", status: "done", score: 88 },
 { name: "Integral", status: "done", score: 76 },
 { name: "Integral Parsial", status: "active", score: 58 },
 { name: "Volume Benda Putar", status: "locked", lockedNote: "kuasai Integral Parsial dulu" },
 ],
 },
];

const statusLabel: Record<NodeStatus, string> = {
 done: "dikuasai",
 active: "sedang dipelajari",
 open: "terbuka",
 locked: "terkunci",
};

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

function MasteryMiniBar({ node, delay }: { node: PathNode; delay: number }) {
 if (node.score === undefined) {
 return <span className="text-[10px] italic text-muted-foreground/80">{node.lockedNote}</span>;
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
 const [profileId, setProfileId] = useState("a");
 const profile = profiles.find((entry) => entry.id === profileId) ?? profiles[0];

 return (
 <div>
 <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Pilih contoh mahasiswa">
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
 {entry.label}
 </button>
 ))}
 </div>

 <p className="mx-auto mt-3 max-w-xl text-center text-body-sm text-muted-foreground">
 {profile.description}
 </p>

 <div className="mt-10 overflow-x-auto pb-4">
 {/* Key by profile so switching replays the entrance animations. */}
 <div key={profile.id} className="mx-auto flex min-w-[820px] max-w-5xl items-start">
 {profile.nodes.map((node, index) => (
 <div key={node.name} className="flex flex-1 items-start">
 {index > 0 ? (
 <span
 className={cn(
 "landing-bar mt-[21px] h-0.5 flex-1",
 profile.nodes[index - 1].status === "done" ? "bg-status-success/50" : "bg-border",
 )}
 style={{ animationDelay: `${index * 140}ms` }}
 aria-hidden
 />
 ) : null}
 <div
 className="landing-pop flex w-[120px] shrink-0 flex-col items-center gap-2 text-center"
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
 {statusLabel[node.status]}
 </p>
 <MasteryMiniBar node={node} delay={index * 140 + 200} />
 </div>
 </div>
 ))}
 </div>
 </div>
 </div>
 );
}
