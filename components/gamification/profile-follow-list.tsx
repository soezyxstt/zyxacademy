"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { StudentAvatar } from "./student-avatar";
import type { BadgeFamily } from "@/lib/gamification/contracts";
import { useTranslations } from "@/lib/i18n/client";
import { getStudentFollowListAction, removeFollowerAction, unfollowStudentAction } from "@/lib/gamification/social-actions";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";

type Entry = { publicId: string; displayName: string; avatarUrl: string | null; avatarMode: "photo" | "badge"; avatarBadgeId: string | null; badgeTier: number | null; equippedFrameId: string | null; equippedThemeId: string | null };
export function ProfileFollowList() {
 const t = useTranslations("student"); const [direction, setDirection] = useState<"followers" | "following" | null>(null); const [entries, setEntries] = useState<Entry[]>([]); const [cursor, setCursor] = useState<string | null>(null); const [error, setError] = useState(false); const [pending, start] = useTransition();
 const load = (kind: "followers" | "following", next?: string) => { setDirection(kind); if (!next) { setEntries([]); setCursor(null); } start(async () => { try { const result = await getStudentFollowListAction(kind, next); setEntries(old => next ? [...old, ...result.entries] : result.entries); setCursor(result.nextCursor); setError(false); } catch { setError(true); } }); };
 const remove = (id: string) => start(async () => { try { if (direction === "followers") await removeFollowerAction(id); else await unfollowStudentAction(id); setEntries(old => old.filter(x => x.publicId !== id)); } catch { setError(true); } });
 return <section className="space-y-3"><div className="flex gap-2"><Button variant="outline" onClick={() => load("followers")} disabled={pending}>{t("profileCustomization.followers")}</Button><Button variant="outline" onClick={() => load("following")} disabled={pending}>{t("profileCustomization.following")}</Button></div>{error && <p role="alert" className="text-body-xs text-status-error">{t("profileCustomization.error")}</p>}{direction && !pending && !error && !entries.length && <AdminEmptyState icon={Users} title={t("profileCustomization.empty")} className="rounded-xl border bg-card py-6 text-body-sm" />}<div className="divide-y divide-border">{entries.map(entry => <div key={entry.publicId} className="flex items-center justify-between gap-2 py-2"><StudentAvatar name={entry.displayName} image={entry.avatarUrl} publicId={entry.publicId} mode={entry.avatarMode} badge={entry.avatarBadgeId && entry.badgeTier ? {family: entry.avatarBadgeId as BadgeFamily, tier: entry.badgeTier} : null} frameId={entry.equippedFrameId} themeId={entry.equippedThemeId} /><Link className="min-w-0 flex-1 text-body-sm underline" href={`/students/${encodeURIComponent(entry.publicId)}`}>{entry.displayName}</Link><Button size="sm" variant="outline" disabled={pending} onClick={() => remove(entry.publicId)}>{t("profileCustomization.remove")}</Button></div>)}</div>{cursor && direction && <Button variant="outline" disabled={pending} onClick={() => load(direction, cursor)}>{t("profileCustomization.loadMore")}</Button>}</section>;
}
