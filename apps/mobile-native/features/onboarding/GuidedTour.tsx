import { usePathname, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollView, Text, View, useColorScheme, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { getTourSteps } from "../../../../lib/onboarding/tour-steps";
import { canUseTour, TOUR_STEP_COUNT, type TourAction, type TourRole, type TourState } from "../../../../lib/onboarding/tour-state";
import idCopy from "../../../../messages/id/onboarding.json";
import enCopy from "../../../../messages/en/onboarding.json";
import { useNativeSession } from "../../auth/session-provider";
import { useNativeAccountContext } from "../../auth/use-account-context";
import { Button } from "../../components/Button";
import type { NativeSessionTransport } from "../../network/transport";
import { nativeTypography } from "../../typography";
import { useDeviceNotificationSettings } from "../../device/notifications-provider";
import { nativeTourState } from "./tour-client";
import { NativeTourEvents } from "./tour-events";

type Listener = ((event: string) => void) | null;

// Keep the Expo navigation tree mounted across session and role transitions.
export function NativeGuidedTour({ children }: { children: ReactNode }) {
  const { transport, revalidating } = useNativeSession();
  const { context } = useNativeAccountContext();
  const path = usePathname();
  const listener = useRef<Listener>(null);
  const report = useCallback((event: string) => listener.current?.(event), []);
  const lastRole = useRef<{ session: NativeSessionTransport; role: TourRole } | null>(null);
  const shared = /^\/(profile|settings)(\/|$)/.test(path);
  const productRole = /^\/tutor(\/|$)/.test(path) ? "tutor" : /^\/(dashboard|courses|calendar|discussions)(\/|$)/.test(path) ? "student" : null;
  const role = productRole ?? (shared ? (lastRole.current?.session === transport ? lastRole.current?.role : undefined) ??
    (context?.roles.includes("tutor") ? "tutor" : "student") : null);
  const eligible = role && context && transport?.isCurrent() && !revalidating &&
    context.accountId === transport.scope.accountId && context.sessionId === transport.scope.sessionId && canUseTour(role, context.roles);
  useLayoutEffect(() => {
    if (eligible && role && transport) lastRole.current = { session: transport, role };
  }, [eligible, role, transport]);
  return <NativeTourEvents.Provider value={eligible ? report : null}>
    {children}
    {eligible && role && transport && context ? <TourRuntime key={JSON.stringify([context.sessionId, context.accountId, role])}
      session={transport} role={role} path={path} locale={context.locale} listener={listener} /> : null}
  </NativeTourEvents.Provider>;
}

const running = new WeakMap<NativeSessionTransport, TourRole>();

type Phase = "idle" | "invitation" | "active" | "finished";
type StepText = { title: string; description: string; instruction: string };

function TourRuntime({ session, role, path, locale, listener }: {
  session: NativeSessionTransport; role: TourRole; path: string; locale: "id" | "en"; listener: { current: Listener };
}) {
  const router = useRouter();
  const copy = locale === "id" ? idCopy : enCopy;
  const root = role === "tutor" ? "/tutor" : "/dashboard";
  const colors = nativeColors[useColorScheme() === "dark" ? "dark" : "light"];
  const push = useDeviceNotificationSettings();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [phase, setPhase] = useState<Phase>("idle");
  const [saved, setSaved] = useState<TourState | null>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [replay, setReplay] = useState(false);
  const attempted = useRef(false);
  const dismissed = useRef(false);
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => { task.current?.abort(); task.current = null; }, []);
  const steps = getTourSteps(role, saved?.courseId ?? null, true);
  const step = steps[saved?.stepIndex ?? 0];
  function move(href?: string) {
    if (href && href !== path && session.isCurrent()) router.navigate(href as Href);
  }
  async function call(action?: TourAction) {
    if (task.current || !session.isCurrent()) return;
    const current = new AbortController();
    const timeout = setTimeout(() => current.abort(), 10_000);
    task.current = current;
    setBusy(true); setError(false);
    try {
      const state = await nativeTourState(session, role, current.signal, action ? { action, generation: saved?.generation ?? 0 } : undefined);
      if (current.signal.aborted || !session.isCurrent()) return;
      setSaved(state);
      if (!action) {
        if (running.get(session) === role && state?.status === "in_progress") setPhase("active");
        return;
      }
      if (action.action === "skip" || state?.status === "skipped") { running.delete(session); dismissed.current = true; setPhase("idle"); return; }
      if (state?.status === "completed") { running.delete(session); setPhase(action.action === "complete" ? "finished" : "idle"); return; }
      if (!state || (action.action === "progress" && state.generation !== saved?.generation)) { setPhase("invitation"); return; }
      running.set(session, role); setReplay(false); setPhase("active");
      const activeStep = getTourSteps(role, state.courseId, true)[state.stepIndex];
      if (activeStep.path) move(activeStep.path);
    } catch {
      if (task.current === current && session.isCurrent()) setError(true);
    } finally {
      clearTimeout(timeout);
      if (task.current === current) { task.current = null; setBusy(false); }
    }
  }
  useEffect(() => {
    if ((path !== root && running.get(session) !== role) || attempted.current) return;
    attempted.current = true;
    void call();
  }, [path, root]);
  useEffect(() => {
    if (path === root && phase === "idle" && saved !== undefined && (!saved || saved.status === "in_progress") && !dismissed.current) setPhase("invitation");
  }, [path, phase, root, saved]);

  function advance() {
    if (phase !== "active" || !saved || busy) return;
    void call(saved.stepIndex === TOUR_STEP_COUNT - 1 ? { action: "complete" } : { action: "progress", stepIndex: saved.stepIndex + 1 });
  }
  useLayoutEffect(() => {
    listener.current = event => {
      if (event === "replay") {
        setReplay(true); setPhase("invitation"); dismissed.current = false;
        if (saved === undefined) void call();
      } else if (phase === "active" && step.id === event) advance();
    };
    return () => { listener.current = null; };
  });
  useEffect(() => {
    // The real course tabs and bottom navigation fulfill routed steps too.
    if (phase === "active" && step.href === path && !busy && !error) advance();
  }, [path, phase, saved?.generation, saved?.stepIndex, busy, error]);

  if (phase === "idle") return null;
  const outline = { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 } as const;
  const selected = copy[role][saved?.courseId ? "course" : "general"] as Record<string, StepText>;
  const text = step.id === "notifications" ? copy.notifications : selected[step.id];
  const resume = !replay && saved?.status === "in_progress";
  const heading = phase === "finished" ? copy.completion.title : phase === "active" ? text.title : resume ? copy.resume.title : copy.invitation[role].title;
  const description = phase === "finished" ? copy.completion.description : phase === "active" ? text.instruction : resume
    ? copy.resume.description.replace("{current}", String((saved?.stepIndex ?? 0) + 1)).replace("{total}", String(TOUR_STEP_COUNT))
    : copy.invitation[role].description.replace("{count}", String(TOUR_STEP_COUNT));
  return <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, bottom: Math.max(12, insets.bottom) + 66, alignItems: "center" }}>
    <ScrollView keyboardShouldPersistTaps="handled" style={{ width: "100%", maxWidth: 480, maxHeight: height * 0.42 }} contentContainerStyle={outline}>
      <Text accessibilityRole="header" style={{ ...nativeTypography.headingBold, fontSize: 16, color: colors.foreground }}>{heading}</Text>
      <Text style={{ ...nativeTypography.bodyRegular, fontSize: 14, color: colors.foreground }}>{description}</Text>
      {phase === "active" && <Text style={{ color: colors.mutedForeground }}>{copy.progress.replace("{current}", String((saved?.stepIndex ?? 0) + 1)).replace("{total}", String(TOUR_STEP_COUNT))}</Text>}
      {error && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{saved === undefined ? copy.error.loadDescription : copy.error.saveDescription}</Text>}
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {phase === "invitation" && <Button testID="native-guided-tour-start" disabled={busy} onPress={() => {
          if (saved === undefined) void call();
          else void call({ action: replay ? "restart" : "start", courseId: saved?.courseId });
        }}>{saved === undefined ? copy.actions.retry : resume ? copy.actions.resume : copy.actions.start}</Button>}
        {phase === "active" && step.href && <Button disabled={busy} onPress={() => move(step.href)}>{text.title}</Button>}
        {error && <Button variant="ghost" disabled={busy} onPress={() => { running.delete(session); dismissed.current = true; setPhase("idle"); }}>{locale === "id" ? "Tutup" : "Close"}</Button>}
        {phase === "active" && error && <Button disabled={busy} onPress={() => { void call(); }}>{copy.actions.retry}</Button>}
        {phase === "active" && step.id !== "notifications" && <Button variant="outline" disabled={busy} onPress={advance}>{copy.actions.skipStep}</Button>}
        {phase === "active" && step.id === "notifications" && push.status && push.status.status !== "prompt" && <Button disabled={busy} onPress={advance}>{copy.actions.done}</Button>}
        {phase === "finished" ? <Button onPress={() => { dismissed.current = true; setPhase("idle"); }}>{copy.actions.done}</Button>
          : <Button testID="native-guided-tour-skip" variant="ghost" disabled={busy} onPress={() => {
            if (saved === undefined || (replay && saved?.status !== "in_progress")) { dismissed.current = true; setPhase("idle"); }
            else void call({ action: "skip" });
          }}>{phase === "active" ? copy.actions.end : copy.actions.skip}</Button>}
      </View>
    </ScrollView>
  </View>;
}
