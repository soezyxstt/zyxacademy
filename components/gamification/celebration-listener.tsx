"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import { BadgeArtwork, RankArtwork } from "./artwork";
import { rankLabels } from "@/lib/gamification/labels";
import type { Celebration } from "@/lib/gamification/celebration-contracts";
import { readShown, rememberShown, wasShown, type ShownCelebration } from "@/lib/gamification/celebration-client-policy";

const KEY = "zyx-celebrations-shown-v1";
const ENDPOINT = "/api/student/gamification/celebrations";
const INTERVAL = 60_000;
const memory: ShownCelebration[] = [];
function readHistory() { try { return readShown(localStorage.getItem(KEY)); } catch { return memory; } }
function saveHistory(history: ShownCelebration[]) { memory.splice(0, memory.length, ...history); try { localStorage.setItem(KEY, JSON.stringify(history)); } catch {} }

export function CelebrationListener() {
  const { data: session, isPending } = useSession();
  const experience = useStudentExperience();
  const pathname = usePathname();
  const t = useTranslations("student");
  const { locale } = useAppLocale();
  const user = session?.user as { id?: string; role?: string | null; roles?: string[] | null } | undefined;
  const roles = [user?.role, ...(user?.roles ?? [])];
  const eligible = !isPending && experience.mode === "student" && !!user?.id && !roles.some(role => role === "admin" || role === "tutor" || role === "teacher") && !/^\/(admin|tutor|demo)(\/|$)/.test(pathname);
  const latest = useRef({ t, locale });
  latest.current = { t, locale };
  const refresh = useRef<() => void>(() => {});
  const identity = useRef<string | null>(null);
  identity.current = eligible ? user?.id ?? null : null;

  useEffect(() => {
    if (!eligible || !user?.id) return;
    const userId = user.id;
    let active = true, stopped = false, inFlight = false, lastAttempt = 0, delay = INTERVAL;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const activeToasts = new Set<string>();
    const schedule = () => { clearTimeout(timer); if (active && !stopped && !document.hidden) timer = setTimeout(run, delay); };
    const work = async () => {
      const response = await fetch(ENDPOINT, { signal: controller!.signal, cache: "no-store" });
      if (response.status === 401 || response.status === 403) { stopped = true; return; }
      if (!response.ok) throw new Error("fetch failed");
      const body = await response.json();
      if (!active || identity.current !== userId || document.hidden) return;
      const events: Celebration[] = Array.isArray(body.celebrations) ? body.celebrations.slice(0, 10) : [];
      let history = readHistory();
      const ack: string[] = [];
      let shown = 0;
      for (const event of events) {
        if (!event || typeof event.id !== "string") continue;
        if (wasShown(history, userId, event.id)) { ack.push(event.id); continue; }
        if (shown >= 3) continue;
        if (event.kind === "badge" && (!event.family || !event.tier || event.tier < 1 || event.tier > 5 || typeof event.lp !== "number")) continue;
        if (event.kind === "rank" && (!event.rank || event.rank === "rakyat")) continue;
        if (event.kind !== "rank" && event.kind !== "badge") continue;
        const { t, locale } = latest.current;
        const label = event.kind === "badge" ? t(`profileCustomization.families.${event.family}`) : rankLabels[event.rank!];
        const tier = event.tier ? t(`celebration.tiers.${event.tier}`) : "";
        const toastId = `celebration:${userId}:${event.id}`;
        activeToasts.add(toastId);
        toast.custom((id) => <div className="flex w-full max-w-sm items-center gap-3 rounded-xl border bg-card p-3 text-foreground shadow-lg" role="status">
          {event.kind === "badge" && event.family && event.tier ? <BadgeArtwork family={event.family} tier={event.tier} size={56} /> : event.rank ? <RankArtwork rank={event.rank} size={56} /> : null}
          <div className="min-w-0 flex-1"><p className="text-body-sm font-semibold">{t(event.kind === "badge" ? "celebration.badgeUnlocked" : "celebration.rankPromoted")}</p><p className="text-body-sm">{label}{tier && ` · ${tier}`}{event.kind === "badge" && ` · +${new Intl.NumberFormat(locale).format(event.lp ?? 0)} LP`}</p><Button asChild size="sm" variant="link" className="h-auto p-0"><Link href="/achievements" onClick={() => toast.dismiss(id)}>{t("celebration.view")}</Link></Button></div>
          <Button size="icon" variant="ghost" aria-label={t("celebration.dismiss")} onClick={() => toast.dismiss(id)}><X className="size-4" /></Button>
        </div>, { id: toastId, duration: 12000 });
        history = rememberShown(history, userId, event.id); saveHistory(history); ack.push(event.id); shown++;
      }
      if (ack.length && active && identity.current === userId && !document.hidden) {
        const result = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: ack }), signal: controller!.signal });
        if (result.status === 401 || result.status === 403) { stopped = true; return; }
        if (!result.ok) throw new Error("ack failed");
      }
    };
    async function run() {
      if (!active || stopped || document.hidden || inFlight) return;
      inFlight = true; lastAttempt = Date.now(); controller = new AbortController();
      try {
        if (navigator.locks) await navigator.locks.request(`zyx-celebrations:${userId}`, { signal: controller.signal }, async lock => { if (lock && active && !document.hidden) await work(); });
        else await work();
        delay = INTERVAL;
      } catch { if (!controller.signal.aborted) delay = Math.min(delay * 2, 8 * INTERVAL); }
      finally { inFlight = false; schedule(); }
    }
    const trigger = () => { if (Date.now() - lastAttempt >= delay) void run(); };
    refresh.current = trigger;
    const visibility = () => { if (document.hidden) { clearTimeout(timer); controller?.abort(); } else { trigger(); schedule(); } };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", trigger);
    window.addEventListener("pointerdown", trigger, { passive: true });
    window.addEventListener("keydown", trigger);
    void run();
    return () => { active = false; clearTimeout(timer); controller?.abort(); for (const id of activeToasts) toast.dismiss(id); refresh.current = () => {}; document.removeEventListener("visibilitychange", visibility); window.removeEventListener("focus", trigger); window.removeEventListener("pointerdown", trigger); window.removeEventListener("keydown", trigger); };
  }, [eligible, user?.id]);
  useEffect(() => { refresh.current(); }, [pathname]);
  return null;
}
