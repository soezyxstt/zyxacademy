import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useState } from "react";
import { Text, useColorScheme, View } from "react-native";
import { nativeColors } from "../../../../../packages/design-tokens/native-colors";
import { readShown, rememberShown, type ShownCelebration } from "../../../../../lib/gamification/celebration-client-policy";
import type { Celebration } from "../../../../../lib/gamification/celebration-contracts";
import en from "../../../../../messages/en/student.json";
import id from "../../../../../messages/id/student.json";
import { nativeConnectivity, useNativeConnectivity } from "../../../auth/session-provider";
import { Button } from "../../../components/Button";
import type { NativeSessionTransport } from "../../../network/transport";
import { nativeTypography } from "../../../typography";
import { pendingCelebrations } from "./celebration-policy";

const endpoint = "/api/student/gamification/celebrations";
const interval = 60_000;
const historyKey = "zyx.native.celebrations.v1";
const nextPoll = new WeakMap<NativeSessionTransport, number>();
let memory: ShownCelebration[] | undefined;
function history() {
  if (memory) return memory;
  try { return readShown(Storage.getItemSync(historyKey)); } catch { return []; }
}
function remember(account: string, id: string) {
  memory = rememberShown(history(), account, id);
  try { Storage.setItemSync(historyKey, JSON.stringify(memory)); } catch { /* Retain the in-memory history for this process. */ }
}

export function StudentCelebrations({ transport, locale, navigate }: {
  transport: NativeSessionTransport; locale: "id" | "en"; navigate(path: string): void;
}) {
  const { foreground, online } = useNativeConnectivity();
  if (!foreground || online === false) return null;
  return <ActiveCelebrations transport={transport} locale={locale} navigate={navigate} />;
}

type BannerState = { events: Celebration[]; shown(event: Celebration): void };
function ActiveCelebrations({ transport, locale, navigate }: Parameters<typeof StudentCelebrations>[0]) {
  const [banner, setBanner] = useState<BannerState>();
  const strings = locale === "en" ? en : id;
  const account = JSON.stringify([transport.scope.origin, transport.scope.accountId]);
  const theme = useColorScheme() ?? "light";
  const colors = nativeColors[theme];
  const dismiss = useCallback(() => setBanner(undefined), []);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let delay = interval;
    const current = () => !signal.aborted && !stopped && transport.isCurrent() && nativeConnectivity.getSnapshot().foreground;
    async function ack(ids: string[]) {
      if (!ids.length || !current()) return;
      const response = await transport.request(endpoint, { method: "POST", requiredRole: "murid", signal,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) });
      try {
        if (response.status === 401 || response.status === 403) stopped = true;
        if (!response.ok) throw new Error("Unable to acknowledge achievement");
      } finally { response.dispose(); }
    }
    async function poll() {
      if (!current()) return;
      try {
        const response = await transport.request(endpoint, { requiredRole: "murid", signal });
        let payload: unknown;
        try {
          if (response.status === 401 || response.status === 403) { stopped = true; return; }
          if (!response.ok) throw new Error("Unable to load achievements");
          payload = await response.json();
        } finally { response.dispose(); }
        if (!current()) return;
        const { display, acknowledge } = pendingCelebrations(payload, history(), account);
        if (display.length) {
          const presented = new Set<string>();
          setBanner({ events: display, shown(event) {
            if (!current() || presented.has(event.id)) return;
            presented.add(event.id);
            remember(account, event.id);
            void ack([event.id]).catch(() => { /* The next read retries displayed events. */ });
          } });
        }
        if (!display.length) nextPoll.set(transport, Date.now() + interval);
        await ack(acknowledge);
        delay = interval;
      } catch { delay = Math.min(8 * interval, 2 * delay); }
      finally { if (current()) timer = setTimeout(() => void poll(), delay); }
    }
    timer = setTimeout(() => void poll(), Math.max(0, (nextPoll.get(transport) ?? 0) - Date.now()));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [transport, account]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(dismiss, 12000);
    return () => clearTimeout(timer);
  }, [banner, dismiss]);
  if (!banner || !transport.isCurrent()) return null;
  return <View style={{ backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 4 }}>
    {banner.events.map(event => {
      const name = event.kind === "badge" && event.family ? strings.profileCustomization.families[event.family] : event.rank ? strings.celebration.ranks[event.rank] : "";
      const tier = strings.celebration.tiers[String(event.tier) as keyof typeof strings.celebration.tiers];
      const detail = event.kind === "badge" ? `${name} · ${tier} · +${new Intl.NumberFormat(locale).format(event.lp ?? 0)} LP` : name;
      return <Text accessibilityLiveRegion="polite" key={event.id} onLayout={() => banner.shown(event)}
        style={[nativeTypography.bodyRegular, { color: colors.foreground }]}>
        {event.kind === "badge" ? strings.celebration.badgeUnlocked : strings.celebration.rankPromoted}{". "}{detail}
      </Text>;
    })}
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      <Button theme={theme} size="sm" variant="link" onPress={() => { dismiss(); navigate("/achievements"); }}>{strings.celebration.view}</Button>
      <Button theme={theme} size="sm" variant="ghost" onPress={dismiss}>{strings.celebration.dismiss}</Button>
    </View>
  </View>;
}
