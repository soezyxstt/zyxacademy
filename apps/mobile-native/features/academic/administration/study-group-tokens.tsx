import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useProtectedInteraction } from "../../../routing/protected-interaction";
import type { AcademicTransport } from "../client";
import { CopyActivationToken } from "./group-deletion";
import { readStudyGroupTokens } from "./study-group-tokens-client";
import { Action, Ink, layout } from "./ui";

type Result = Awaited<ReturnType<typeof readStudyGroupTokens>>;

export function StudyGroupTokens({ id, transport, denied }: { id: string; transport: AcademicTransport; denied(): void }) {
  const [attempt, setAttempt] = useState(0);
  const focused = useIsFocused();
  const { canInteract, suspended } = useProtectedInteraction();
  if (!focused || suspended) return null;
  return <StudyGroupTokensRead key={attempt} {...{ id, transport, denied, canInteract }} retry={() => setAttempt(value => value + 1)} />;
}

function StudyGroupTokensRead({ id, transport, denied, canInteract, retry }: {
  id: string; transport: AcademicTransport; denied(): void; canInteract(): boolean; retry(): void;
}) {
  const [result, setResult] = useState<{ id: string; transport: AcademicTransport; value: Result }>();
  const value = result?.id === id && result.transport === transport ? result.value : undefined;
  const en = transport.locale === "en";
  useEffect(() => {
    const controller = new AbortController();
    void readStudyGroupTokens(transport, id, controller.signal).then((value) => {
      if (controller.signal.aborted) return;
      setResult({ id, transport, value });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ id, transport, value: { status: "error" } });
    });
    return () => controller.abort();
  }, [id, transport]);

  useEffect(() => {
    if (value?.status === "denied") denied();
  }, [value, denied]);

  if (value?.status === "denied") return null;
  return <View style={layout.compact}>
    <Ink kind="strong">{en ? "Activation tokens" : "Token aktivasi"}</Ink>
    {!value ? <Ink>{en ? "Loading tokens…" : "Memuat token…"}</Ink> : null}
    {value?.status === "error" ? <View style={layout.row}>
      <Ink>{en ? "Could not load tokens." : "Token belum dapat dimuat."}</Ink>
      <Action label={en ? "Try again" : "Coba lagi"} onPress={retry} />
    </View> : null}
    {value?.status === "missing" ? <Ink>{en ? "Study group unavailable." : "Kelompok tidak tersedia."}</Ink> : null}
    {value?.status === "ready" && !value.tokens.length ? <Ink>{en ? "No activation tokens." : "Belum ada token aktivasi."}</Ink> : null}
    {value?.status === "ready" ? value.tokens.map((item, index) => <View key={item.id} style={layout.row}>
      <View style={layout.flex}>
        <Ink kind="strong">{item.token}</Ink>
        <Ink kind="meta">{`${en ? "Capacity" : "Kapasitas"} ${item.capacity}`}</Ink>
      </View>
      <CopyActivationToken value={item.token} locale={transport.locale}
        label={`${en ? "Copy token" : "Salin token"} ${index + 1}`} canCopy={canInteract} />
    </View>) : null}
  </View>;
}
