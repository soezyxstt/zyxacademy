"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Compass, RotateCcw } from "lucide-react";
import { StudentAccountBoundary, type StudentAccountState } from "@/components/student-account-boundary";
import { useStudentExperience } from "@/components/student-experience-provider";
import { closeDialogsThen } from "@/hooks/use-dialog-history";
import { useViewportMode } from "@/hooks/use-viewport-mode";
import { useTranslations } from "@/lib/i18n/client";
import { isAccountTransitionPending, subscribeAccountTransition } from "@/lib/auth/account-transition-state";
import { acquirePullToRefreshLock } from "@/lib/pull-to-refresh-lock";
import { TOUR_STEP_COUNT, TOUR_VERSION, type TourAction, type TourRole, type TourState } from "@/lib/onboarding/tour-state";
import { findVisibleTourTarget, getTourSteps } from "@/lib/onboarding/tour-steps";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { OnboardingTourContext, useOnboardingTour } from "./tour-context";
import { TourSpotlight } from "./tour-spotlight";

type Props = { children: ReactNode; role: TourRole; courseId?: string | null };
type Phase = "loading" | "idle" | "invitation" | "active";

/** Only nonsecret UI continuity survives a route-group remount. The server owns progress. */
const runningTours = new Set<string>();
const dismissedTours = new Set<string>();
const ROLE_HINT_EVENT = "zyx:tour-role";

function readRoleHint(userId?: string): TourRole | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const role = sessionStorage.getItem(`zyx:tour-role:${userId}`);
    return role === "student" || role === "tutor" ? role : null;
  } catch { return null; }
}

function rememberRole(userId: string, role: TourRole) {
  // A tab-local navigation hint only. API authorization and progress stay on the server.
  try { sessionStorage.setItem(`zyx:tour-role:${userId}`, role); } catch { /* Storage may be unavailable. */ }
  window.dispatchEvent(new Event(ROLE_HINT_EVENT));
}

function subscribeRoleHint(listener: () => void) {
  window.addEventListener(ROLE_HINT_EVENT, listener);
  return () => window.removeEventListener(ROLE_HINT_EVENT, listener);
}

function canOfferTour(path: string, role: TourRole, saved: TourState | null) {
  if (path === (role === "tutor" ? "/tutor" : "/dashboard")) return true;
  if (saved?.status !== "in_progress") return false;
  return path === "/profile" || path === "/settings" || getTourSteps(role, saved.courseId, false).some(step => step.path === path || step.href === path);
}

export function GuidedTourProvider(props: Props) {
  const experience = useStudentExperience();
  if (experience.mode === "demo") return props.children;
  return <StudentAccountBoundary>{account => <AccountTour {...props} account={account} />}</StudentAccountBoundary>;
}

function AccountTour({ children, role, courseId, account }: Props & { account: StudentAccountState }) {
  const pathname = usePathname();
  const transitioning = useSyncExternalStore(subscribeAccountTransition, isAccountTransitionPending, () => false);
  const user = account.data?.user;
  const rememberedRole = useSyncExternalStore(subscribeRoleHint, () => readRoleHint(user?.id), () => null);
  const roles = user ? [user.role, ...(user.roles ?? [])] : [];
  const sharedPreferences = pathname === "/settings" || pathname.startsWith("/settings/") || pathname === "/profile";
  const runningRole = user && runningTours.has(`${user.id}:student`) ? "student" : user && runningTours.has(`${user.id}:tutor`) ? "tutor" : null;
  const rememberedRoleAllowed = rememberedRole && roles.some(value => rememberedRole === "tutor" ? value === "tutor" || value === "teacher" : value === "student" || value === "murid");
  const resolvedRole = sharedPreferences ? runningRole ?? (rememberedRoleAllowed ? rememberedRole : null) ?? (roles.some(value => value === "tutor" || value === "teacher") ? "tutor" : role) : role;
  const eligible = user && !roles.includes("admin") && !pathname.startsWith("/admin") &&
    roles.some(value => resolvedRole === "tutor" ? value === "tutor" || value === "teacher" : value === "student" || value === "murid");
  useEffect(() => {
    if (eligible && !sharedPreferences && !transitioning && !account.isPending) rememberRole(user.id, role);
  }, [eligible, sharedPreferences, transitioning, account.isPending, user?.id, role]);
  if (account.isPending || transitioning) {
    return <OnboardingTourContext.Provider value={{ blocking: true, active: false, available: false, restart: () => {} }}>{children}</OnboardingTourContext.Provider>;
  }
  if (!eligible) return children;
  return <GuidedTourFlow key={`${user.id}:${resolvedRole}`} userId={user.id} role={resolvedRole} candidateCourseId={courseId}>{children}</GuidedTourFlow>;
}

/** The real tour runtime also powers deterministic visual fixtures. */
export function GuidedTourFlow({ children, role, userId, candidateCourseId = null }: {
  children: ReactNode;
  role: TourRole;
  userId: string;
  candidateCourseId?: string | null;
}) {
  const t = useTranslations("onboarding");
  const pathname = usePathname();
  const router = useRouter();
  const mobile = useViewportMode() === "mobile";
  const identity = `${userId}:${role}`;
  const [phase, setPhase] = useState<Phase>("loading");
  const [state, setState] = useState<TourState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"load" | "save" | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [revealCopy, setRevealCopy] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [targetAttempt, setTargetAttempt] = useState(0);
  const mounted = useRef(true);
  const writing = useRef(false);
  const currentState = useRef(state);
  currentState.current = state;
  const replay = useRef(false);
  const pendingRetry = useRef<(() => void) | null>(null);
  const currentPath = useRef(pathname);
  currentPath.current = pathname;
  const active = phase === "active";
  const steps = useMemo(() => getTourSteps(role, state?.courseId ?? null, mobile), [role, state?.courseId, mobile]);
  const stepIndex = state?.stepIndex ?? 0;
  const step = steps[stepIndex];
  const stepKey = `${role}.${state?.courseId ? "course" : "general"}.${step.id}`;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { controller.abort(); setError("load"); setPhase(replay.current ? "invitation" : "idle"); }, 8_000);
    void fetch(`/api/onboarding/tour?role=${role}`, { headers: { "x-user-id": userId }, cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("tour-load");
        return response.json() as Promise<{ state: TourState | null }>;
      })
      .then(result => {
        if (controller.signal.aborted || isAccountTransitionPending()) return;
        clearTimeout(timeout);
        setState(result.state);
        setError(null);
        if (result.state?.status === "completed" || result.state?.status === "skipped") {
          runningTours.delete(identity);
          setPhase(replay.current ? "invitation" : "idle");
        } else if (runningTours.has(identity) && result.state?.status === "in_progress") {
          setPhase("active");
        } else {
          setPhase(!dismissedTours.has(identity) && (canOfferTour(currentPath.current, role, result.state) || replay.current) ? "invitation" : "idle");
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        clearTimeout(timeout);
        // A failed read never turns an unknown account state into a first visit.
        setError("load");
        setPhase(replay.current ? "invitation" : "idle");
      });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [identity, loadAttempt, role, userId]);

  useEffect(() => {
    if (phase === "idle" && (!state || state.status === "in_progress") && !error && !dismissedTours.has(identity) && !runningTours.has(identity) && canOfferTour(pathname, role, state)) setPhase("invitation");
  }, [phase, state, error, identity, pathname, role]);

  const mutate = useCallback(async (action: TourAction, generation: number): Promise<TourState | null | undefined> => {
    if (writing.current || isAccountTransitionPending()) return undefined;
    writing.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/onboarding/tour", {
        method: "PUT",
        headers: { "content-type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ role, version: TOUR_VERSION, generation, ...action }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("tour-save");
      const result = await response.json() as { state: TourState | null };
      if (!mounted.current || isAccountTransitionPending()) return undefined;
      currentState.current = result.state;
      setState(result.state);
      if ((action.action === "progress" || action.action === "complete") && result.state?.generation !== generation) {
        runningTours.delete(identity);
        setPhase(result.state?.status === "in_progress" ? "invitation" : "idle");
      }
      setError(null);
      pendingRetry.current = null;
      return result.state;
    } catch {
      if (mounted.current) setError("save");
      return undefined;
    } finally {
      writing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [identity, role, userId]);

  const start = async () => {
    dismissedTours.delete(identity);
    const action: TourAction = { action: replay.current ? "restart" : "start", courseId: candidateCourseId };
    pendingRetry.current = () => void start();
    const saved = await mutate(action, state?.generation ?? 0);
    if (!saved || dismissedTours.has(identity)) return;
    replay.current = false;
    if (saved.status === "in_progress") {
      runningTours.delete(`${userId}:${role === "student" ? "tutor" : "student"}`);
      runningTours.add(identity);
      rememberRole(userId, role);
      closeDialogsThen(() => setPhase("idle"), () => { if (mounted.current && !dismissedTours.has(identity)) setPhase("active"); });
    } else setPhase("idle");
  };

  const skip = async () => {
    // Exiting is always available, including offline and during a pending save.
    dismissedTours.add(identity);
    runningTours.delete(identity);
    setPhase("idle");
    if (writing.current) {
      // Serialize a skip behind the already-started write without blocking exit.
      const waitForWrite = window.setInterval(() => {
        if (!mounted.current || !writing.current) { clearInterval(waitForWrite); if (mounted.current) void skip(); }
      }, 100);
      return;
    }
    const saved = await mutate({ action: "skip" }, currentState.current?.generation ?? 0);
    if (saved === undefined && mounted.current) toast.error(t("error.saveTitle"), { description: t("error.exitDescription") });
  };

  const advance = async (href?: string) => {
    const nextAction: TourAction = stepIndex === TOUR_STEP_COUNT - 1 ? { action: "complete" } : { action: "progress", stepIndex: stepIndex + 1 };
    pendingRetry.current = () => void advance(href);
    const generation = state?.generation ?? 0;
    const saved = await mutate(nextAction, generation);
    if (!saved || dismissedTours.has(identity)) return;
    // An older tab must not navigate or complete a newer tour run.
    if (saved.generation !== generation) return;
    if (href) document.dispatchEvent(new Event("zyx:tour-navigate"));
    if (saved.status !== "in_progress") {
      runningTours.delete(identity);
      setPhase("idle");
      if (saved.status === "completed") toast.success(t("completion.title"), { description: t("completion.description") });
    }
    if (href) router.push(href);
  };

  // Prepare once per step. The target's own click, not a route change, advances it.
  useEffect(() => {
    if (!active || !step.path) return;
    if (currentPath.current !== step.path) router.push(step.path);
  }, [active, step.path, stepIndex, router, targetAttempt]);

  useEffect(() => {
    if (!active) return;
    return acquirePullToRefreshLock("onboarding-tour");
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    let cancelled = false;
    let missingSince = Date.now();
    const resolve = () => {
      if (cancelled) return;
      const actual = findVisibleTourTarget(step.selector);
      let nextTarget = actual;
      let nextCopy: string | null = null;
      if (!actual) {
        for (const reveal of step.reveal ?? []) {
          const candidate = findVisibleTourTarget(reveal.selector);
          if (candidate && candidate.getAttribute("aria-expanded") !== "true") {
            nextTarget = candidate;
            nextCopy = reveal.copy;
            break;
          }
        }
      }
      if (nextTarget) missingSince = Date.now();
      setTarget(previous => previous === nextTarget ? previous : nextTarget);
      setRevealCopy(previous => previous === nextCopy ? previous : nextCopy);
      setUnavailable(!nextTarget && Date.now() - missingSince > 8_000);
    };
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(resolve, 250);
    window.addEventListener("resize", resolve);
    return () => { cancelled = true; observer.disconnect(); clearInterval(timer); window.removeEventListener("resize", resolve); };
  }, [active, step, pathname, targetAttempt]);

  const restart = () => {
    if (busy || active) return;
    replay.current = true;
    dismissedTours.delete(identity);
    setError(null);
    setPhase("invitation");
    if (error === "load") setLoadAttempt(value => value + 1);
  };
  const retry = () => {
    if (error === "save" && pendingRetry.current) pendingRetry.current();
    else if (error === "load") { setPhase("loading"); setLoadAttempt(value => value + 1); }
    else { setUnavailable(false); setTargetAttempt(value => value + 1); }
  };
  const inviteTitle = error ? t(`error.${error}Title`) : state?.status === "in_progress" && !replay.current ? t("resume.title") : t(`invitation.${role}.title`);
  const inviteDescription = error ? t(`error.${error}Description`) : state?.status === "in_progress" && !replay.current ? t("resume.description", { current: stepIndex + 1, total: TOUR_STEP_COUNT }) : t(`invitation.${role}.description`, { count: TOUR_STEP_COUNT });

  return <OnboardingTourContext.Provider value={{ active, blocking: phase !== "idle", available: true, restart }}>
    {children}
    <Dialog open={phase === "invitation"} onOpenChange={open => { if (!open) void skip(); }}>
      <DialogContent className="max-w-md" onPointerDownOutside={event => event.preventDefault()}>
        <div className="mb-1 flex size-11 items-center justify-center rounded-xl border border-border bg-muted text-foreground"><Compass className="size-5" aria-hidden="true" /></div>
        <DialogHeader>
          <DialogTitle>{inviteTitle}</DialogTitle>
          <DialogDescription>{inviteDescription}</DialogDescription>
        </DialogHeader>
        {!error && <p className="text-body-xs leading-relaxed text-muted-foreground">{t("invitation.choiceHint")}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void skip()}>{t("actions.skip")}</Button>
          <Button disabled={busy} onClick={() => error ? retry() : void start()}>{error ? t("actions.retry") : state?.status === "in_progress" && !replay.current ? t("actions.resume") : t("actions.start")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {active && <TourSpotlight
      target={error ? null : target}
      step={stepIndex}
      total={TOUR_STEP_COUNT}
      title={t(`${stepKey}.title`)}
      description={t(`${stepKey}.description`)}
      instruction={revealCopy ? t(`${revealCopy}.instruction`, { label: t(`${stepKey}.title`) }) : t(`${stepKey}.instruction`)}
      progressLabel={t("progress", { current: stepIndex + 1, total: TOUR_STEP_COUNT })}
      skipLabel={t("actions.end")}
      loadingLabel={t("loading")}
      unavailableLabel={error ? t("error.saveDescription") : t("recovery.description")}
      retryLabel={t("actions.retry")}
      unavailable={unavailable || Boolean(error)}
      busy={busy}
      onSkip={() => void skip()}
      onRetry={retry}
      onTargetActivate={event => {
        if (revealCopy) return;
        if (step.href) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        void advance(step.href);
      }}
    />}
  </OnboardingTourContext.Provider>;
}

export function ReplayGuidedTour() {
  const tour = useOnboardingTour();
  const t = useTranslations("onboarding");
  if (!tour.available) return null;
  return <Button variant="outline" onClick={tour.restart} disabled={tour.blocking}><RotateCcw className="size-4" aria-hidden="true" />{t("actions.replay")}</Button>;
}
